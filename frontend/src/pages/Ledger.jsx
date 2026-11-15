import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";

import api, { formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";

const KIND_LABEL = {
  manual: "Manual",
  auto_cycle: "Ciclo IA",
  ai_suggest: "Sugestão IA",
  rule: "Regra",
  rule_notify: "Notificação de regra",
  cycle_run: "Ciclo de automação",
  control_plane: "Control Plane",
};

const KIND_COLORS = {
  manual: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  auto_cycle: "bg-primary/10 text-primary",
  ai_suggest: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  rule: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  rule_notify: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  cycle_run: "bg-neutral-500/10 text-neutral-600 dark:text-neutral-400",
  control_plane: "bg-primary/10 text-primary",
};

const DECISION_KIND = {
  action_executed: { label: "Executada", cls: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  action_verified: { label: "Verificada · mantida", cls: "bg-green-500/10 text-green-600 dark:text-green-400" },
  action_rolled_back: { label: "Revertida (rollback)", cls: "bg-orange-500/10 text-orange-600 dark:text-orange-400" },
  action_rejected: { label: "Rejeitada", cls: "bg-muted text-muted-foreground" },
  action_blocked: { label: "Bloqueada", cls: "bg-red-500/10 text-red-600 dark:text-red-400" },
  action_failed: { label: "Falhou", cls: "bg-red-500/10 text-red-600 dark:text-red-400" },
  rollback_failed: { label: "Rollback falhou", cls: "bg-red-500/10 text-red-600 dark:text-red-400" },
};

const ACTOR_LABEL = { user: "Usuário", rule: "Regra", ai: "IA", system: "Sistema" };

function stateSummary(st) {
  if (!st || typeof st !== "object") return "";
  const parts = [];
  if (st.status) parts.push(st.status);
  if (st.effective_status && st.effective_status !== st.status) parts.push(st.effective_status);
  if (st.daily_budget) parts.push(`orç. ${(Number(st.daily_budget) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}/dia`);
  return parts.join(" · ");
}

export default function Ledger() {
  const [data, setData] = useState(null);
  const [stats, setStats] = useState(null);
  const [decisions, setDecisions] = useState([]);
  const [decisionStats, setDecisionStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [kindFilter, setKindFilter] = useState("all");
  const [decisionFilter, setDecisionFilter] = useState("all");

  const load = async () => {
    setLoading(true);
    try {
      const [e, s, d, ds] = await Promise.all([
        api.get("/ledger/entries", { params: { limit: 200 } }),
        api.get("/ledger/stats"),
        api.get("/ledger/decisions", { params: { limit: 200 } }),
        api.get("/ledger/decisions/stats"),
      ]);
      setData(e.data);
      setStats(s.data);
      setDecisions(d.data || []);
      setDecisionStats(ds.data);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const combined = useMemo(() => {
    if (!data) return [];
    const items = [
      ...(data.events || []).map((e) => ({ ...e, source: "event" })),
      ...(data.runs || []).map((r) => ({ ...r, source: "run" })),
    ];
    items.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
    return kindFilter === "all" ? items : items.filter((i) => i.kind === kindFilter);
  }, [data, kindFilter]);

  const filteredDecisions = useMemo(() => (
    decisionFilter === "all" ? decisions : decisions.filter((d) => d.kind === decisionFilter)
  ), [decisions, decisionFilter]);

  return (
    <div className="space-y-6" data-testid="ledger-page">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-6 rounded-2xl">
          <div className="text-xs text-muted-foreground mb-2">Decisões no ledger</div>
          <div className="text-3xl font-semibold tracking-tighter">{decisionStats?.total ?? "—"}</div>
        </Card>
        <Card className="p-6 rounded-2xl">
          <div className="text-xs text-muted-foreground mb-2">Executadas</div>
          <div className="text-3xl font-semibold tracking-tighter">{decisionStats?.executed ?? "0"}</div>
        </Card>
        <Card className="p-6 rounded-2xl">
          <div className="text-xs text-muted-foreground mb-2">Revertidas (rollback)</div>
          <div className="text-3xl font-semibold tracking-tighter">{decisionStats?.rolled_back ?? "0"}</div>
        </Card>
        <Card className="p-6 rounded-2xl">
          <div className="text-xs text-muted-foreground mb-2">Bloqueadas pelo comitê</div>
          <div className="text-3xl font-semibold tracking-tighter">{decisionStats?.blocked ?? "0"}</div>
        </Card>
      </div>

      <Tabs defaultValue="control-plane">
        <TabsList className="rounded-full">
          <TabsTrigger value="control-plane" className="rounded-full" data-testid="ledger-tab-cp">Control Plane</TabsTrigger>
          <TabsTrigger value="legacy" className="rounded-full" data-testid="ledger-tab-legacy">Histórico geral</TabsTrigger>
        </TabsList>

        <TabsContent value="control-plane">
          <Card className="p-6 rounded-2xl">
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <div className="flex-1">
                <div className="text-lg font-semibold">Decision Ledger</div>
                <div className="text-xs text-muted-foreground">
                  Registro imutável: quem decidiu, com que evidência, estado antes/depois e resultado da verificação.
                </div>
              </div>
              <Select value={decisionFilter} onValueChange={setDecisionFilter}>
                <SelectTrigger className="w-[200px] rounded-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  {Object.keys(DECISION_KIND).map((k) => (
                    <SelectItem key={k} value={k}>{DECISION_KIND[k].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" className="rounded-full" onClick={load}>
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              </Button>
            </div>

            {loading ? (
              <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
            ) : filteredDecisions.length === 0 ? (
              <div className="text-center py-10 text-xs text-muted-foreground">
                Nenhuma decisão do Control Plane ainda. Ações executadas via aprovações, regras ou orquestrador aparecerão aqui.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {filteredDecisions.map((d, i) => {
                  const meta = DECISION_KIND[d.kind] || { label: d.kind, cls: "bg-muted text-muted-foreground" };
                  return (
                    <li key={d.id || i} className="py-3 flex items-start gap-3" data-testid={`ledger-decision-${i}`}>
                      <Badge className={`rounded-full text-[10px] font-mono uppercase border-0 ${meta.cls}`}>
                        {meta.label}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">
                          {d.action_type} · {d.target_name || d.target_id}
                          <span className="ml-2 text-[10px] uppercase text-muted-foreground">{d.target_type}</span>
                        </div>
                        {(d.before_state || d.after_state) && (
                          <div className="text-[11px] font-mono text-muted-foreground truncate">
                            {stateSummary(d.before_state)} → {stateSummary(d.after_state)}
                          </div>
                        )}
                        {d.reason && <div className="text-[11px] text-muted-foreground truncate">{d.reason}</div>}
                        {d.verification && (
                          <div className="text-[11px] font-mono mt-0.5">
                            Verificação: {d.verification.metric?.toUpperCase()} {d.verification.change_pct > 0 ? "+" : ""}{d.verification.change_pct}%
                            {d.verification.degraded ? " · degradou" : " · dentro do aceitável"}
                          </div>
                        )}
                        <div className="text-[11px] text-muted-foreground mt-0.5 flex flex-wrap gap-2">
                          <span>{new Date(d.created_at).toLocaleString("pt-BR")}</span>
                          <span>ator: {ACTOR_LABEL[d.actor] || d.actor}</span>
                          {typeof d.confidence === "number" && <span>confiança {(d.confidence * 100).toFixed(0)}%</span>}
                          {d.risk && <span>risco {d.risk}</span>}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="legacy">
          <Card className="p-6 rounded-2xl">
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <div className="flex-1">
                <div className="text-lg font-semibold">Histórico geral</div>
                <div className="text-xs text-muted-foreground">Eventos de otimização e ciclos do orquestrador</div>
              </div>
              <Select value={kindFilter} onValueChange={setKindFilter}>
                <SelectTrigger className="w-[180px] rounded-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  {Object.keys(KIND_LABEL).map((k) => (
                    <SelectItem key={k} value={k}>{KIND_LABEL[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {loading ? (
              <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
            ) : combined.length === 0 ? (
              <div className="text-center py-10 text-xs text-muted-foreground">
                Nenhuma decisão registrada ainda.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {combined.map((it, i) => (
                  <li key={i} className="py-3 flex items-start gap-3" data-testid={`ledger-row-${i}`}>
                    <Badge className={`rounded-full text-[10px] font-mono uppercase border-0 ${KIND_COLORS[it.kind] || "bg-muted"}`}>
                      {KIND_LABEL[it.kind] || it.kind}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      {it.source === "run" ? (
                        <div className="text-sm">
                          {it.skipped ? `Ciclo pulado: ${it.reason}` : `Ciclo automático · ${it.rules_count} regra(s)`}
                        </div>
                      ) : (
                        <>
                          <div className="text-sm font-medium">
                            {it.target_type} {it.target_id ? <span className="font-mono text-xs">{it.target_id}</span> : ""}
                          </div>
                          <div className="text-[11px] font-mono text-muted-foreground truncate">
                            {it.before_state ? `Antes: ${JSON.stringify(it.before_state)} → ` : ""}
                            {it.change ? `Depois: ${JSON.stringify(it.change)}` : ""}
                          </div>
                        </>
                      )}
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {new Date(it.created_at).toLocaleString()}
                      </div>
                    </div>
                    {it.rolled_back && (
                      <Badge variant="outline" className="rounded-full text-[10px]">revertido</Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
