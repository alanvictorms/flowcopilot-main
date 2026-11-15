import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FlaskConical, Trophy, Loader2, Plus, Trash2, Play, Check } from "lucide-react";

import api, { formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";

const KINDS = [
  { value: "creative", label: "Criativo (A/B ads)" },
  { value: "audience", label: "Público (ad sets)" },
  { value: "offer", label: "Oferta" },
  { value: "budget", label: "Orçamento" },
  { value: "landing_page", label: "Landing page" },
];
const METRICS = [
  { value: "roas", label: "ROAS (maior vence)" },
  { value: "ctr", label: "CTR (maior vence)" },
  { value: "cpa", label: "CPA (menor vence)" },
  { value: "purchases", label: "Compras (maior vence)" },
];
const TARGET_TYPES = [
  { value: "ad", label: "Ad" },
  { value: "adset", label: "Ad Set" },
  { value: "campaign", label: "Campanha" },
];

const emptyExp = {
  name: "", hypothesis: "", kind: "creative", winning_metric: "roas",
  min_data_points: 500, duration_days: 7, budget_daily: 20,
  variants: [{ name: "A", target_type: "ad", target_id: "" }, { name: "B", target_type: "ad", target_id: "" }],
};

export default function Experiments() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(emptyExp);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState({});

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/experiments");
      setItems(data || []);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.post("/experiments", draft);
      toast.success("Experimento criado.");
      setOpen(false);
      setDraft(emptyExp);
      load();
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
    finally { setSaving(false); }
  };

  const evaluate = async (id) => {
    setBusy((b) => ({ ...b, [id]: "eval" }));
    try {
      const { data } = await api.post(`/experiments/${id}/evaluate`);
      toast.success(data.winner ? `Vencedor: ${data.winner.variant_name}` : "Sem vencedor ainda — dados insuficientes.");
      load();
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
    finally { setBusy((b) => ({ ...b, [id]: null })); }
  };

  const applyWinner = async (id) => {
    if (!confirm("Aplicar o vencedor e pausar as outras variantes no Meta?")) return;
    setBusy((b) => ({ ...b, [id]: "apply" }));
    try {
      await api.post(`/experiments/${id}/apply-winner`);
      toast.success("Vencedor aplicado.");
      load();
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
    finally { setBusy((b) => ({ ...b, [id]: null })); }
  };

  const del = async (id) => {
    if (!confirm("Excluir experimento?")) return;
    await api.delete(`/experiments/${id}`);
    load();
  };

  const addVariant = () => setDraft({ ...draft, variants: [...draft.variants, { name: String.fromCharCode(65 + draft.variants.length), target_type: draft.variants[0]?.target_type || "ad", target_id: "" }] });
  const removeVariant = (i) => setDraft({ ...draft, variants: draft.variants.filter((_, k) => k !== i) });

  return (
    <div className="space-y-6" data-testid="experiments-page">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">Motor de Experimentos</div>
          <h2 className="text-2xl font-semibold tracking-tight">Testes A/B</h2>
          <p className="text-xs text-muted-foreground mt-1">Compare variantes reais na sua conta e deixe a IA escolher o vencedor.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="rounded-full" data-testid="exp-new-btn"><Plus className="w-4 h-4 mr-1" /> Novo experimento</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>Novo experimento</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5 md:col-span-2">
                  <Label>Nome *</Label>
                  <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} data-testid="exp-name" />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label>Hipótese</Label>
                  <Textarea rows={2} value={draft.hypothesis} onChange={(e) => setDraft({ ...draft, hypothesis: e.target.value })} placeholder="Ex: Criativo com prova social terá CTR 30% maior." />
                </div>
                <div className="space-y-1.5">
                  <Label>Tipo</Label>
                  <Select value={draft.kind} onValueChange={(v) => setDraft({ ...draft, kind: v })}>
                    <SelectTrigger className="rounded-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{KINDS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Métrica vencedora</Label>
                  <Select value={draft.winning_metric} onValueChange={(v) => setDraft({ ...draft, winning_metric: v })}>
                    <SelectTrigger className="rounded-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{METRICS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Duração (dias)</Label>
                  <Input type="number" value={draft.duration_days} onChange={(e) => setDraft({ ...draft, duration_days: Number(e.target.value) })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Impressões mínimas por variante</Label>
                  <Input type="number" value={draft.min_data_points} onChange={(e) => setDraft({ ...draft, min_data_points: Number(e.target.value) })} />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Variantes</Label>
                  <Button size="sm" variant="ghost" onClick={addVariant}><Plus className="w-3.5 h-3.5 mr-1" /> Adicionar</Button>
                </div>
                <div className="space-y-2">
                  {draft.variants.map((v, i) => (
                    <div key={i} className="grid grid-cols-[60px_120px_1fr_auto] gap-2 items-center">
                      <Input value={v.name} onChange={(e) => { const arr = [...draft.variants]; arr[i] = { ...v, name: e.target.value }; setDraft({ ...draft, variants: arr }); }} />
                      <Select value={v.target_type} onValueChange={(val) => { const arr = [...draft.variants]; arr[i] = { ...v, target_type: val }; setDraft({ ...draft, variants: arr }); }}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{TARGET_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                      </Select>
                      <Input placeholder="Meta ID" value={v.target_id} onChange={(e) => { const arr = [...draft.variants]; arr[i] = { ...v, target_id: e.target.value }; setDraft({ ...draft, variants: arr }); }} />
                      <Button size="icon" variant="ghost" onClick={() => removeVariant(i)}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={save} disabled={saving || !draft.name || draft.variants.some((v) => !v.target_id)} className="rounded-full">
                {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null} Criar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? <div className="text-sm text-muted-foreground">Carregando…</div> : items.length === 0 ? (
        <Card className="p-10 rounded-2xl text-center text-xs text-muted-foreground">
          Nenhum experimento ainda. Crie o primeiro para descobrir o que realmente funciona.
        </Card>
      ) : (
        <div className="space-y-4">
          {items.map((exp) => (
            <Card key={exp.id} className="p-6 rounded-2xl" data-testid={`exp-${exp.id}`}>
              <div className="flex items-start gap-3 mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="text-sm font-semibold">{exp.name}</div>
                    <Badge variant="outline" className="rounded-full text-[10px]">{exp.kind}</Badge>
                    <Badge className={`rounded-full text-[10px] ${exp.status === "completed" ? "bg-primary/10 text-primary border-primary/30" : "bg-yellow-500/10 text-yellow-600 border-yellow-500/30"}`}>
                      {exp.status}
                    </Badge>
                    {exp.winner && (
                      <Badge className="rounded-full text-[10px] bg-primary/10 text-primary border border-primary/30">
                        <Trophy className="w-3 h-3 mr-1" /> Vencedor: {exp.winner.variant_name}
                      </Badge>
                    )}
                  </div>
                  {exp.hypothesis && <div className="text-xs text-muted-foreground">{exp.hypothesis}</div>}
                  <div className="text-[11px] font-mono text-muted-foreground mt-1">
                    Métrica: {exp.winning_metric} · Duração: {exp.duration_days}d · Min impressões: {exp.min_data_points}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" variant="outline" className="rounded-full" onClick={() => evaluate(exp.id)} disabled={busy[exp.id]}>
                    {busy[exp.id] === "eval" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                  </Button>
                  {exp.winner && !exp.applied && (
                    <Button size="sm" className="rounded-full" onClick={() => applyWinner(exp.id)} disabled={busy[exp.id]}>
                      {busy[exp.id] === "apply" ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1" />}
                      Aplicar
                    </Button>
                  )}
                  <Button size="icon" variant="ghost" onClick={() => del(exp.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              </div>
              {exp.results?.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {exp.results.map((r, i) => (
                    <div key={i} className={`p-3 rounded-xl border ${exp.winner?.target_id === r.target_id ? "border-primary bg-primary/5" : "border-border"}`}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-sm font-semibold">{r.variant_name}</div>
                        <div className="text-lg font-semibold tracking-tighter">{r.metric_value}</div>
                      </div>
                      <div className="text-[11px] font-mono text-muted-foreground">
                        Spend {r.spend} · Impr {r.impressions.toLocaleString()} · CTR {r.ctr}% · Purch {r.purchases}
                      </div>
                      {!r.sufficient_data && <div className="text-[10px] text-yellow-600 mt-1">⚠ Dados insuficientes</div>}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
