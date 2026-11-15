import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Flame, RefreshCw, Loader2, Pause } from "lucide-react";

import api, { formatApiError } from "@/lib/api";
import EmptyMetaState from "@/components/EmptyMetaState";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";

const RISK_TONE = {
  low: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30",
  medium: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/30",
  high: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30",
};
const RISK_BAR = {
  low: "bg-green-500",
  medium: "bg-yellow-500",
  high: "bg-red-500",
};

export default function Fatigue() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notConnected, setNotConnected] = useState(false);
  const [pausing, setPausing] = useState(null);

  const load = async () => {
    setLoading(true);
    setNotConnected(false);
    try {
      const { data } = await api.get("/fatigue/scan");
      setData(data);
    } catch (err) {
      if (err.response?.status === 428) setNotConnected(true);
      else toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const pauseAd = async (adId) => {
    setPausing(adId);
    try {
      await api.post(`/meta/ads/${adId}/status`, { status: "PAUSED" });
      toast.success("Anúncio pausado.");
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setPausing(null);
    }
  };

  if (notConnected) return <EmptyMetaState />;

  return (
    <div className="space-y-6" data-testid="fatigue-page">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-6 rounded-2xl">
          <div className="text-xs text-muted-foreground mb-2">Anúncios analisados</div>
          <div className="text-3xl font-semibold tracking-tighter">{data?.ads_analyzed ?? "—"}</div>
        </Card>
        <Card className="p-6 rounded-2xl">
          <div className="text-xs text-muted-foreground mb-2">Risco alto</div>
          <div className="text-3xl font-semibold tracking-tighter text-red-600 dark:text-red-400">
            {data?.high_risk ?? "—"}
          </div>
        </Card>
        <Card className="p-6 rounded-2xl">
          <div className="text-xs text-muted-foreground mb-2">Risco médio</div>
          <div className="text-3xl font-semibold tracking-tighter text-yellow-600 dark:text-yellow-400">
            {data?.medium_risk ?? "—"}
          </div>
        </Card>
        <Card className="p-6 rounded-2xl flex items-center justify-center">
          <Button onClick={load} disabled={loading} className="rounded-full" data-testid="fatigue-refresh-btn">
            {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
            Nova análise
          </Button>
        </Card>
      </div>

      <Card className="p-6 rounded-2xl">
        <div className="flex items-center gap-3 mb-4">
          <Flame className="w-5 h-5 text-primary" />
          <div className="text-lg font-semibold">Ranking de fadiga criativa</div>
        </div>
        {loading ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
        ) : (data?.items || []).length === 0 ? (
          <div className="text-center py-8 text-xs text-muted-foreground">
            Não há dados suficientes para calcular fadiga (mínimo 100 impressões em 3 dias).
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {data.items.map((f) => (
              <li key={f.ad_id} className="py-4 flex items-center gap-4" data-testid={`fatigue-row-${f.ad_id}`}>
                {f.image_url ? (
                  <img src={f.image_url} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0" />
                ) : (
                  <div className="w-14 h-14 rounded-lg bg-muted shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{f.ad_name}</div>
                  <div className="text-[11px] font-mono text-muted-foreground truncate">
                    freq {f.frequency} · CTR {f.recent_ctr}% (era {f.prior_ctr}%) · impr 3d {f.impressions_3d.toLocaleString()}
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full ${RISK_BAR[f.risk]}`} style={{ width: `${f.score}%` }} />
                    </div>
                    <div className="text-xs font-mono w-10 text-right">{f.score}</div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <Badge className={`rounded-full text-[10px] font-mono uppercase border ${RISK_TONE[f.risk]}`}>
                    {f.risk}
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => pauseAd(f.ad_id)}
                    disabled={pausing === f.ad_id || f.status === "PAUSED"}
                    className="rounded-full"
                    data-testid={`fatigue-pause-${f.ad_id}`}
                  >
                    {pausing === f.ad_id ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Pause className="w-3.5 h-3.5 mr-1" />}
                    Pausar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
