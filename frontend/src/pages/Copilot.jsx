import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Loader2, Plus, Check, Sparkles, ExternalLink, Rocket, RefreshCw, Lock, Trash2, ArrowUp,
  MessageSquare, Workflow, PenLine, LayoutTemplate, Image as ImageIcon, Megaphone, Activity,
  ChevronLeft, ChevronRight, Pencil,
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
          <div key={i} className={typeof v === "object" ? "rounded-2xl border border-border/60 bg-muted/40 p-4" : ""}>
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

function StepCard({ j, step, busy, onGenerate, onConfirm, onSave }) {
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
    <Card className="p-5 sm:p-6 rounded-3xl space-y-5">
      {!data ? (
        <div className="py-8 text-center">
          <div className="mx-auto w-12 h-12 rounded-2xl flex items-center justify-center bg-primary/10 text-primary border border-primary/20">
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
          </div>
          <div className="mt-4 font-semibold">{busy ? "O copiloto está criando…" : "Pronto para gerar"}</div>
          <div className="mt-1 text-xs text-muted-foreground">{busy ? "Isso leva alguns segundos." : "O copiloto usa o briefing e as etapas aprovadas."}</div>
          {!busy && (
            <button onClick={() => onGenerate(step)}
              className="mt-5 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-blue-500 to-cyan-500 shadow-[0_10px_26px_-10px_rgba(59,130,246,0.9)]">
              <Sparkles className="w-4 h-4" /> Gerar com o copiloto
            </button>
          )}
        </div>
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
          <div className="max-h-[480px] overflow-y-auto scrollbar-thin pr-1"><Pretty value={data} /></div>
          <div className="flex flex-wrap gap-2 pt-4 border-t border-border/60">
            {!done && (
              <Button size="sm" className="rounded-full" onClick={() => onConfirm(step)} disabled={busy}>
                <Check className="w-4 h-4 mr-1" /> Aprovar{step === "landing" ? " e publicar" : ""}
              </Button>
            )}
            <Button size="sm" variant="outline" className="rounded-full" onClick={() => onGenerate(step)} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />} Gerar de novo
            </Button>
            <Button size="sm" variant="ghost" className="rounded-full"
              onClick={() => { setRaw(JSON.stringify(data, null, 2)); setEdit(true); }}><Pencil className="w-4 h-4 mr-1" /> Editar</Button>
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

const ACTION_LABEL = { copy: "Sugerir novas copies", criativos: "Sugerir novos criativos", estrutura: "Sugerir nova estrutura" };
const KIND_LABEL = { copy: "Novas copies", criativos: "Novos criativos", estrutura: "Nova estrutura" };
const brl = (v) => (v == null ? "—" : `R$ ${Number(v).toFixed(2)}`);

function MonitorCard({ j, busy, onSuggest }) {
  const [h, setH] = useState(null);
  const [failed, setFailed] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true); setFailed("");
    try { setH((await api.get(`/journey/${j.id}/health`)).data); }
    catch (e) { setFailed(formatApiError(e.response?.data?.detail)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [j.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const k = h?.kpis || {};
  const tiles = [
    ["Investido (14d)", brl(k.spend)], ["CTR", `${k.ctr ?? 0}%`], ["Visitas", k.views ?? 0],
    ["Leads", k.leads ?? 0], ["Conversão", `${k.conversion ?? 0}%`], ["CPL", brl(k.cpl)],
  ];

  return (
    <Card className="p-5 rounded-2xl space-y-4">
      <div className="flex items-center gap-2">
        <div className="text-sm font-semibold flex-1">Monitoramento</div>
        <Button variant="outline" size="icon" className="rounded-full h-8 w-8" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>
      {failed && <div className="text-xs text-red-600">{failed}</div>}
      {h && (
        <>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {tiles.map(([l, v]) => (
              <div key={l} className="rounded-xl bg-muted/60 p-2.5">
                <div className="text-[10px] text-muted-foreground">{l}</div>
                <div className="text-sm font-semibold">{v}</div>
              </div>
            ))}
          </div>
          {h.alerts.length === 0 ? (
            <div className="text-xs text-emerald-600 flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Nenhum alerta. A campanha está saudável (ou ainda coletando dados).</div>
          ) : (
            <div className="space-y-2">
              {h.alerts.map((a) => (
                <div key={a.key} className={`rounded-xl border p-3 flex flex-col sm:flex-row sm:items-center gap-2 ${a.level === "high" ? "border-red-500/40 bg-red-500/5" : "border-yellow-500/40 bg-yellow-500/5"}`}>
                  <div className="flex-1">
                    <div className="text-sm font-medium">{a.title}</div>
                    <div className="text-xs text-muted-foreground">{a.message}</div>
                  </div>
                  <Button size="sm" variant="outline" className="rounded-full shrink-0" disabled={busy}
                    onClick={() => onSuggest(a.action, `${a.title}. ${a.message}`)}>
                    <Sparkles className="w-3.5 h-3.5 mr-1" /> {ACTION_LABEL[a.action]}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      <div className="flex flex-wrap gap-2">
        {Object.keys(ACTION_LABEL).map((kind) => (
          <Button key={kind} size="sm" variant="ghost" className="rounded-full" disabled={busy} onClick={() => onSuggest(kind, "Pedido manual")}>
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />} {ACTION_LABEL[kind]}
          </Button>
        ))}
      </div>
      {(j.suggestions || []).map((s) => (
        <div key={s.id} className="rounded-xl border p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Badge className="rounded-full">{KIND_LABEL[s.kind]}</Badge>
            <span className="text-[10px] text-muted-foreground font-mono">{new Date(s.created_at).toLocaleString("pt-BR")}</span>
          </div>
          <Pretty value={s.data} />
        </div>
      ))}
    </Card>
  );
}

// ── Wizard ────────────────────────────────────────────────────────
const PHASE_INFO = {
  briefing: { icon: MessageSquare, desc: "Conte sobre o seu negócio" },
  funil: { icon: Workflow, desc: "Escolha o modelo do funil" },
  copy: { icon: PenLine, desc: "Mensagens, ângulos e objeções" },
  landing: { icon: LayoutTemplate, desc: "Página de captura publicada" },
  criativos: { icon: ImageIcon, desc: "Vídeo e estáticos para anúncios" },
  campanha: { icon: Megaphone, desc: "Estrutura da campanha no Meta" },
  aprovacao: { icon: Rocket, desc: "Revise e publique" },
  monitoramento: { icon: Activity, desc: "Alertas e otimizações" },
};
const FUNNEL_INFO = {
  aplicacao: "Anúncio → página com formulário de aplicação → contato comercial.",
  oferta_direta: "Anúncio → página de vendas → checkout.",
  live: "Anúncio → inscrição → live semanal → oferta.",
};
const BRIEF_LABELS = {
  empresa: "Empresa", produto: "Produto", publico: "Público", dor: "Dor principal", oferta: "Oferta",
  diferenciais: "Diferenciais", ticket: "Ticket médio", regiao: "Região", orcamento_diario: "Orçamento diário",
};

function StepDot({ state, n, size = "md" }) {
  const dim = size === "sm" ? "w-8 h-8 text-xs" : "w-9 h-9 text-sm";
  if (state === "done") return <span className={`${dim} shrink-0 rounded-full flex items-center justify-center bg-emerald-500 text-white shadow-[0_0_0_4px_rgba(16,185,129,0.15)]`}><Check className="w-4 h-4" /></span>;
  if (state === "current") return <span className={`${dim} shrink-0 rounded-full flex items-center justify-center font-semibold text-white bg-gradient-to-br from-blue-500 to-cyan-500 shadow-[0_0_0_4px_hsl(var(--primary)/0.2),0_8px_20px_-6px_hsl(var(--primary)/0.8)]`}>{n}</span>;
  return <span className={`${dim} shrink-0 rounded-full flex items-center justify-center font-medium border border-border text-muted-foreground bg-background/40`}>{n}</span>;
}

function Wizard({ phases, j, view, setView }) {
  const pct = Math.round((j.done.length / phases.length) * 100);
  const stateOf = (p, i) => (j.done.includes(p.key) ? "done" : i === j.phase ? "current" : "locked");
  return (
    <>
      {/* desktop: vertical */}
      <Card className="hidden lg:block p-5 rounded-3xl sticky top-0">
        <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Nova campanha</div>
        <div className="mt-1 font-semibold truncate">{j.name}</div>
        <div className="mt-3 flex items-center gap-3">
          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs font-mono text-muted-foreground">{pct}%</span>
        </div>
        <ol className="mt-5">
          {phases.map((p, i) => {
            const st = stateOf(p, i);
            const can = i <= j.phase;
            const Icon = PHASE_INFO[p.key]?.icon || Sparkles;
            return (
              <li key={p.key} className="relative">
                {i < phases.length - 1 && (
                  <span className={`absolute left-[26px] top-[46px] bottom-[-6px] w-px ${j.done.includes(p.key) ? "bg-emerald-500/60" : "bg-border"}`} />
                )}
                <button disabled={!can} onClick={() => setView(p.key)}
                  className={`w-full flex items-center gap-3 rounded-2xl px-2 py-2 mb-1 text-left transition-colors ${view === p.key ? "bg-primary/10 ring-1 ring-primary/30" : can ? "hover:bg-muted/60" : "opacity-60 cursor-not-allowed"}`}>
                  <StepDot state={st} n={i + 1} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      {p.label}{st === "locked" && <Lock className="w-3 h-3 text-muted-foreground" />}
                    </span>
                    <span className="block text-[11px] text-muted-foreground truncate">{PHASE_INFO[p.key]?.desc}</span>
                  </span>
                  {view === p.key && <Icon className="w-4 h-4 text-primary shrink-0" />}
                </button>
              </li>
            );
          })}
        </ol>
      </Card>

      {/* mobile: horizontal */}
      <Card className="lg:hidden p-4 rounded-3xl min-w-0">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Etapa {Math.min(j.phase + 1, phases.length)} de {phases.length}</div>
            <div className="font-semibold truncate">{j.name}</div>
          </div>
          <span className="text-xs font-mono text-muted-foreground">{pct}%</span>
        </div>
        <div className="mt-4 flex items-start overflow-x-auto hide-scrollbar -mx-1 px-1 pb-1">
          {phases.map((p, i) => {
            const can = i <= j.phase;
            return (
              <div key={p.key} className="flex items-start shrink-0">
                <button disabled={!can} onClick={() => setView(p.key)} className="flex flex-col items-center gap-1.5 w-[64px]">
                  <span className={view === p.key ? "rounded-full ring-2 ring-primary/50 ring-offset-2 ring-offset-transparent" : ""}><StepDot state={stateOf(p, i)} n={i + 1} size="sm" /></span>
                  <span className={`text-[10px] text-center leading-tight ${view === p.key ? "text-foreground font-semibold" : "text-muted-foreground"}`}>{p.label}</span>
                </button>
                {i < phases.length - 1 && <span className={`mt-4 h-px w-4 shrink-0 ${j.done.includes(p.key) ? "bg-emerald-500/60" : "bg-border"}`} />}
              </div>
            );
          })}
        </div>
      </Card>
    </>
  );
}

// ── Chat ──────────────────────────────────────────────────────────
function CopilotAvatar({ size = "w-8 h-8" }) {
  return (
    <span className={`${size} shrink-0 rounded-xl flex items-center justify-center text-white bg-gradient-to-br from-blue-500 to-cyan-500 shadow-[0_6px_16px_-6px_hsl(var(--primary)/0.9)]`}>
      <Sparkles className="w-4 h-4" />
    </span>
  );
}

function ChatPanel({ j, busy, onSend }) {
  const [msg, setMsg] = useState("");
  const scrollRef = useRef(null);
  const taRef = useRef(null);
  const typing = busy === "chat";

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [j.messages?.length, typing]);

  const grow = () => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  };
  const submit = (text) => {
    const t = (text ?? msg).trim();
    if (!t || busy) return;
    setMsg("");
    requestAnimationFrame(grow);
    onSend(t);
  };
  const chips = !j.briefing && (j.messages?.length || 0) >= 3 ? ["Já te passei o principal, pode seguir"] : [];

  return (
    <Card className="rounded-3xl overflow-hidden flex flex-col h-[calc(100dvh-440px)] md:h-[min(620px,calc(100dvh-300px))] min-h-[360px]">
      <div className="flex items-center gap-3 px-4 sm:px-5 py-3.5 border-b border-border/60">
        <CopilotAvatar size="w-9 h-9" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold">Copiloto</div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            {typing ? "digitando…" : j.briefing ? "briefing concluído" : "conduzindo o briefing"}
          </div>
        </div>
        {j.briefing && <Badge className="rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-0">Briefing ✓</Badge>}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin px-3 sm:px-5 py-5 space-y-4">
        {j.messages.map((m, i) => m.role === "user" ? (
          <div key={i} className="flex justify-end">
            <div className="max-w-[82%] rounded-2xl rounded-br-md px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap text-white bg-gradient-to-br from-blue-500 to-blue-600 shadow-[0_8px_24px_-12px_rgba(59,130,246,0.9)]">
              {m.content}
            </div>
          </div>
        ) : (
          <div key={i} className="flex items-end gap-2.5">
            <CopilotAvatar size="w-7 h-7" />
            <div className="max-w-[82%] rounded-2xl rounded-bl-md px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap bg-muted/70 border border-border/60">
              {m.content}
            </div>
          </div>
        ))}
        {typing && (
          <div className="flex items-end gap-2.5">
            <CopilotAvatar size="w-7 h-7" />
            <div className="rounded-2xl rounded-bl-md px-4 py-3.5 bg-muted/70 border border-border/60 flex gap-1">
              {[0, 150, 300].map((d) => <span key={d} className="w-1.5 h-1.5 rounded-full bg-muted-foreground/70 animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
            </div>
          </div>
        )}
      </div>

      <div className="p-3 sm:p-4 border-t border-border/60 space-y-2">
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {chips.map((c) => (
              <button key={c} onClick={() => submit(c)} disabled={!!busy}
                className="text-xs rounded-full border border-primary/30 bg-primary/5 text-primary px-3 py-1.5 hover:bg-primary/10">{c}</button>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2 rounded-2xl border border-border bg-background/50 p-1.5 pl-4 focus-within:ring-2 focus-within:ring-primary/40 transition-shadow">
          <textarea ref={taRef} rows={1} value={msg}
            onChange={(e) => { setMsg(e.target.value); grow(); }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
            placeholder={j.briefing ? "Peça ajustes ao copiloto…" : "Responda ao copiloto…"}
            className="flex-1 resize-none bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground max-h-[140px]" />
          <button onClick={() => submit()} disabled={!!busy || !msg.trim()} aria-label="Enviar"
            className="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center text-white bg-gradient-to-br from-blue-500 to-cyan-500 disabled:opacity-40 transition-opacity">
            {typing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4" />}
          </button>
        </div>
        <div className="hidden sm:block text-[10px] text-muted-foreground px-1">Enter para enviar · Shift + Enter para quebrar linha</div>
      </div>
    </Card>
  );
}

function BriefingSummary({ briefing }) {
  const rows = Object.entries(briefing || {}).filter(([, v]) => v);
  if (!rows.length) return null;
  return (
    <Card className="p-5 rounded-3xl">
      <div className="text-sm font-semibold mb-3">Resumo do briefing</div>
      <div className="grid sm:grid-cols-2 gap-3">
        {rows.map(([k, v]) => (
          <div key={k} className="rounded-2xl bg-muted/50 border border-border/50 p-3">
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{BRIEF_LABELS[k] || k}</div>
            <div className="text-sm mt-0.5">{String(v)}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function Copilot() {
  const [meta, setMeta] = useState(null);
  const [list, setList] = useState([]);
  const [j, setJ] = useState(null);
  const [busy, setBusy] = useState("");
  const [view, setView] = useState("briefing");

  useEffect(() => {
    api.get("/journey/meta").then(({ data }) => setMeta(data)).catch(err);
    api.get("/journey").then(async ({ data }) => {
      setList(data || []);
      if (data?.[0]) setJ((await api.get(`/journey/${data[0].id}`)).data);
    }).catch(err);
  }, []);

  // Ao avançar de fase (ou trocar de campanha), o wizard vai para a etapa atual.
  useEffect(() => {
    if (meta && j) setView(meta.phases[j.phase]?.key || "briefing");
  }, [meta, j?.id, j?.phase]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (!window.confirm("Excluir esta campanha?")) return;
    await api.delete(`/journey/${id}`).catch(err);
    setList((xs) => xs.filter((x) => x.id !== id));
    if (j?.id === id) setJ(null);
  };
  const send = async (text) => {
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
  const idx = Math.max(0, phases.findIndex((p) => p.key === view));
  const phase = phases[idx];
  const Info = PHASE_INFO[phase?.key] || {};
  const StepIcon = Info.icon || Sparkles;
  const canNext = j && idx < j.phase;

  const campaignBar = (
    <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar pb-1">
      {list.map((x) => (
        <button key={x.id} onClick={() => open(x.id)}
          className={`shrink-0 group flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs transition-colors ${j?.id === x.id ? "border-primary/50 bg-primary/10 text-foreground font-medium" : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/60"}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${x.status === "approved" ? "bg-emerald-500" : "bg-primary/70"}`} />
          <span className="max-w-[160px] truncate">{x.name}</span>
          <Trash2 className="w-3 h-3 opacity-0 group-hover:opacity-60 hover:!opacity-100" onClick={(e) => { e.stopPropagation(); remove(x.id); }} />
        </button>
      ))}
      <button onClick={create} disabled={busy === "new"}
        className="shrink-0 flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium text-white bg-gradient-to-r from-blue-500 to-cyan-500 shadow-[0_6px_18px_-8px_rgba(59,130,246,0.9)] disabled:opacity-60">
        {busy === "new" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Nova campanha
      </button>
    </div>
  );

  if (!j) {
    return (
      <div className="space-y-4 max-w-6xl">
        {campaignBar}
        <Card className="relative overflow-hidden p-8 sm:p-14 rounded-3xl text-center">
          <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[420px] h-[220px] rounded-full bg-primary/25 blur-[90px]" />
          <div className="relative">
            <div className="mx-auto w-14 h-14 rounded-2xl flex items-center justify-center text-white bg-gradient-to-br from-blue-500 to-cyan-500 shadow-[0_14px_30px_-10px_rgba(59,130,246,0.9)]">
              <Sparkles className="w-7 h-7" />
            </div>
            <h2 className="mt-5 text-2xl sm:text-3xl font-semibold tracking-tight">Monte seu funil completo conversando com o copiloto</h2>
            <p className="mt-2 text-sm text-muted-foreground max-w-lg mx-auto">Briefing, copy, landing page, criativos e campanha no Meta — em 8 etapas guiadas.</p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {phases.map((p, i) => (
                <span key={p.key} className="text-[11px] rounded-full border border-border px-2.5 py-1 text-muted-foreground"><span className="font-mono mr-1">{i + 1}</span>{p.label}</span>
              ))}
            </div>
            <button onClick={create} className="mt-8 inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white bg-gradient-to-r from-blue-500 to-cyan-500 shadow-[0_12px_30px_-10px_rgba(59,130,246,0.9)]">
              <Plus className="w-4 h-4" /> Começar nova campanha
            </button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-6xl">
      {campaignBar}
      <div className="grid grid-cols-1 lg:grid-cols-[290px_minmax(0,1fr)] gap-4 items-start">
        <Wizard phases={phases} j={j} view={view} setView={setView} />

        <div className="space-y-4 min-w-0">
          {/* cabeçalho da etapa */}
          <div className="flex items-center gap-3 px-1">
            <span className="w-11 h-11 rounded-2xl flex items-center justify-center bg-primary/10 text-primary border border-primary/20"><StepIcon className="w-5 h-5" /></span>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Etapa {idx + 1} de {phases.length}</div>
              <h2 className="text-lg sm:text-xl font-semibold tracking-tight leading-tight">{phase?.label}</h2>
              <div className="text-xs text-muted-foreground truncate">{Info.desc}</div>
            </div>
            {j.done.includes(phase?.key) && <Badge className="rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-0">Concluída</Badge>}
          </div>

          {view === "briefing" && (
            <>
              <ChatPanel j={j} busy={busy} onSend={send} />
              {j.briefing && <BriefingSummary briefing={j.briefing} />}
            </>
          )}

          {view === "funil" && (
            <div className="grid sm:grid-cols-3 gap-3">
              {meta.funnels.map((f) => {
                const chosen = j.funnel === f.key;
                return (
                  <button key={f.key} disabled={!f.enabled || !!busy || !!j.funnel} onClick={() => chooseFunnel(f.key)}
                    className={`text-left rounded-3xl border p-5 transition-all ${chosen ? "border-primary bg-primary/10 ring-2 ring-primary/30" : f.enabled && !j.funnel ? "glass-card hover:border-primary/50 hover:-translate-y-0.5" : "glass-card opacity-55 cursor-not-allowed"}`}>
                    <div className="flex items-center justify-between">
                      <Workflow className={`w-5 h-5 ${chosen ? "text-primary" : "text-muted-foreground"}`} />
                      {chosen ? <Badge className="rounded-full border-0">Escolhido</Badge> : !f.enabled && <span className="text-[10px] flex items-center gap-1 text-muted-foreground"><Lock className="w-3 h-3" /> Em breve</span>}
                    </div>
                    <div className="mt-4 font-semibold text-sm">{f.label}</div>
                    <div className="mt-1 text-xs text-muted-foreground leading-relaxed">{FUNNEL_INFO[f.key]}</div>
                    {busy === "funnel" && !chosen && f.enabled && <Loader2 className="w-4 h-4 animate-spin mt-3" />}
                  </button>
                );
              })}
            </div>
          )}

          {GEN_STEPS.includes(view) && (
            <StepCard key={view} j={j} step={view} busy={busy === view} onGenerate={generate} onConfirm={confirm} onSave={saveStep} />
          )}

          {view === "aprovacao" && (j.meta?.campaign_id ? (
            <Card className="p-5 rounded-3xl text-sm space-y-3">
              <div className="flex items-center gap-2">
                <div className="font-semibold flex-1">Campanha publicada no Meta</div>
                <Badge className={`rounded-full border-0 ${j.meta.status === "ACTIVE" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}>
                  {j.meta.status === "ACTIVE" ? "Ativa" : "Pausada"}
                </Badge>
              </div>
              <div className="text-muted-foreground text-xs">
                {j.meta.adset_ids?.length} conjunto(s) · {j.meta.ad_ids?.length} anúncio(s) · ID {j.meta.campaign_id}.
                {j.landing_slug && <> Página: <a href={`/p/${j.landing_slug}`} target="_blank" rel="noreferrer" className="text-primary underline">/p/{j.landing_slug}</a></>}
              </div>
              <Button size="sm" variant={j.meta.status === "ACTIVE" ? "outline" : "default"} className="rounded-full" disabled={busy === "status"}
                onClick={() => run("status", () => api.post(`/journey/${j.id}/meta-status`, { active: j.meta.status !== "ACTIVE" }))}>
                {busy === "status" && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                {j.meta.status === "ACTIVE" ? "Pausar campanha" : "Ativar campanha"}
              </Button>
            </Card>
          ) : <PublishCard j={j} busy={busy === "approve"} onPublish={publish} />)}

          {view === "monitoramento" && (j.meta?.campaign_id ? (
            <MonitorCard j={j} busy={busy === "suggest"}
              onSuggest={(kind, context) => run("suggest", () => api.post(`/journey/${j.id}/suggest`, { kind, context }, { timeout: 180000 }))} />
          ) : (
            <Card className="p-8 rounded-3xl text-center text-sm text-muted-foreground">Publique a campanha para começar o monitoramento.</Card>
          ))}

          {/* navegação do wizard */}
          <div className="flex items-center justify-between pt-1">
            <Button variant="ghost" className="rounded-full" disabled={idx === 0} onClick={() => setView(phases[idx - 1].key)}>
              <ChevronLeft className="w-4 h-4 mr-1" /> Voltar
            </Button>
            <Button variant={canNext ? "default" : "outline"} className="rounded-full" disabled={!canNext} onClick={() => setView(phases[idx + 1].key)}>
              {canNext ? "Próxima etapa" : "Conclua esta etapa"} <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
