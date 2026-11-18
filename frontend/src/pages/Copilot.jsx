import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Send, Loader2, Plus, Check, Sparkles, ExternalLink, Rocket, RefreshCw, Lock, Trash2,
} from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

const err = (e) => toast.error(formatApiError(e.response?.data?.detail));
const GEN_STEPS = ["copy", "landing", "criativos", "campanha"];

function Field({ label, children }) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="text-sm whitespace-pre-wrap">{children}</div>
    </div>
  );
}

// Renderização legível de qualquer entregável JSON.
function Pretty({ value }) {
  if (Array.isArray(value)) {
    return (
      <div className="space-y-2">
        {value.map((v, i) => (
          <div key={i} className={typeof v === "object" ? "rounded-xl border p-3" : ""}>
            {typeof v === "object" ? <Pretty value={v} /> : <div className="text-sm">• {String(v)}</div>}
          </div>
        ))}
      </div>
    );
  }
  if (value && typeof value === "object") {
    return (
      <div className="space-y-3">
        {Object.entries(value).map(([k, v]) => (
          <Field key={k} label={k.replace(/_/g, " ")}>
            {typeof v === "object" ? <Pretty value={v} /> : String(v)}
          </Field>
        ))}
      </div>
    );
  }
  return <span>{String(value ?? "")}</span>;
}

function StepCard({ j, step, label, busy, onGenerate, onConfirm, onSave }) {
  const data = j.deliverables?.[step];
  const done = j.done?.includes(step);
  const [edit, setEdit] = useState(false);
  const [raw, setRaw] = useState("");
  const lpUrl = j.landing_slug ? `${window.location.origin}/p/${j.landing_slug}` : null;

  const save = () => {
    try { onSave(step, JSON.parse(raw)); setEdit(false); }
    catch { toast.error("JSON inválido"); }
  };

  return (
    <Card className="p-5 rounded-2xl space-y-4">
      <div className="flex items-center gap-2">
        <div className="text-sm font-semibold flex-1">{label}</div>
        {done && <Badge className="rounded-full bg-emerald-500/15 text-emerald-600">Aprovado</Badge>}
      </div>
      {!data ? (
        <Button onClick={() => onGenerate(step)} disabled={busy} className="rounded-full">
          {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
          Gerar com o copiloto
        </Button>
      ) : edit ? (
        <div className="space-y-2">
          <Textarea value={raw} onChange={(e) => setRaw(e.target.value)} className="font-mono text-xs min-h-[300px]" />
          <div className="flex gap-2">
            <Button size="sm" className="rounded-full" onClick={save}>Salvar</Button>
            <Button size="sm" variant="ghost" className="rounded-full" onClick={() => setEdit(false)}>Cancelar</Button>
          </div>
        </div>
      ) : (
        <>
          <div className="max-h-[420px] overflow-y-auto pr-1"><Pretty value={data} /></div>
          <div className="flex flex-wrap gap-2">
            {!done && (
              <Button size="sm" className="rounded-full" onClick={() => onConfirm(step)} disabled={busy}>
                <Check className="w-4 h-4 mr-1" /> Aprovar{step === "landing" ? " e publicar" : ""}
              </Button>
            )}
            <Button size="sm" variant="outline" className="rounded-full" onClick={() => onGenerate(step)} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />} Gerar de novo
            </Button>
            <Button size="sm" variant="ghost" className="rounded-full"
              onClick={() => { setRaw(JSON.stringify(data, null, 2)); setEdit(true); }}>Editar</Button>
            {step === "landing" && lpUrl && (
              <a href={lpUrl} target="_blank" rel="noreferrer">
                <Button size="sm" variant="outline" className="rounded-full"><ExternalLink className="w-4 h-4 mr-1" /> Abrir página</Button>
              </a>
            )}
          </div>
        </>
      )}
    </Card>
  );
}

const SEL = "w-full h-9 rounded-md border border-input bg-background px-3 text-sm";

function PublishCard({ j, busy, onPublish }) {
  const [assets, setAssets] = useState(null);
  const [failed, setFailed] = useState("");
  const [pageId, setPageId] = useState("");
  const [pixelId, setPixelId] = useState("");
  const [activate, setActivate] = useState(false);

  useEffect(() => {
    api.get("/journey-meta-assets").then(({ data }) => {
      setAssets(data);
      setPageId(data.pages?.[0]?.id || "");
      setPixelId(data.pixels?.[0]?.id || "");
    }).catch((e) => setFailed(formatApiError(e.response?.data?.detail)));
  }, [j.id]);

  return (
    <Card className="p-5 rounded-2xl space-y-4">
      <div>
        <div className="text-sm font-semibold">Tudo pronto para ir ao ar</div>
        <div className="text-xs text-muted-foreground">Vamos criar campanha, conjuntos e anúncios (com imagens geradas) na sua conta Meta.</div>
      </div>
      {failed ? (
        <div className="text-xs text-red-600">
          {failed} — conecte sua conta Meta em <a href="/app/settings" className="underline">Configurações</a>.
        </div>
      ) : !assets ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <div className="text-xs font-medium">Página do Facebook</div>
              <select className={SEL} value={pageId} onChange={(e) => setPageId(e.target.value)}>
                {assets.pages.length === 0 && <option value="">Nenhuma página encontrada</option>}
                {assets.pages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <div className="text-xs font-medium">Pixel (otimização)</div>
              <select className={SEL} value={pixelId} onChange={(e) => setPixelId(e.target.value)}>
                {assets.pixels.map((p) => <option key={p.id} value={p.id}>{p.name} — otimizar para leads</option>)}
                <option value="">Sem pixel — otimizar para visitas na página</option>
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={activate} onChange={(e) => setActivate(e.target.checked)} />
            Ativar imediatamente (senão fica pausada para revisão)
          </label>
          <Button className="rounded-full" disabled={busy || !pageId}
            onClick={() => onPublish({ page_id: pageId, pixel_id: pixelId, activate })}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Rocket className="w-4 h-4 mr-2" />}
            {busy ? "Publicando no Meta..." : "Aprovar e publicar campanha"}
          </Button>
        </>
      )}
    </Card>
  );
}

export default function Copilot() {
  const [meta, setMeta] = useState(null);
  const [list, setList] = useState([]);
  const [j, setJ] = useState(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const endRef = useRef(null);

  useEffect(() => {
    api.get("/journey/meta").then(({ data }) => setMeta(data)).catch(err);
    api.get("/journey").then(async ({ data }) => {
      setList(data || []);
      if (data?.[0]) setJ((await api.get(`/journey/${data[0].id}`)).data);
    }).catch(err);
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [j?.messages?.length]);

  const run = async (key, fn) => {
    setBusy(key);
    try { const { data } = await fn(); if (data?.id) setJ(data); return data; }
    catch (e) { err(e); } finally { setBusy(""); }
  };

  const create = async () => {
    const data = await run("new", () => api.post("/journey", {}));
    if (data) setList((xs) => [data, ...xs]);
  };
  const open = async (id) => run("open", () => api.get(`/journey/${id}`));
  const remove = async (id) => {
    if (!window.confirm("Excluir esta jornada?")) return;
    await api.delete(`/journey/${id}`).catch(err);
    setList((xs) => xs.filter((x) => x.id !== id));
    if (j?.id === id) setJ(null);
  };
  const send = async () => {
    const text = msg.trim();
    if (!text || busy) return;
    setMsg("");
    setJ((x) => ({ ...x, messages: [...(x.messages || []), { role: "user", content: text }] }));
    await run("chat", () => api.post(`/journey/${j.id}/chat`, { message: text }, { timeout: 120000 }));
  };
  const chooseFunnel = (funnel) => run("funnel", () => api.post(`/journey/${j.id}/funnel`, { funnel }));
  const generate = (step) => run(step, () => api.post(`/journey/${j.id}/generate/${step}`, {}, { timeout: 180000 }));
  const confirm = (step) => run(step, () => api.post(`/journey/${j.id}/confirm/${step}`));
  const saveStep = (step, data) => run(step, () => api.put(`/journey/${j.id}/deliverable/${step}`, { data }));
  const publish = (opts) => run("approve", () => api.post(`/journey/${j.id}/publish`,
    { ...opts, landing_url: `${window.location.origin}/p/${j.landing_slug}` }, { timeout: 300000 }));

  if (!meta) return <div className="p-10 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>;

  const phases = meta.phases;
  const current = j ? phases[j.phase]?.key : null;
  const visibleSteps = j ? GEN_STEPS.filter((s) => j.done?.includes(s) || s === current) : [];

  return (
    <div className="space-y-4 max-w-5xl">
      {/* Jornadas */}
      <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar pb-1">
        {list.map((x) => (
          <button key={x.id} onClick={() => open(x.id)}
            className={`shrink-0 group flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${j?.id === x.id ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}>
            {x.name}
            <Trash2 className="w-3 h-3 opacity-0 group-hover:opacity-60" onClick={(e) => { e.stopPropagation(); remove(x.id); }} />
          </button>
        ))}
        <Button size="sm" variant="outline" className="rounded-full shrink-0" onClick={create} disabled={busy === "new"}>
          <Plus className="w-4 h-4 mr-1" /> Nova campanha
        </Button>
      </div>

      {!j ? (
        <Card className="p-10 rounded-2xl text-center space-y-3">
          <Sparkles className="w-8 h-8 mx-auto text-primary" />
          <div className="text-lg font-semibold">Monte seu funil completo conversando com o copiloto</div>
          <div className="text-sm text-muted-foreground">Briefing, copy, landing page, criativos e campanha — em minutos.</div>
          <Button className="rounded-full" onClick={create}><Plus className="w-4 h-4 mr-1" /> Começar</Button>
        </Card>
      ) : (
        <>
          {/* Progresso */}
          <Card className="p-4 rounded-2xl">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold">{j.name}</div>
              <div className="text-xs text-muted-foreground font-mono">Fase {Math.min(j.phase + 1, phases.length)} de {phases.length}</div>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden mb-3">
              <div className="h-full bg-primary transition-all" style={{ width: `${(j.done.length / phases.length) * 100}%` }} />
            </div>
            <div className="flex gap-1.5 overflow-x-auto hide-scrollbar">
              {phases.map((p, i) => {
                const isDone = j.done.includes(p.key);
                const isCur = i === j.phase && !isDone;
                return (
                  <div key={p.key} className={`shrink-0 flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] ${isDone ? "bg-emerald-500/15 text-emerald-600" : isCur ? "bg-primary/15 text-primary font-medium" : "bg-muted text-muted-foreground"}`}>
                    {isDone ? <Check className="w-3 h-3" /> : <span className="font-mono">{i + 1}</span>} {p.label}
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Briefing (chat) */}
          <Card className="rounded-2xl flex flex-col">
            <div className="p-4 space-y-3 max-h-[420px] overflow-y-auto">
              {j.messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : ""}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                    {m.content}
                  </div>
                </div>
              ))}
              {busy === "chat" && <div className="bg-muted rounded-2xl px-4 py-2.5 w-fit"><Loader2 className="w-4 h-4 animate-spin" /></div>}
              <div ref={endRef} />
            </div>
            <div className="border-t p-3 flex gap-2">
              <Textarea rows={1} value={msg} onChange={(e) => setMsg(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder={j.briefing ? "Peça ajustes ao copiloto..." : "Responda ao copiloto..."}
                className="min-h-[40px] resize-none rounded-xl" />
              <Button size="icon" className="rounded-full shrink-0" onClick={send} disabled={!!busy || !msg.trim()}>
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </Card>

          {/* Funil */}
          {current === "funil" && (
            <Card className="p-5 rounded-2xl space-y-3">
              <div className="text-sm font-semibold">Escolha o modelo de funil</div>
              <div className="grid sm:grid-cols-3 gap-3">
                {meta.funnels.map((f) => (
                  <button key={f.key} disabled={!f.enabled || !!busy} onClick={() => chooseFunnel(f.key)}
                    className={`rounded-2xl border p-4 text-left text-sm ${f.enabled ? "hover:border-primary hover:bg-primary/5" : "opacity-50 cursor-not-allowed"}`}>
                    <div className="font-medium flex items-center gap-2">{f.label} {!f.enabled && <Lock className="w-3 h-3" />}</div>
                    <div className="text-xs text-muted-foreground mt-1">{f.enabled ? "Disponível" : "Em breve"}</div>
                  </button>
                ))}
              </div>
            </Card>
          )}

          {/* Entregáveis */}
          {visibleSteps.map((s) => (
            <StepCard key={s} j={j} step={s} label={phases.find((p) => p.key === s)?.label}
              busy={busy === s} onGenerate={generate} onConfirm={confirm} onSave={saveStep} />
          ))}

          {/* Aprovação final + publicação no Meta */}
          {current === "aprovacao" && !j.meta?.campaign_id && <PublishCard j={j} busy={busy === "approve"} onPublish={publish} />}
          {j.meta?.campaign_id && (
            <Card className="p-5 rounded-2xl text-sm space-y-3">
              <div className="flex items-center gap-2">
                <div className="font-semibold flex-1">Campanha publicada no Meta</div>
                <Badge className={`rounded-full ${j.meta.status === "ACTIVE" ? "bg-emerald-500/15 text-emerald-600" : "bg-muted text-muted-foreground"}`}>
                  {j.meta.status === "ACTIVE" ? "Ativa" : "Pausada"}
                </Badge>
              </div>
              <div className="text-muted-foreground text-xs">
                {j.meta.adset_ids?.length} conjunto(s) · {j.meta.ad_ids?.length} anúncio(s) · ID {j.meta.campaign_id}.
                Acompanhe os leads em <a href="/app/leads" className="text-primary underline">Leads</a>.
                {j.landing_slug && <> Página: <a href={`/p/${j.landing_slug}`} target="_blank" rel="noreferrer" className="text-primary underline">/p/{j.landing_slug}</a></>}
              </div>
              <Button size="sm" variant={j.meta.status === "ACTIVE" ? "outline" : "default"} className="rounded-full" disabled={busy === "status"}
                onClick={() => run("status", () => api.post(`/journey/${j.id}/meta-status`, { active: j.meta.status !== "ACTIVE" }))}>
                {busy === "status" && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                {j.meta.status === "ACTIVE" ? "Pausar campanha" : "Ativar campanha"}
              </Button>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
