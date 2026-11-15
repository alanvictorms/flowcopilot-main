import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Zap, RefreshCw, Pencil, FlaskConical } from "lucide-react";

import api, { formatApiError } from "@/lib/api";
import EmptyMetaState from "@/components/EmptyMetaState";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Métricas com nome amigável e unidade — para o usuário entender o que configura.
const METRICS = [
  { value: "spend", label: "Gasto", unit: "R$" },
  { value: "impressions", label: "Impressões", unit: "" },
  { value: "clicks", label: "Cliques", unit: "" },
  { value: "ctr", label: "CTR (taxa de clique)", unit: "%" },
  { value: "cpc", label: "CPC (custo por clique)", unit: "R$" },
  { value: "cpm", label: "CPM (custo por mil)", unit: "R$" },
  { value: "frequency", label: "Frequência", unit: "x" },
  { value: "purchases", label: "Conversões", unit: "" },
  { value: "roas", label: "ROAS (retorno)", unit: "x" },
];
const OPERATORS = [
  { value: ">", label: "maior que" },
  { value: ">=", label: "maior ou igual a" },
  { value: "<", label: "menor que" },
  { value: "<=", label: "menor ou igual a" },
  { value: "==", label: "igual a" },
  { value: "!=", label: "diferente de" },
];
const ACTIONS = [
  { value: "pause", label: "Pausar", verb: "Pausar" },
  { value: "activate", label: "Ativar", verb: "Ativar" },
  { value: "change_budget", label: "Alterar orçamento (adset)", verb: "Alterar o orçamento" },
  { value: "notify", label: "Apenas notificar", verb: "Me notificar (sem alterar nada)" },
];
const SCOPES = [
  { value: "campaign", label: "Campanha", one: "a campanha" },
  { value: "adset", label: "Conjunto (Ad Set)", one: "o conjunto" },
  { value: "ad", label: "Anúncio", one: "o anúncio" },
];
const WINDOWS = [
  { value: "today", label: "Hoje" },
  { value: "yesterday", label: "Ontem" },
  { value: "last_3d", label: "Últimos 3 dias" },
  { value: "last_7d", label: "Últimos 7 dias" },
  { value: "last_14d", label: "Últimos 14 dias" },
  { value: "last_30d", label: "Últimos 30 dias" },
];

const emptyRule = {
  name: "",
  enabled: true,
  scope: "campaign",
  logic: "all",
  window: "last_7d",
  conditions: [{ metric: "spend", operator: ">", value: 100 }],
  action: { type: "pause", params: {} },
};

const metricOf = (v) => METRICS.find((m) => m.value === v) || { label: v, unit: "" };
const fmtVal = (metric, value) => {
  const u = metricOf(metric).unit;
  if (u === "R$") return `R$ ${value}`;
  if (u === "%") return `${value}%`;
  if (u === "x") return `${value}x`;
  return `${value}`;
};

// Frase em português puro descrevendo a regra — gera confiança.
function describeRule(r) {
  const scope = SCOPES.find((s) => s.value === r.scope) || SCOPES[0];
  const win = (WINDOWS.find((w) => w.value === r.window) || {}).label?.toLowerCase();
  const join = r.logic === "all" ? " E " : " OU ";
  const conds = (r.conditions || [])
    .map((c) => {
      const op = (OPERATORS.find((o) => o.value === c.operator) || {}).label || c.operator;
      return `${metricOf(c.metric).label} ${op} ${fmtVal(c.metric, c.value)}`;
    })
    .join(join);
  const act = ACTIONS.find((a) => a.value === r.action?.type) || ACTIONS[0];
  return { scopeOne: scope.one, win, conds: conds || "—", verb: act.verb };
}

export default function Rules() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notConnected, setNotConnected] = useState(false);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(emptyRule);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [runningId, setRunningId] = useState(null);
  const [events, setEvents] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/rules");
      setRules(data || []);
      const ev = await api.get("/rules/events/recent");
      setEvents(ev.data || []);
    } catch (err) {
      if (err.response?.status === 428) setNotConnected(true);
      else toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openNew = () => { setDraft(emptyRule); setEditingId(null); setOpen(true); };
  const openEdit = (r) => {
    setDraft({ ...emptyRule, ...r, action: r.action || { type: "pause", params: {} } });
    setEditingId(r.id);
    setOpen(true);
  };

  const addCondition = () =>
    setDraft((d) => ({ ...d, conditions: [...d.conditions, { metric: "ctr", operator: "<", value: 1 }] }));
  const removeCondition = (i) =>
    setDraft((d) => ({ ...d, conditions: d.conditions.filter((_, k) => k !== i) }));
  const setCond = (i, patch) =>
    setDraft((d) => {
      const arr = d.conditions.slice();
      arr[i] = { ...arr[i], ...patch };
      return { ...d, conditions: arr };
    });

  const save = async () => {
    setSaving(true);
    try {
      if (editingId) {
        await api.patch(`/rules/${editingId}`, draft);
        toast.success("Regra atualizada.");
      } else {
        await api.post("/rules", draft);
        toast.success("Regra criada.");
      }
      setOpen(false);
      setDraft(emptyRule);
      setEditingId(null);
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || err.message);
    } finally {
      setSaving(false);
    }
  };

  const runRule = async (id, dryRun) => {
    setRunningId(id);
    try {
      const { data } = await api.post(`/rules/${id}/run`, null, { params: { dry_run: dryRun } });
      const matched = data.matches?.length || 0;
      const applied = data.applied?.length || 0;
      if (dryRun) toast.success(`Simulação: ${matched} objeto(s) casariam com a regra.`);
      else toast.success(`Executada: ${applied}/${matched} alterações aplicadas.`);
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setRunningId(null);
    }
  };

  const del = async (id) => {
    if (!confirm("Excluir esta regra?")) return;
    await api.delete(`/rules/${id}`);
    toast.success("Regra excluída.");
    load();
  };

  const toggleEnabled = async (rule, enabled) => {
    try {
      await api.patch(`/rules/${rule.id}`, { ...rule, enabled });
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  if (notConnected) return <EmptyMetaState />;

  const d = describeRule(draft);

  return (
    <div className="space-y-4" data-testid="rules-page">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Automações</div>
          <h2 className="text-2xl font-semibold tracking-tight">Regras</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Diga ao agente “se isso acontecer, faça aquilo”. Teste em <b>Simular</b> antes de deixar ativa.
          </p>
        </div>
        <Button variant="outline" size="icon" onClick={load} data-testid="rules-refresh-btn">
          <RefreshCw className="w-4 h-4" />
        </Button>
        <Button onClick={openNew} data-testid="rules-new-btn">
          <Plus className="w-4 h-4 mr-1" /> Nova regra
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar regra" : "Nova regra"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            <div className="space-y-1.5">
              <Label>Nome da regra</Label>
              <Input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Ex: Pausar campanhas gastando sem converter"
                data-testid="rule-name-input"
              />
            </div>

            {/* SE — condições */}
            <div className="rounded-2xl border border-border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">
                  <span className="text-primary">SE</span> — quando avaliar
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Casar</span>
                  <Select value={draft.logic} onValueChange={(v) => setDraft({ ...draft, logic: v })}>
                    <SelectTrigger className="h-8 w-[150px]" data-testid="rule-logic"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">TODAS as condições</SelectItem>
                      <SelectItem value="any">QUALQUER condição</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                {draft.conditions.map((c, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <Select value={c.metric} onValueChange={(v) => setCond(i, { metric: v })}>
                      <SelectTrigger className="flex-1 min-w-[160px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {METRICS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={c.operator} onValueChange={(v) => setCond(i, { operator: v })}>
                      <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {OPERATORS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <div className="relative w-[120px]">
                      {metricOf(c.metric).unit === "R$" && (
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
                      )}
                      <Input
                        type="number"
                        className={metricOf(c.metric).unit === "R$" ? "pl-8" : ""}
                        value={c.value}
                        onChange={(e) => setCond(i, { value: Number(e.target.value) })}
                      />
                      {["%", "x"].includes(metricOf(c.metric).unit) && (
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{metricOf(c.metric).unit}</span>
                      )}
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => removeCondition(i)} disabled={draft.conditions.length === 1}>
                      <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
                <Button size="sm" variant="ghost" onClick={addCondition} data-testid="rule-add-condition">
                  <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar condição
                </Button>
              </div>
            </div>

            {/* Onde / período */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Aplicar em</Label>
                <Select value={draft.scope} onValueChange={(v) => setDraft({ ...draft, scope: v })}>
                  <SelectTrigger data-testid="rule-scope"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SCOPES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Período dos dados</Label>
                <Select value={draft.window} onValueChange={(v) => setDraft({ ...draft, window: v })}>
                  <SelectTrigger data-testid="rule-window"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {WINDOWS.map((w) => <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* ENTÃO — ação */}
            <div className="rounded-2xl border border-border p-4 space-y-3">
              <div className="text-sm font-semibold"><span className="text-primary">ENTÃO</span> — o que fazer</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Select value={draft.action.type} onValueChange={(v) => setDraft({ ...draft, action: { type: v, params: {} } })}>
                  <SelectTrigger data-testid="rule-action-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ACTIONS.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                {draft.action.type === "change_budget" && draft.scope === "adset" && (
                  <div className="relative">
                    <Input
                      type="number"
                      value={draft.action.params?.daily_budget || ""}
                      onChange={(e) =>
                        setDraft({ ...draft, action: { ...draft.action, params: { ...draft.action.params, daily_budget: Number(e.target.value) } } })
                      }
                      placeholder="Novo orçamento diário (centavos)"
                    />
                  </div>
                )}
              </div>
              {draft.action.type === "change_budget" && draft.scope !== "adset" && (
                <div className="text-[11px] text-amber-600 dark:text-amber-400">
                  Alterar orçamento só funciona no escopo “Conjunto (Ad Set)”. Ajuste o campo “Aplicar em”.
                </div>
              )}
            </div>

            {/* Prévia em linguagem natural */}
            <div className="rounded-2xl bg-primary/5 border border-primary/20 p-4" data-testid="rule-preview">
              <div className="text-[10px] font-mono uppercase tracking-widest text-primary mb-1">Prévia</div>
              <p className="text-sm leading-relaxed">
                Para cada <b>{d.scopeOne}</b>, avaliando os dados de <b>{d.win}</b>, <b className="text-primary">se</b> {d.conds}
                , <b className="text-primary">então</b> {d.verb}.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving || !draft.name} data-testid="rule-save-btn">
              {saving ? "Salvando…" : editingId ? "Salvar alterações" : "Criar regra"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader className="pb-2">
          <div className="text-sm font-semibold">Regras configuradas</div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-xs text-muted-foreground">Carregando…</div>
          ) : rules.length === 0 ? (
            <div className="py-10 text-center">
              <FlaskConical className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <div className="text-sm text-muted-foreground">Nenhuma regra ainda.</div>
              <Button variant="outline" size="sm" className="mt-3 rounded-full" onClick={openNew}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Criar primeira regra
              </Button>
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {rules.map((r) => {
                const rd = describeRule(r);
                return (
                  <li key={r.id} className="py-3 flex flex-wrap items-center gap-3" data-testid={`rule-row-${r.id}`}>
                    <Switch checked={r.enabled} onCheckedChange={(v) => toggleEnabled(r, v)} data-testid={`rule-toggle-${r.id}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{r.name}</div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        se {rd.conds} → {rd.verb}
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px] font-mono">{r.action?.type}</Badge>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => runRule(r.id, true)} disabled={runningId === r.id} data-testid={`rule-dryrun-${r.id}`}>
                        Simular
                      </Button>
                      <Button size="sm" onClick={() => runRule(r.id, false)} disabled={runningId === r.id} data-testid={`rule-execute-${r.id}`}>
                        <Zap className="w-3.5 h-3.5 mr-1" /> Executar
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => openEdit(r)} data-testid={`rule-edit-${r.id}`}>
                        <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => del(r.id)}>
                        <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {events.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="text-sm font-semibold">Eventos recentes</div>
            <div className="text-xs text-muted-foreground">Histórico de execuções e mudanças</div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-xs font-mono">
              {events.map((e, i) => (
                <li key={i} className="flex gap-2 text-muted-foreground">
                  <span className="shrink-0">{new Date(e.created_at).toLocaleString()}</span>
                  <span className="text-foreground">·</span>
                  <span className="uppercase">{e.kind}</span>
                  <span>{e.target_type ? `→ ${e.target_type} ${e.target_id}` : ""}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
