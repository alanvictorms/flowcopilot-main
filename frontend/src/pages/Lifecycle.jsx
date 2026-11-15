import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Recycle, RefreshCw, Loader2, Rocket, PauseCircle, Flame, Sprout, HeartPulse, Ghost } from "lucide-react";

import api, { formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const STAGE_META = {
  learning: { icon: Sprout, cls: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  healthy: { icon: HeartPulse, cls: "bg-green-500/10 text-green-600 dark:text-green-400" },
  winner_scalable: { icon: Rocket, cls: "bg-primary/10 text-primary" },
  fatigued: { icon: Flame, cls: "bg-orange-500/10 text-orange-600 dark:text-orange-400" },
  loser: { icon: PauseCircle, cls: "bg-red-500/10 text-red-600 dark:text-red-400" },
  zombie: { icon: Ghost, cls: "bg-neutral-500/10 text-neutral-600 dark:text-neutral-400" },
};

const APPLY_LABEL = {
  winner_scalable: "Escalar +20%",
  loser: "Pausar",
  zombie: "Pausar",
  fatigued: "Reduzir -20%",
};

export default function Lifecycle() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data: d } = await api.get("/lifecycle/overview");
      setData(d);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const apply = async (c) => {
    setApplying(c.campaign_id);
    try {
      const { data: plan } = await api.post(`/lifecycle/apply/${c.campaign_id}`, { stage: c.stage });
      if (plan.status === "executed") toast.success("Ação executada via Control Plane. Pós-verificação agendada.");
      else if (plan.status === "pending_approval") toast.info("Plano criado — aguardando sua aprovação na Central de Aprovações.");
      else if (plan.status === "blocked") toast.warning("Plano bloqueado pelo comitê de validadores (veja o Ledger).");
      else toast.info(`Plano registrado com status: ${plan.status}`);
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setApplying(null);
    }
  };

  const stages = data?.stages || {};
  const byStage = data?.by_stage || {};

  return (
    <div className="space-y-6" data-testid="lifecycle-page">
      <Card className="p-6 rounded-2xl">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Recycle className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <div className="text-lg font-semibold">Ciclo de Vida das Campanhas</div>
            <div className="text-sm text-muted-foreground mt-1">
              Cada campanha classificada por estágio com a próxima ação recomendada.
              Aplicar cria um plano no Control Plane — nada vai direto pra Meta.
            </div>
          </div>
          <Button variant="outline" size="icon" className="rounded-full" onClick={load}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
        {Object.keys(byStage).length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {Object.entries(byStage).map(([stage, count]) => {
              const meta = STAGE_META[stage] || STAGE_META.healthy;
              return (
                <Badge key={stage} className={`rounded-full border-0 ${meta.cls}`}>
                  {stages[stage]?.label_pt || stage}: {count}
                </Badge>
              );
            })}
          </div>
        )}
      </Card>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : !data?.campaigns?.length ? (
        <Card className="p-10 rounded-2xl text-center text-sm text-muted-foreground">
          {data?.hint_pt || "Nenhuma campanha encontrada."}
        </Card>
      ) : (
        <div className="space-y-3">
          {data.campaigns.map((c) => {
            const meta = STAGE_META[c.stage] || STAGE_META.healthy;
            const Icon = meta.icon;
            return (
              <Card key={c.campaign_id} className="p-5 rounded-2xl" data-testid={`lifecycle-${c.campaign_id}`}>
                <div className="flex flex-wrap items-center gap-3">
                  <Badge className={`rounded-full border-0 ${meta.cls}`}>
                    <Icon className="w-3.5 h-3.5 mr-1" /> {c.stage_label_pt}
                  </Badge>
                  <div className="flex-1 min-w-[220px]">
                    <div className="text-sm font-semibold">{c.campaign_name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{c.recommended_action_pt}</div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-[10px] font-mono">
                    <span className="px-2 py-1 rounded-full bg-muted text-muted-foreground">
                      R$ {Number(c.spend_30d).toLocaleString("pt-BR")} · 30d
                    </span>
                    <span className="px-2 py-1 rounded-full bg-muted text-muted-foreground">ROAS {c.roas_30d}</span>
                    {c.purchases_30d > 0 && <span className="px-2 py-1 rounded-full bg-muted text-muted-foreground">{c.purchases_30d} compras</span>}
                    {c.leads_30d > 0 && <span className="px-2 py-1 rounded-full bg-muted text-muted-foreground">{c.leads_30d} leads</span>}
                    {c.frequency_7d > 0 && <span className="px-2 py-1 rounded-full bg-muted text-muted-foreground">freq {c.frequency_7d}</span>}
                  </div>
                  {c.actionable && (
                    <Button
                      size="sm" className="rounded-full"
                      variant={c.stage === "winner_scalable" ? "default" : "outline"}
                      disabled={applying === c.campaign_id}
                      onClick={() => apply(c)}
                      data-testid={`lifecycle-apply-${c.campaign_id}`}
                    >
                      {applying === c.campaign_id ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                      {APPLY_LABEL[c.stage]}
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
