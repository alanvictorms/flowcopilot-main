import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Inbox, CheckCircle2, XCircle, Loader2, ShieldCheck, ShieldAlert,
  RefreshCcw, Undo2, Ban, AlertTriangle,
} from "lucide-react";

import api, { formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

const ACTION_LABELS = {
  pause: "Pausar",
  activate: "Ativar",
  change_budget: "Alterar orçamento",
};
const RISK_STYLES = {
  low: "bg-green-500/10 text-green-600 dark:text-green-400",
  medium: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
  high: "bg-red-500/10 text-red-600 dark:text-red-400",
};
const SOURCE_LABELS = { rule: "Regra", ai: "IA", user: "Usuário", system: "Sistema" };
const COMMITTEE_LABELS = {
  guardian: "Guardião",
  policy: "Política",
  finance: "Financeiro",
  risk: "Risco",
  statistics: "Estatística",
};

function CommitteeRow({ opinions }) {
  if (!opinions) return null;
  return (
    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
      {Object.entries(opinions).map(([key, op]) => (
        <div key={key} className={`p-2.5 rounded-xl border text-xs ${op.ok ? "border-border" : "border-yellow-500/50 bg-yellow-500/5"}`}>
          <div className="flex items-center gap-1.5 font-medium mb-0.5">
            {op.ok
              ? <ShieldCheck className="w-3.5 h-3.5 text-green-500" />
              : <ShieldAlert className="w-3.5 h-3.5 text-yellow-500" />}
            {COMMITTEE_LABELS[key] || key}
          </div>
          <div className="text-muted-foreground leading-snug">{op.detail_pt}</div>
        </div>
      ))}
    </div>
  );
}

export default function Approvals() {
  const [pending, setPending] = useState([]);
  const [recent, setRecent] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [justification, setJustification] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [p, r, s] = await Promise.all([
        api.get("/actions/pending"),
        api.get("/actions", { params: { limit: 30 } }),
        api.get("/actions/summary"),
      ]);
      setPending(p.data || []);
      setRecent((r.data || []).filter((x) => x.status !== "pending_approval"));
      setSummary(s.data);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const approve = async (plan) => {
    setActing(plan.id);
    try {
      await api.post(`/actions/${plan.id}/approve`);
      toast.success("Ação aprovada e executada. Pós-verificação agendada.");
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setActing(null);
    }
  };

  const reject = async () => {
    if (!rejectTarget) return;
    setActing(rejectTarget.id);
    try {
      await api.post(`/actions/${rejectTarget.id}/reject`, { justification });
      toast.success("Ação rejeitada.");
      setRejectTarget(null);
      setJustification("");
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setActing(null);
    }
  };

  const verifyNow = async () => {
    try {
      const { data } = await api.post("/actions/verify-now");
      toast.success(`${data.verified} verificação(ões) executada(s).`);
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  const STATUS_BADGES = {
    executed: { label: "Executado", cls: "bg-blue-500/10 text-blue-600 dark:text-blue-400", icon: CheckCircle2 },
    verified_kept: { label: "Verificado · mantido", cls: "bg-green-500/10 text-green-600 dark:text-green-400", icon: CheckCircle2 },
    verified_rolled_back: { label: "Revertido", cls: "bg-orange-500/10 text-orange-600 dark:text-orange-400", icon: Undo2 },
    rejected: { label: "Rejeitado", cls: "bg-muted text-muted-foreground", icon: XCircle },
    blocked: { label: "Bloqueado", cls: "bg-red-500/10 text-red-600 dark:text-red-400", icon: Ban },
    failed: { label: "Falhou", cls: "bg-red-500/10 text-red-600 dark:text-red-400", icon: AlertTriangle },
    authorized: { label: "Autorizado", cls: "bg-primary/10 text-primary", icon: CheckCircle2 },
  };

  return (
    <div className="space-y-6" data-testid="approvals-page">
      <Card className="p-6 rounded-2xl">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Inbox className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <div className="text-lg font-semibold">Central de Aprovações</div>
            <div className="text-sm text-muted-foreground mt-1">
              Planos de ação do Control Plane aguardando sua decisão. Cada plano mostra evidências,
              risco e o parecer do comitê de validadores.
            </div>
          </div>
          <Button variant="outline" className="rounded-full" onClick={verifyNow} data-testid="approvals-verify-btn">
            <RefreshCcw className="w-4 h-4 mr-1" /> Rodar verificações
          </Button>
        </div>
        {summary && (
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <Badge className="rounded-full bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-0">
              {summary.pending} pendentes
            </Badge>
            <Badge className="rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border-0">
              {summary.executed} executados
            </Badge>
            <Badge className="rounded-full bg-green-500/10 text-green-600 dark:text-green-400 border-0">
              {summary.verified_kept} mantidos
            </Badge>
            <Badge className="rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400 border-0">
              {summary.rolled_back} revertidos
            </Badge>
            <Badge className="rounded-full bg-red-500/10 text-red-600 dark:text-red-400 border-0">
              {summary.blocked} bloqueados
            </Badge>
          </div>
        )}
      </Card>

      {loading ? (
        <div className="text-sm text-muted-foreground">Carregando…</div>
      ) : pending.length === 0 ? (
        <Card className="p-10 rounded-2xl text-center text-sm text-muted-foreground">
          Nenhuma ação aguardando aprovação. O orquestrador enviará novos planos para cá.
        </Card>
      ) : (
        <div className="space-y-4">
          {pending.map((plan) => (
            <Card key={plan.id} className="p-5 rounded-2xl" data-testid={`approval-item-${plan.id}`}>
              <div className="flex flex-wrap items-start gap-3">
                <div className="flex-1 min-w-[240px]">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <Badge className="rounded-full border-0 bg-primary/10 text-primary">
                      {ACTION_LABELS[plan.action_type] || plan.action_type}
                      {plan.action_type === "change_budget" && plan.change_pct
                        ? ` ${plan.change_pct > 0 ? "+" : ""}${plan.change_pct}%` : ""}
                    </Badge>
                    <Badge className={`rounded-full border-0 ${RISK_STYLES[plan.risk] || ""}`}>
                      risco {plan.risk}
                    </Badge>
                    <Badge variant="outline" className="rounded-full">
                      {SOURCE_LABELS[plan.source] || plan.source}
                    </Badge>
                    {typeof plan.confidence === "number" && (
                      <span className="text-[11px] font-mono text-muted-foreground">
                        confiança {(plan.confidence * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                  <div className="text-sm font-semibold">
                    {plan.target_name || plan.target_id}
                    <span className="ml-2 text-[11px] font-normal text-muted-foreground uppercase">{plan.target_type}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">{plan.reason}</div>
                  {plan.evidence_metrics && Object.keys(plan.evidence_metrics).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {Object.entries(plan.evidence_metrics).slice(0, 8).map(([k, v]) => (
                        <span key={k} className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                          {k}: {typeof v === "number" ? v.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : String(v)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm" className="rounded-full"
                    disabled={acting === plan.id}
                    onClick={() => approve(plan)}
                    data-testid={`approval-approve-${plan.id}`}
                  >
                    {acting === plan.id ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
                    Aprovar
                  </Button>
                  <Button
                    size="sm" variant="outline" className="rounded-full"
                    disabled={acting === plan.id}
                    onClick={() => setRejectTarget(plan)}
                    data-testid={`approval-reject-${plan.id}`}
                  >
                    <XCircle className="w-4 h-4 mr-1" /> Rejeitar
                  </Button>
                </div>
              </div>
              <CommitteeRow opinions={plan.validation?.opinions} />
              <div className="mt-2 text-[10px] text-muted-foreground">
                Proposto em {new Date(plan.created_at).toLocaleString("pt-BR")} · observação de {plan.observation_hours}h ·
                rollback se {plan.rollback_condition?.metric?.toUpperCase()} {plan.rollback_condition?.direction === "increase" ? "subir" : "cair"} &gt;{plan.rollback_condition?.threshold_pct}%
              </div>
            </Card>
          ))}
        </div>
      )}

      {recent.length > 0 && (
        <div>
          <div className="text-sm font-semibold mb-3">Decisões recentes</div>
          <div className="space-y-2">
            {recent.map((plan) => {
              const badge = STATUS_BADGES[plan.status] || { label: plan.status, cls: "bg-muted text-muted-foreground", icon: CheckCircle2 };
              const Icon = badge.icon;
              return (
                <Card key={plan.id} className="p-4 rounded-2xl flex flex-wrap items-center gap-3">
                  <Badge className={`rounded-full border-0 ${badge.cls}`}>
                    <Icon className="w-3 h-3 mr-1" /> {badge.label}
                  </Badge>
                  <div className="flex-1 min-w-[200px]">
                    <span className="text-sm font-medium">
                      {ACTION_LABELS[plan.action_type] || plan.action_type} · {plan.target_name || plan.target_id}
                    </span>
                    {plan.verification && (
                      <span className="ml-2 text-[11px] font-mono text-muted-foreground">
                        {plan.verification.metric?.toUpperCase()} {plan.verification.change_pct > 0 ? "+" : ""}{plan.verification.change_pct}%
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(plan.executed_at || plan.created_at).toLocaleString("pt-BR")}
                  </span>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      <Dialog open={!!rejectTarget} onOpenChange={(o) => { if (!o) { setRejectTarget(null); setJustification(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rejeitar ação</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">
              {rejectTarget && `${ACTION_LABELS[rejectTarget.action_type] || rejectTarget.action_type} em ${rejectTarget.target_name || rejectTarget.target_id}`}
            </div>
            <Label>Justificativa (obrigatória — vira aprendizado da IA)</Label>
            <Textarea rows={3} value={justification} onChange={(e) => setJustification(e.target.value)}
              placeholder="Ex.: campanha em fase de teste intencional, não pausar" data-testid="approval-reject-justification" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejectTarget(null)}>Cancelar</Button>
            <Button variant="destructive" className="rounded-full" disabled={justification.trim().length < 5 || !!acting} onClick={reject} data-testid="approval-reject-confirm">
              Rejeitar ação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
