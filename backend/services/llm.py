"""
Camada central de LLM — configurável pelo admin.

Dois modos:
- "emergent" (PADRÃO): usa a chave interna da Emergent com os MESMOS modelos de
  antes. NÃO há seleção de modelo — é um passthrough para o comportamento original.
- "custom": endpoint compatível com a API da OpenAI (chat/completions + images),
  com chave e base_url próprios. Cobre OpenAI, OpenRouter, Groq, DeepSeek, Ollama, etc.

Desligar o modo custom (voltar para "emergent") restaura exatamente o comportamento
anterior, independente do que estiver salvo, porque o modo Emergent ignora a config
e usa os modelos fixos abaixo.

A config fica em cache de módulo (carregada no startup e atualizada quando o admin
salva), então os chamadores não precisam receber o `db`.
"""
import os
import json
from typing import AsyncIterator

# Modo Emergent = comportamento ORIGINAL, com modelos FIXOS (sem seleção pelo admin).
EMERGENT_TEXT_PROVIDER = "anthropic"
EMERGENT_TEXT_MODEL = "claude-sonnet-4-6"
EMERGENT_IMAGE_PROVIDER = "gemini"
EMERGENT_IMAGE_MODEL = "gemini-3.1-flash-image-preview"

# Config editável pelo admin — só o essencial do modo custom.
DEFAULTS = {
    "mode": "emergent",                       # emergent | custom
    "base_url": "https://api.openai.com/v1",  # modo custom (compatível OpenAI)
    "api_key": "",
    "custom_model": "gpt-4o-mini",
    "custom_image_model": "gpt-image-1",
}

_CONFIG = dict(DEFAULTS)


def get_config() -> dict:
    return dict(_CONFIG)


def apply_config(cfg: dict) -> None:
    for k in DEFAULTS:
        if k in cfg and cfg[k] is not None:
            _CONFIG[k] = cfg[k]


async def load_from_db(db) -> None:
    doc = await db.platform_settings.find_one({"key": "llm_config"}, {"_id": 0})
    if doc:
        apply_config(doc)


def current_model() -> str:
    """Rótulo do modelo em uso (para telemetria)."""
    return _CONFIG["custom_model"] if _CONFIG.get("mode") == "custom" else EMERGENT_TEXT_MODEL


def _emergent_key() -> str:
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise RuntimeError("EMERGENT_LLM_KEY não está configurada.")
    return key


async def _emergent_stream(session_id: str, system: str, user: str) -> AsyncIterator[str]:
    from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone
    chat = LlmChat(api_key=_emergent_key(), session_id=session_id, system_message=system)\
        .with_model(EMERGENT_TEXT_PROVIDER, EMERGENT_TEXT_MODEL)
    async for ev in chat.stream_message(UserMessage(text=user)):
        if isinstance(ev, TextDelta):
            yield ev.content
        elif isinstance(ev, StreamDone):
            return


async def _openai_stream(session_id: str, system: str, user: str) -> AsyncIterator[str]:
    import httpx
    url = _CONFIG["base_url"].rstrip("/") + "/chat/completions"
    headers = {"Authorization": f"Bearer {_CONFIG['api_key']}", "Content-Type": "application/json"}
    payload = {
        "model": _CONFIG["custom_model"],
        "stream": True,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }
    async with httpx.AsyncClient(timeout=180.0) as c:
        async with c.stream("POST", url, headers=headers, json=payload) as r:
            if r.status_code >= 400:
                body = await r.aread()
                raise RuntimeError(f"LLM {r.status_code}: {body.decode('utf-8', 'ignore')[:300]}")
            async for line in r.aiter_lines():
                line = (line or "").strip()
                if not line or not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    break
                try:
                    j = json.loads(data)
                    delta = (j.get("choices") or [{}])[0].get("delta", {}).get("content")
                    if delta:
                        yield delta
                except Exception:
                    continue


async def stream_text(session_id: str, system: str, user: str) -> AsyncIterator[str]:
    """Streaming de texto respeitando a config do admin."""
    if _CONFIG.get("mode") == "custom" and _CONFIG.get("api_key"):
        async for chunk in _openai_stream(session_id, system, user):
            yield chunk
    else:
        async for chunk in _emergent_stream(session_id, system, user):
            yield chunk


async def complete_text(session_id: str, system: str, user: str) -> str:
    """Coleta o texto completo (não-streaming)."""
    out = ""
    async for chunk in stream_text(session_id, system, user):
        out += chunk
    return out


# ── Geração de imagem ─────────────────────────────────────────────
async def _emergent_image(prompt: str):
    import uuid as _uuid
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    chat = LlmChat(api_key=_emergent_key(), session_id=f"img-{_uuid.uuid4()}",
                   system_message="You generate advertising images.")\
        .with_model(EMERGENT_IMAGE_PROVIDER, EMERGENT_IMAGE_MODEL)\
        .with_params(modalities=["image", "text"])
    _txt, imgs = await chat.send_message_multimodal_response(UserMessage(text=prompt))
    if not imgs:
        return None
    return {"data": imgs[0]["data"], "mime": imgs[0].get("mime_type", "image/png")}


async def _openai_image(prompt: str):
    import base64
    import httpx
    url = _CONFIG["base_url"].rstrip("/") + "/images/generations"
    headers = {"Authorization": f"Bearer {_CONFIG['api_key']}", "Content-Type": "application/json"}
    model = _CONFIG.get("custom_image_model") or "gpt-image-1"
    payload = {"model": model, "prompt": prompt, "n": 1, "size": "1024x1024"}
    if "dall-e" in model or "dalle" in model:
        payload["response_format"] = "b64_json"
    async with httpx.AsyncClient(timeout=180.0) as c:
        r = await c.post(url, headers=headers, json=payload)
    if r.status_code >= 400:
        raise RuntimeError(f"Imagem {r.status_code}: {r.text[:300]}")
    item = (r.json().get("data") or [{}])[0]
    b64 = item.get("b64_json")
    if not b64 and item.get("url"):
        async with httpx.AsyncClient(timeout=120.0) as c2:
            ir = await c2.get(item["url"])
        b64 = base64.b64encode(ir.content).decode()
    if not b64:
        return None
    return {"data": b64, "mime": "image/png"}


async def generate_image(prompt: str):
    """Gera uma imagem respeitando a config. Retorna {data(base64), mime} ou None."""
    if _CONFIG.get("mode") == "custom" and _CONFIG.get("api_key"):
        return await _openai_image(prompt)
    return await _emergent_image(prompt)
