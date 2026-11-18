import { useEffect, useMemo, useRef, useState } from "react";
import { X, Loader2, RotateCcw, Check, Minus, Plus, Video } from "lucide-react";
import { toast } from "sonner";
import { API_BASE, formatApiError } from "@/lib/api";

// Gravação com teleprompter: câmera frontal 9:16, roteiro rolando sobre o vídeo,
// contagem regressiva, revisão e envio para a edição automática.
function pickMime() {
  const opts = ["video/mp4;codecs=avc1,mp4a", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  return opts.find((m) => window.MediaRecorder?.isTypeSupported?.(m)) || "";
}

export default function Teleprompter({ journeyId, index, criativo, onClose, onSaved }) {
  const script = (criativo?.roteiro || criativo?.roteiro_ou_texto || "").trim();
  const videoRef = useRef(null);
  const textRef = useRef(null);
  const streamRef = useRef(null);
  const recRef = useRef(null);
  const chunksRef = useRef([]);
  const rafRef = useRef(0);
  const [phase, setPhase] = useState("ready"); // ready | countdown | recording | review | uploading
  const [count, setCount] = useState(3);
  const [secs, setSecs] = useState(0);
  const [speed, setSpeed] = useState(35); // px/s
  const [font, setFont] = useState(30);
  const [captions, setCaptions] = useState(true);
  const [blob, setBlob] = useState(null);
  const [camError, setCamError] = useState("");

  useEffect(() => {
    let alive = true;
    navigator.mediaDevices?.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1080 }, height: { ideal: 1920 } },
      audio: { echoCancellation: true, noiseSuppression: true },
    }).then((s) => {
      if (!alive) { s.getTracks().forEach((t) => t.stop()); return; }
      streamRef.current = s;
      if (videoRef.current) videoRef.current.srcObject = s;
    }).catch(() => setCamError("Não foi possível acessar câmera e microfone. Permita o acesso no navegador."));
    document.body.style.overflow = "hidden";
    return () => {
      alive = false;
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      document.body.style.overflow = "";
    };
  }, []);

  // rolagem do roteiro enquanto grava
  useEffect(() => {
    if (phase !== "recording") return;
    let last = performance.now();
    const start = last;
    const step = (now) => {
      const el = textRef.current;
      if (el) el.scrollTop += (speed * (now - last)) / 1000;
      setSecs(Math.floor((now - start) / 1000));
      last = now;
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase, speed]);

  const begin = () => {
    if (!streamRef.current) return;
    if (textRef.current) textRef.current.scrollTop = 0;
    setPhase("countdown");
    let n = 3;
    setCount(n);
    const t = setInterval(() => {
      n -= 1;
      if (n > 0) { setCount(n); return; }
      clearInterval(t);
      const mime = pickMime();
      const rec = new MediaRecorder(streamRef.current, mime ? { mimeType: mime, videoBitsPerSecond: 5_000_000 } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      rec.onstop = () => {
        setBlob(new Blob(chunksRef.current, { type: rec.mimeType || "video/webm" }));
        setPhase("review");
      };
      rec.start(1000);
      recRef.current = rec;
      setSecs(0);
      setPhase("recording");
    }, 1000);
  };
  const stop = () => recRef.current?.state === "recording" && recRef.current.stop();
  const retake = () => { setBlob(null); setPhase("ready"); };

  const save = async () => {
    setPhase("uploading");
    try {
      const token = localStorage.getItem("mfa_token");
      const r = await fetch(`${API_BASE}/journey/${journeyId}/videos?idx=${index}&captions=${captions}`, {
        method: "POST", body: blob,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": blob.type || "video/webm" },
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(formatApiError(data.detail));
      toast.success("Vídeo editado e salvo");
      onSaved?.(data);
      onClose();
    } catch (e) {
      toast.error(e.message || "Falha ao enviar o vídeo");
      setPhase("review");
    }
  };

  const reviewUrl = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(() => () => reviewUrl && URL.revokeObjectURL(reviewUrl), [reviewUrl]);
  const mmss = `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;

  return (
    <div className="fixed inset-0 z-[100] bg-black text-white flex items-center justify-center">
      <div className="relative h-full w-full sm:h-[min(92dvh,900px)] sm:w-auto sm:aspect-[9/16] sm:rounded-3xl overflow-hidden bg-neutral-900">
        {phase === "review" || phase === "uploading" ? (
          <video src={reviewUrl} controls playsInline className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <video ref={videoRef} autoPlay muted playsInline className="absolute inset-0 w-full h-full object-cover -scale-x-100" />
        )}

        {/* topo */}
        <div className="absolute top-0 inset-x-0 p-4 flex items-center gap-2 bg-gradient-to-b from-black/70 to-transparent">
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center" aria-label="Fechar"><X className="w-5 h-5" /></button>
          <div className="flex-1 min-w-0 text-sm font-semibold truncate">{criativo?.titulo || "Gravar vídeo"}</div>
          {phase === "recording" && <div className="flex items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-1 text-xs font-mono"><span className="w-2 h-2 rounded-full bg-white animate-pulse" />{mmss}</div>}
        </div>

        {/* roteiro */}
        {(phase === "ready" || phase === "countdown" || phase === "recording") && (
          <div ref={textRef} className="absolute top-16 inset-x-0 h-[42%] overflow-hidden px-6 [mask-image:linear-gradient(to_bottom,transparent,black_15%,black_80%,transparent)]">
            <div className="pt-6 pb-[60vh] font-semibold leading-snug text-center drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]" style={{ fontSize: font }}>
              {criativo?.gancho && <p className="text-sky-300 mb-4">{criativo.gancho}</p>}
              <p className="whitespace-pre-wrap">{script || "Sem roteiro. Fale livremente."}</p>
            </div>
          </div>
        )}

        {camError && <div className="absolute inset-x-6 top-1/2 -translate-y-1/2 rounded-2xl bg-black/80 p-4 text-sm text-center">{camError}</div>}
        {phase === "countdown" && <div className="absolute inset-0 flex items-center justify-center text-8xl font-bold drop-shadow-lg">{count}</div>}
        {phase === "uploading" && (
          <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin" />
            <div className="text-sm font-medium">Editando o vídeo…</div>
            <div className="text-xs text-white/60">Formato 9:16, legendas e gancho</div>
          </div>
        )}

        {/* controles */}
        <div className="absolute bottom-0 inset-x-0 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] bg-gradient-to-t from-black/85 to-transparent space-y-4">
          {phase === "ready" && (
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="flex items-center justify-between rounded-full bg-white/10 px-2 py-1">
                <button onClick={() => setSpeed((v) => Math.max(10, v - 5))} className="w-7 h-7 flex items-center justify-center"><Minus className="w-3.5 h-3.5" /></button>
                <span>Velocidade {speed}</span>
                <button onClick={() => setSpeed((v) => Math.min(120, v + 5))} className="w-7 h-7 flex items-center justify-center"><Plus className="w-3.5 h-3.5" /></button>
              </div>
              <div className="flex items-center justify-between rounded-full bg-white/10 px-2 py-1">
                <button onClick={() => setFont((v) => Math.max(18, v - 2))} className="w-7 h-7 flex items-center justify-center"><Minus className="w-3.5 h-3.5" /></button>
                <span>Texto {font}</span>
                <button onClick={() => setFont((v) => Math.min(48, v + 2))} className="w-7 h-7 flex items-center justify-center"><Plus className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          )}
          {phase === "review" && (
            <label className="flex items-center justify-center gap-2 text-sm">
              <input type="checkbox" checked={captions} onChange={(e) => setCaptions(e.target.checked)} />
              Legendas automáticas (a partir do roteiro)
            </label>
          )}
          <div className="flex items-center justify-center gap-6">
            {(phase === "ready" || phase === "countdown") && (
              <button onClick={begin} disabled={!!camError || phase === "countdown"} aria-label="Gravar"
                className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center disabled:opacity-50">
                <span className="w-14 h-14 rounded-full bg-red-600" />
              </button>
            )}
            {phase === "recording" && (
              <button onClick={stop} aria-label="Parar" className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center">
                <span className="w-8 h-8 rounded-md bg-red-600" />
              </button>
            )}
            {phase === "review" && (
              <>
                <button onClick={retake} className="flex items-center gap-2 rounded-full bg-white/15 px-5 py-3 text-sm font-medium"><RotateCcw className="w-4 h-4" /> Regravar</button>
                <button onClick={save} className="flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 px-5 py-3 text-sm font-semibold"><Check className="w-4 h-4" /> Usar este vídeo</button>
              </>
            )}
          </div>
          {phase === "ready" && !camError && <div className="text-center text-[11px] text-white/60 flex items-center justify-center gap-1"><Video className="w-3 h-3" /> Olhe para a câmera; o texto rola sozinho ao gravar</div>}
        </div>
      </div>
    </div>
  );
}
