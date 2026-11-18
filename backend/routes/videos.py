"""
Vídeos gravados no teleprompter + edição automática (ffmpeg).

Edição: recorte 9:16 (1080x1920), H.264/AAC (formato aceito pelo Meta), gancho no
topo nos primeiros segundos e legendas queimadas a partir do roteiro.
"""
import asyncio
import json
import os
import re
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from motor.motor_asyncio import AsyncIOMotorDatabase

from services.db import get_db
from services.security import get_current_user, decode_token

router = APIRouter(prefix="/api", tags=["videos"])

MEDIA_DIR = Path(os.environ.get("MEDIA_DIR", Path(__file__).resolve().parent.parent / "media"))
MAX_BYTES = 200 * 1024 * 1024
FFMPEG = shutil.which("ffmpeg") or "ffmpeg"
FFPROBE = shutil.which("ffprobe") or "ffprobe"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _run(*args, cwd=None) -> tuple[int, str]:
    proc = await asyncio.create_subprocess_exec(*args, cwd=cwd, stdout=asyncio.subprocess.PIPE,
                                                stderr=asyncio.subprocess.PIPE)
    out, err = await proc.communicate()
    return proc.returncode, (out or b"").decode("utf-8", "ignore") + (err or b"").decode("utf-8", "ignore")


async def _duration(path: Path) -> float:
    code, out = await _run(FFPROBE, "-v", "error", "-show_entries", "format=duration", "-of", "json", str(path))
    try:
        return float(json.loads(out[out.index("{"):])["format"]["duration"])
    except Exception:
        return 0.0


def _ts(sec: float) -> str:
    sec = max(sec, 0)
    h, rem = divmod(sec, 3600)
    m, s = divmod(rem, 60)
    return f"{int(h)}:{int(m):02d}:{s:05.2f}"


def _clean(text: str) -> str:
    # remove marcações de cena tipo [corte], (sorrindo) e quebras
    text = re.sub(r"\[[^\]]*\]|\([^)]*\)", " ", text or "")
    return re.sub(r"\s+", " ", text).strip()


def build_ass(script: str, hook: str, duration: float, words_per_chunk: int = 4) -> str:
    """Legendas a partir do roteiro, com tempo proporcional ao tamanho de cada trecho."""
    words = _clean(script).split()
    chunks = [" ".join(words[i:i + words_per_chunk]) for i in range(0, len(words), words_per_chunk)]
    start, end = min(0.4, duration * 0.05), max(duration - 0.3, 0.5)
    total = sum(len(c) for c in chunks) or 1
    lines, t = [], start
    for c in chunks:
        d = (end - start) * len(c) / total
        txt = c.replace("{", "(").replace("}", ")")
        lines.append(f"Dialogue: 0,{_ts(t)},{_ts(t + d)},Cap,,0,0,0,,{txt.upper()}")
        t += d
    if hook:
        h = _clean(hook).replace("{", "(").replace("}", ")")
        lines.insert(0, f"Dialogue: 1,{_ts(0)},{_ts(min(3.0, duration))},Hook,,0,0,0,,{h}")
    return "\n".join([
        "[Script Info]", "ScriptType: v4.00+", "PlayResX: 1080", "PlayResY: 1920", "WrapStyle: 0", "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        "Style: Cap,DejaVu Sans,74,&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,6,2,2,80,80,420,1",
        "Style: Hook,DejaVu Sans,64,&H00FFFFFF,&H00FFFFFF,&H00F6823B,&H00F6823B,-1,0,0,0,100,100,0,0,3,18,0,8,90,90,220,1",
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
        *lines, "",
    ])


async def edit_video(folder: Path, raw: Path, script: str, hook: str, captions: bool) -> dict:
    dur = await _duration(raw)
    if dur <= 0:
        raise HTTPException(status_code=400, detail="Não foi possível ler o vídeo gravado.")
    vf = "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30"
    if captions and (script or hook):
        (folder / "subs.ass").write_text(build_ass(script, hook, dur), encoding="utf-8")
        vf += ",subtitles=subs.ass"  # caminho relativo (cwd=folder) evita escapes no filtro
    code, out = await _run(FFMPEG, "-y", "-i", raw.name, "-vf", vf, "-c:v", "libx264", "-preset", "veryfast",
                           "-crf", "23", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-ar", "44100",
                           "-movflags", "+faststart", "final.mp4", cwd=str(folder))
    if code != 0:
        raise HTTPException(status_code=500, detail=f"Falha na edição do vídeo: {out[-300:]}")
    await _run(FFMPEG, "-y", "-ss", str(min(1.0, dur / 2)), "-i", "final.mp4", "-frames:v", "1", "-q:v", "3",
               "thumb.jpg", cwd=str(folder))
    return {"duration": round(dur, 1)}


def _public(v: dict) -> dict:
    return {k: v.get(k) for k in ("id", "journey_id", "criativo_index", "title", "duration", "captions", "status", "created_at")}


@router.post("/journey/{jid}/videos")
async def upload_video(jid: str, request: Request, idx: int = 0, captions: bool = True,
                       user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    """Recebe o vídeo bruto (corpo binário) e devolve o vídeo editado."""
    j = await db.journeys.find_one({"id": jid, "user_id": user["id"]}, {"_id": 0, "deliverables.criativos": 1})
    if not j:
        raise HTTPException(status_code=404, detail="Jornada não encontrada")
    crs = ((j.get("deliverables") or {}).get("criativos") or {}).get("criativos") or []
    cr = crs[idx] if 0 <= idx < len(crs) else {}
    vid = str(uuid.uuid4())
    folder = MEDIA_DIR / vid
    folder.mkdir(parents=True, exist_ok=True)
    ctype = request.headers.get("content-type", "")
    raw = folder / ("raw.mp4" if "mp4" in ctype else "raw.webm")
    size = 0
    with raw.open("wb") as f:
        async for chunk in request.stream():
            size += len(chunk)
            if size > MAX_BYTES:
                f.close()
                shutil.rmtree(folder, ignore_errors=True)
                raise HTTPException(status_code=413, detail="Vídeo maior que 200 MB.")
            f.write(chunk)
    if size < 1000:
        shutil.rmtree(folder, ignore_errors=True)
        raise HTTPException(status_code=400, detail="Vídeo vazio.")
    script = cr.get("roteiro") or cr.get("roteiro_ou_texto") or ""
    hook = cr.get("gancho") or ""
    try:
        meta = await edit_video(folder, raw, script, hook, captions)
    except Exception:
        shutil.rmtree(folder, ignore_errors=True)
        raise
    raw.unlink(missing_ok=True)
    doc = {"id": vid, "user_id": user["id"], "journey_id": jid, "criativo_index": idx,
           "title": cr.get("titulo") or f"Vídeo {idx + 1}", "captions": captions, "status": "ready",
           "duration": meta["duration"], "created_at": _now()}
    await db.videos.insert_one(dict(doc))
    return _public(doc)


@router.get("/journey/{jid}/videos")
async def list_videos(jid: str, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    cur = db.videos.find({"journey_id": jid, "user_id": user["id"]}, {"_id": 0}).sort("created_at", -1)
    return [_public(v) async for v in cur]


@router.delete("/videos/{vid}")
async def delete_video(vid: str, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    res = await db.videos.delete_one({"id": vid, "user_id": user["id"]})
    if res.deleted_count:
        shutil.rmtree(MEDIA_DIR / vid, ignore_errors=True)
    return {"ok": True}


@router.get("/videos/{vid}/{kind}")
async def video_file(vid: str, kind: str, token: str = "", db: AsyncIOMotorDatabase = Depends(get_db)):
    """Arquivo do vídeo/miniatura. Token via query porque <video> não envia header."""
    if kind not in ("file", "thumb"):
        raise HTTPException(status_code=404)
    try:
        uid = decode_token(token)["sub"]
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido")
    v = await db.videos.find_one({"id": vid, "user_id": uid}, {"_id": 0, "id": 1})
    if not v:
        raise HTTPException(status_code=404)
    path = MEDIA_DIR / vid / ("final.mp4" if kind == "file" else "thumb.jpg")
    if not path.exists():
        raise HTTPException(status_code=404)
    return FileResponse(path, media_type="video/mp4" if kind == "file" else "image/jpeg")


async def ready_videos(db, user_id: str, jid: str) -> list[dict]:
    """Vídeos prontos da jornada, com caminhos locais (para a publicação no Meta)."""
    out = []
    async for v in db.videos.find({"journey_id": jid, "user_id": user_id, "status": "ready"}, {"_id": 0}).sort("created_at", 1):
        f = MEDIA_DIR / v["id"]
        if (f / "final.mp4").exists():
            out.append({**v, "path": f / "final.mp4", "thumb": f / "thumb.jpg"})
    return out
