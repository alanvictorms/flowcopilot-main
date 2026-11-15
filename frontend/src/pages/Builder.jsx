import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Rocket, Trash2, Loader2, Wand2, CheckCircle2, Image as ImageIcon, Globe, Pencil, Save, X, Sparkles } from "lucide-react";

import api, { formatApiError, API_BASE } from "@/lib/api";
import EmptyMetaState from "@/components/EmptyMetaState";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import BuilderManualWizard from "@/pages/BuilderManualWizard";

const OBJECTIVES = [
  { value: "OUTCOME_SALES", label: "Vendas / Compras" },
  { value: "OUTCOME_LEADS", label: "Leads" },
  { value: "OUTCOME_ENGAGEMENT", label: "Engajamento" },
  { value: "OUTCOME_TRAFFIC", label: "Tráfego" },
  { value: "OUTCOME_AWARENESS", label: "Reconhecimento" },
  { value: "OUTCOME_APP_PROMOTION", label: "Instalação de app" },
];

function AIForm({ onCreated }) {
  const [form, setForm] = useState({
    product: "",
    offer: "",
    audience: "",
    objective: "OUTCOME_SALES",
    budget_daily: 20,
    country: "BR",
    landing_page_url: "",
    extra: "",
  });
  const [creating, setCreating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState("");
  const timerRef = useRef(null);

  const PHASES = [
    { at: 0, label: "Lendo seu produto e público…" },
    { at: 25, label: "Analisando a página de vendas…" },
    { at: 50, label: "Definindo objetivo, verba e segmentação…" },
    { at: 72, label: "Escrevendo os anúncios e prompts de imagem…" },
    { at: 90, label: "Finalizando o rascunho…" },
  ];

  const generate = async () => {
    if (!form.product.trim()) return toast.error("Informe o produto/oferta.");
    setCreating(true);
    setProgress(6);
    setPhase(PHASES[0].label);
    // Progresso "confortável": avança sozinho até 92% enquanto a IA trabalha.
    timerRef.current = setInterval(() => {
      setProgress((p) => {
        const next = p < 70 ? p + 3 : p < 92 ? p + 1 : p;
        const ph = [...PHASES].reverse().find((x) => next >= x.at);
        if (ph) setPhase(ph.label);
        return next;
      });
    }, 350);
    try {
      const { data } = await api.post("/builder/draft", form);
      setProgress(100);
      setPhase("Pronto!");
      toast.success(data.landing_page_used ? "Rascunho gerado com base na sua página." : "Rascunho gerado pela IA.");
      onCreated?.();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      if (timerRef.current) clearInterval(timerRef.current);
      setTimeout(() => { setCreating(false); setProgress(0); setPhase(""); }, 500);
    }
  };

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  return (
    <Card className="p-6 rounded-2xl relative overflow-hidden">
      {creating && (
        <div className="absolute inset-0 z-10 bg-background/85 backdrop-blur-sm flex flex-col items-center justify-center gap-4 p-6 text-center" data-testid="builder-loading">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
            <Sparkles className="w-7 h-7 text-primary animate-pulse" />
          </div>
          <div className="text-sm font-semibold">Gerando sua campanha com IA</div>
          <div className="text-xs text-muted-foreground h-4 transition-all">{phase}</div>
          <div className="w-full max-w-sm">
            <Progress value={progress} className="h-2" />
            <div className="text-[10px] text-muted-foreground text-right mt-1 tabular-nums">{Math.round(progress)}%</div>
          </div>
        </div>
      )}
      <div className="text-lg font-semibold mb-1">Descreva sua campanha</div>
      <div className="text-xs text-muted-foreground mb-6">
        A IA vai gerar nome, objetivo, público, orçamento, textos e prompts de imagem como rascunho.
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5 md:col-span-2">
          <Label>Produto ou oferta *</Label>
          <Textarea
            rows={2}
            placeholder="Ex: Curso online de finanças para autônomos, 12 semanas, R$ 497 à vista"
            value={form.product}
            onChange={(e) => setForm({ ...form, product: e.target.value })}
            data-testid="builder-product"
          />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label className="flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" /> Página de vendas (URL)</Label>
          <Input
            placeholder="https://sua-landing.com/oferta (opcional — a IA lê benefícios e prova social)"
            value={form.landing_page_url}
            onChange={(e) => setForm({ ...form, landing_page_url: e.target.value })}
            data-testid="builder-lp"
          />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label>Diferencial da oferta</Label>
          <Input
            placeholder="Ex: bônus + garantia de 7 dias"
            value={form.offer}
            onChange={(e) => setForm({ ...form, offer: e.target.value })}
            data-testid="builder-offer"
          />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label>Público-alvo</Label>
          <Textarea
            rows={2}
            placeholder="Ex: homens e mulheres 28-50, empreendedores, interessados em finanças e educação"
            value={form.audience}
            onChange={(e) => setForm({ ...form, audience: e.target.value })}
            data-testid="builder-audience"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Objetivo</Label>
          <Select value={form.objective} onValueChange={(v) => setForm({ ...form, objective: v })}>
            <SelectTrigger className="rounded-full" data-testid="builder-objective"><SelectValue /></SelectTrigger>
            <SelectContent>
              {OBJECTIVES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>País (código)</Label>
          <Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value.toUpperCase() })} maxLength={2} />
        </div>
        <div className="space-y-1.5">
          <Label>Orçamento diário (R$)</Label>
          <Input type="number" value={form.budget_daily} onChange={(e) => setForm({ ...form, budget_daily: Number(e.target.value) })} data-testid="builder-budget" />
        </div>
        <div className="space-y-1.5">
          <Label>Notas adicionais</Label>
          <Input placeholder="Opcional" value={form.extra} onChange={(e) => setForm({ ...form, extra: e.target.value })} />
        </div>
      </div>
      <div className="mt-6 flex justify-end">
        <Button onClick={generate} disabled={creating} className="rounded-full" data-testid="builder-generate-btn">
          {creating ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Wand2 className="w-4 h-4 mr-1" />}
          Gerar rascunho com IA
        </Button>
      </div>
    </Card>
  );
}

function ManualForm({ onCreated }) {
  return <BuilderManualWizard onDone={onCreated} />;
}

function DraftCard({ d, onChange }) {
  const draft = d.draft || {};
  const [publishing, setPublishing] = useState(false);
  const [gen, setGen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [edit, setEdit] = useState({
    name: draft.name || "",
    daily_budget: draft.daily_budget_cents ? draft.daily_budget_cents / 100 : (d.input?.budget_daily || 20),
    ads: (draft.ads || []).map((a) => ({ ...a })),
  });
  const hasImages = (d.images_count || 0) > 0;

  const publish = async () => {
    if (!confirm("Publicar como campanha PAUSADA no Meta? Você poderá ativar depois de revisar.")) return;
    setPublishing(true);
    try {
      const { data } = await api.post(`/builder/drafts/${d.id}/publish`);
      toast.success(`Campanha criada no Meta (ID ${data.meta_campaign_id}) — status Pausada.`);
      onChange?.();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setPublishing(false);
    }
  };

  const generateImages = async () => {
    setGen(true);
    try {
      const { data } = await api.post(`/builder/drafts/${d.id}/generate-images`);
      if (data.count > 0) {
        toast.success(`${data.count} imagem(ns) gerada(s).`);
      } else {
        toast.error(
          data.error_sample
            ? `Nenhuma imagem gerada. Erro: ${String(data.error_sample).slice(0, 160)}`
            : "Nenhuma imagem foi gerada (o gerador de imagem pode estar indisponível na sua chave)."
        );
      }
      onChange?.();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setGen(false);
    }
  };

  const del = async () => {
    if (!confirm("Excluir este rascunho?")) return;
    await api.delete(`/builder/drafts/${d.id}`);
    onChange?.();
  };

  const saveEdits = async () => {
    setSaving(true);
    try {
      await api.patch(`/builder/drafts/${d.id}`, {
        name: edit.name,
        daily_budget_cents: Math.round((edit.daily_budget || 0) * 100),
        ads: edit.ads,
      });
      toast.success("Rascunho atualizado.");
      setEditing(false);
      onChange?.();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally { setSaving(false); }
  };

  const numAds = (draft.ads || []).length;

  return (
    <Card className="p-6 rounded-2xl" data-testid={`draft-${d.id}`}>
      <div className="flex items-start justify-between mb-2 gap-2">
        <div className="flex-1 min-w-0">
          {editing ? (
            <Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className="h-8 text-sm font-semibold" data-testid={`draft-edit-name-${d.id}`} />
          ) : (
            <div className="text-sm font-semibold truncate">{draft.name || "(sem nome)"}</div>
          )}
          <div className="text-[11px] text-muted-foreground font-mono truncate">
            {draft.objective || d.input?.objective}
          </div>
        </div>
        {d.published && (
          <Badge className="bg-primary/10 text-primary border border-primary/30 rounded-full">
            <CheckCircle2 className="w-3 h-3 mr-1" /> Publicada
          </Badge>
        )}
      </div>
      <div className="text-xs text-muted-foreground mb-3 line-clamp-2">{d.input?.product}</div>

      <div className="flex flex-wrap gap-2 mb-3 text-[10px] font-mono uppercase items-center">
        {editing ? (
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground normal-case">R$</span>
            <Input type="number" value={edit.daily_budget} onChange={(e) => setEdit({ ...edit, daily_budget: Number(e.target.value) })} className="h-6 w-24 text-xs" />
            <span className="text-muted-foreground normal-case">/dia</span>
          </div>
        ) : (
          draft.daily_budget_cents ? (
            <span className="px-2 py-0.5 rounded-full bg-muted">R$ {(draft.daily_budget_cents / 100).toFixed(2)}/dia</span>
          ) : null
        )}
        {numAds > 0 && <span className="px-2 py-0.5 rounded-full bg-muted">{numAds} anúncios</span>}
        {d.landing_page_snippet && <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary">LP lida</span>}
      </div>

      {/* Ads preview / edit */}
      {editing ? (
        <div className="space-y-2 mb-3">
          {edit.ads.map((ad, i) => (
            <div key={i} className="rounded-lg border border-border p-3 space-y-1.5">
              <Input value={ad.headline || ""} placeholder="Título" onChange={(e) => {
                const copy = edit.ads.slice(); copy[i] = { ...ad, headline: e.target.value }; setEdit({ ...edit, ads: copy });
              }} className="h-7 text-xs" maxLength={40} />
              <Textarea rows={2} value={ad.primary_text || ""} placeholder="Texto principal" onChange={(e) => {
                const copy = edit.ads.slice(); copy[i] = { ...ad, primary_text: e.target.value }; setEdit({ ...edit, ads: copy });
              }} className="text-xs resize-none" />
              <Input value={ad.description || ""} placeholder="Descrição (30 chars)" onChange={(e) => {
                const copy = edit.ads.slice(); copy[i] = { ...ad, description: e.target.value }; setEdit({ ...edit, ads: copy });
              }} className="h-7 text-xs" maxLength={30} />
            </div>
          ))}
        </div>
      ) : (
        numAds > 0 && (
          <div className="grid grid-cols-3 gap-2 mb-3">
            {(draft.ads || []).slice(0, 3).map((ad, i) => (
              <div key={i} className="rounded-lg border border-border bg-card overflow-hidden">
                {hasImages ? (
                  <img
                    src={`${API_BASE}/builder/drafts/${d.id}/image/${i}?t=${encodeURIComponent(localStorage.getItem("mfa_token") || "")}`}
                    alt=""
                    className="w-full h-20 object-cover"
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                  />
                ) : (
                  <div className="w-full h-20 bg-muted flex items-center justify-center">
                    <ImageIcon className="w-4 h-4 text-muted-foreground" />
                  </div>
                )}
                <div className="p-2">
                  <div className="text-[10px] font-semibold truncate">{ad.headline || ad.name}</div>
                  <div className="text-[9px] text-muted-foreground line-clamp-2">{ad.primary_text}</div>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      <div className="flex flex-wrap gap-2 mt-3">
        {editing ? (
          <>
            <Button size="sm" onClick={saveEdits} disabled={saving} className="rounded-full" data-testid={`save-edit-${d.id}`}>
              {saving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1" />}
              Salvar
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(false)} className="rounded-full">
              <X className="w-3.5 h-3.5 mr-1" /> Cancelar
            </Button>
          </>
        ) : (
          <>
            {!d.published && (
              <Button size="sm" onClick={publish} disabled={publishing} className="rounded-full" data-testid={`publish-${d.id}`}>
                {publishing ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Rocket className="w-3.5 h-3.5 mr-1" />}
                Publicar (Pausada)
              </Button>
            )}
            {!d.published && (
              <Button size="sm" variant="outline" onClick={() => setEditing(true)} className="rounded-full" data-testid={`edit-${d.id}`}>
                <Pencil className="w-3.5 h-3.5 mr-1" /> Editar
              </Button>
            )}
            {numAds > 0 && !hasImages && (
              <Button size="sm" variant="outline" onClick={generateImages} disabled={gen} className="rounded-full" data-testid={`gen-images-${d.id}`}>
                {gen ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5 mr-1" />}
                Gerar imagens IA
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={del} className="rounded-full">
              <Trash2 className="w-3.5 h-3.5 mr-1" /> Excluir
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}

export default function Builder() {
  const [drafts, setDrafts] = useState([]);
  const [notConnected, setNotConnected] = useState(false);

  const loadDrafts = async () => {
    try {
      const { data } = await api.get("/builder/drafts");
      const enriched = (data || []).map((d) => ({ ...d, images_count: d.images?.length || 0 }));
      setDrafts(enriched);
    } catch (err) {
      if (err.response?.status === 428) setNotConnected(true);
    }
  };

  useEffect(() => { loadDrafts(); }, []);

  if (notConnected) return <EmptyMetaState />;

  return (
    <div className="space-y-6" data-testid="builder-page">
      <Tabs defaultValue="ai" className="w-full">
        <TabsList>
          <TabsTrigger value="ai" data-testid="tab-ai"><Wand2 className="w-3.5 h-3.5 mr-1" /> Criar com IA</TabsTrigger>
          <TabsTrigger value="manual" data-testid="tab-manual"><Rocket className="w-3.5 h-3.5 mr-1" /> Criar manualmente</TabsTrigger>
        </TabsList>
        <TabsContent value="ai" className="mt-4">
          <AIForm onCreated={loadDrafts} />
        </TabsContent>
        <TabsContent value="manual" className="mt-4">
          <ManualForm onCreated={loadDrafts} />
        </TabsContent>
      </Tabs>

      <div>
        <div className="text-lg font-semibold mb-3">Rascunhos</div>
        {drafts.length === 0 ? (
          <Card className="p-8 rounded-2xl text-center text-xs text-muted-foreground">
            Nenhum rascunho ainda. Preencha o formulário acima e gere seu primeiro.
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {drafts.map((d) => <DraftCard key={d.id} d={d} onChange={loadDrafts} />)}
          </div>
        )}
      </div>
    </div>
  );
}
