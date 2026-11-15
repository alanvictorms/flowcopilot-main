import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FlaskConical, Loader2, TrendingUp, TrendingDown } from "lucide-react";

import api, { formatApiError } from "@/lib/api";
import EmptyMetaState from "@/components/EmptyMetaState";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const SCENARIOS = [
  { value: "increase_budget", label: "Aumentar orçamento" },
  { value: "decrease_budget", label: "Reduzir orçamento" },
  { value: "pause_campaign", label: "Pausar campanha" },
];

const RISK_COLOR = {
  low: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30",
  medium: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/30",
  high: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30",
};

function Metric({ label, before, after, unit, higherIsBetter = true }) {
  const delta = after - before;
  const positive = higherIsBetter ? delta > 0 : delta < 0;
  return (
    <div>
      <div className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="flex items-baseline gap-2 mt-1">
        <div className="text-2xl font-semibold tracking-tighter">
          {typeof after === "number" ? after.toLocaleString() : after}
        </div>
        {unit && <div className="text-xs text-muted-foreground">{unit}</div>}
      </div>
      <div className="flex items-center gap-1 mt-1 text-xs">
        <span className="text-muted-foreground line-through">
          {typeof before === "number" ? before.toLocaleString() : before}{unit ? ` ${unit}` : ""}
        </span>
        <span className={positive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
          {delta > 0 ? "+" : ""}{typeof delta === "number" ? delta.toFixed(2) : delta}
        </span>
      </div>
    </div>
  );
}

export default function Twin() {
  const [campaigns, setCampaigns] = useState([]);
  const [notConnected, setNotConnected] = useState(false);
  const [scenario, setScenario] = useState("increase_budget");
  const [campaignId, setCampaignId] = useState("");
  const [changePct, setChangePct] = useState(30);
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/meta/campaigns");
        setCampaigns(data || []);
        if (data?.length) setCampaignId(data[0].id);
      } catch (err) {
        if (err.response?.status === 428) setNotConnected(true);
      }
    })();
  }, []);

  const simulate = async () => {
    if (!campaignId) return toast.error("Selecione uma campanha.");
    setRunning(true);
    try {
      const { data } = await api.post("/twin/simulate", {
        scenario, campaign_id: campaignId, change_pct: changePct,
      });
      setResult(data);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setRunning(false);
    }
  };

  if (notConnected) return <EmptyMetaState />;

  const base = result?.baseline_30d || {};
  const proj = result?.projected_30d || {};

  return (
    <div className="space-y-6" data-testid="twin-page">
      <Card className="p-6 rounded-2xl">
        <div className="text-lg font-semibold mb-1">Digital Twin</div>
        <div className="text-xs text-muted-foreground mb-6">
          Simule alterações antes de aplicá-las no Meta. Baseado em performance dos últimos 14 dias.
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="space-y-1.5 lg:col-span-2">
            <Label>Campanha</Label>
            <Select value={campaignId} onValueChange={setCampaignId}>
              <SelectTrigger className="rounded-full" data-testid="twin-campaign-select">
                <SelectValue placeholder="Escolha uma campanha" />
              </SelectTrigger>
              <SelectContent>
                {campaigns.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Cenário</Label>
            <Select value={scenario} onValueChange={setScenario}>
              <SelectTrigger className="rounded-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SCENARIOS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {scenario !== "pause_campaign" && (
            <div className="space-y-2 lg:col-span-3">
              <div className="flex items-center justify-between">
                <Label>Percentual de alteração</Label>
                <Badge variant="outline" className="rounded-full font-mono">{changePct}%</Badge>
              </div>
              <Slider min={5} max={200} step={5} value={[changePct]} onValueChange={([v]) => setChangePct(v)} data-testid="twin-change-slider" />
            </div>
          )}
        </div>
        <div className="mt-6 flex justify-end">
          <Button onClick={simulate} disabled={running || !campaignId} className="rounded-full" data-testid="twin-simulate-btn">
            {running ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FlaskConical className="w-4 h-4 mr-1" />}
            Simular
          </Button>
        </div>
      </Card>

      {result && (
        <>
          <Card className="p-6 rounded-2xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-lg font-semibold">Projeção 30 dias — {result.campaign?.name}</div>
                <div className="text-xs text-muted-foreground">Baseline vs cenário</div>
              </div>
              <Badge className={`rounded-full text-[10px] font-mono uppercase border ${RISK_COLOR[result.risk]}`}>
                Risco {result.risk}
              </Badge>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
              <Metric label="Investimento" before={base.spend_30d} after={proj.spend_30d} higherIsBetter={false} />
              <Metric label="Cliques" before={base.clicks_30d} after={proj.clicks_30d} />
              <Metric label="Impressões" before={base.impressions_30d} after={proj.impressions_30d} />
              <Metric label="Compras" before={base.purchases_30d} after={proj.purchases_30d} />
              <Metric label="CPA" before={base.cpa} after={proj.cpa} higherIsBetter={false} />
              <Metric label="ROAS" before={base.roas} after={proj.roas} unit="x" />
            </div>
          </Card>

          <Card className="p-6 rounded-2xl bg-primary/5 border-primary/20">
            <div className="text-[10px] font-mono uppercase tracking-widest text-primary">Recomendação</div>
            <div className="text-sm mt-1">{result.recommendation}</div>
          </Card>
        </>
      )}
    </div>
  );
}
