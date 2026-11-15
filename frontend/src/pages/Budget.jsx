import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Wallet, TrendingUp, TrendingDown, Wand2, Loader2, RefreshCw } from "lucide-react";

import api, { formatApiError } from "@/lib/api";
import EmptyMetaState from "@/components/EmptyMetaState";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export default function Budget() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notConnected, setNotConnected] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState([]);

  const load = async () => {
    setLoading(true);
    setNotConnected(false);
    try {
      const { data } = await api.get("/budget/analyze");
      setData(data);
    } catch (err) {
      if (err.response?.status === 428) setNotConnected(true);
      else toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const askSuggestions = async () => {
    setSuggesting(true);
    try {
      const { data } = await api.post("/budget/redistribute-suggest");
      setSuggestions(data.suggestions || []);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setSuggesting(false);
    }
  };

  if (notConnected) return <EmptyMetaState />;
  if (loading) return <Skeleton className="h-96 w-full rounded-2xl" />;

  const p = data?.projections || {};
  const paceOfDay = p.hours_elapsed && p.projected_today
    ? Math.min((p.spend_today / (p.projected_today || 1)) * 100, 100) : 0;

  const listSection = (title, items, tone) => (
    <Card className="p-6 rounded-2xl">
      <div className="text-sm font-semibold mb-3">{title}</div>
      {items?.length ? (
        <ul className="space-y-2">
          {items.map((c, i) => (
            <li key={i} className="flex items-center gap-2 text-xs">
              <div className={`w-1.5 h-1.5 rounded-full ${tone}`} />
              <span className="flex-1 truncate">{c.name || c.id}</span>
              <span className="font-mono text-muted-foreground">{c.pace_pct ? `${c.pace_pct}%` : c.roas ? `${c.roas}x` : "—"}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-xs text-muted-foreground">Sem campanhas neste grupo.</div>
      )}
    </Card>
  );

  return (
    <div className="space-y-6" data-testid="budget-page">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-6 rounded-2xl">
          <div className="text-xs text-muted-foreground mb-2">Gasto hoje</div>
          <div className="text-3xl font-semibold tracking-tighter">{p.spend_today?.toLocaleString?.() || 0}</div>
          <Progress value={paceOfDay} className="h-1.5 mt-3" />
          <div className="text-[11px] text-muted-foreground mt-2">{p.hours_elapsed}h de 24h</div>
        </Card>
        <Card className="p-6 rounded-2xl">
          <div className="text-xs text-muted-foreground mb-2">Projeção hoje</div>
          <div className="text-3xl font-semibold tracking-tighter">{p.projected_today?.toLocaleString?.() || 0}</div>
          <div className="text-[11px] text-muted-foreground mt-4">Média 7d: {p.daily_avg_7d}</div>
        </Card>
        <Card className="p-6 rounded-2xl">
          <div className="text-xs text-muted-foreground mb-2">Projeção mês</div>
          <div className="text-3xl font-semibold tracking-tighter">{p.projected_month?.toLocaleString?.() || 0}</div>
          <div className="text-[11px] text-muted-foreground mt-4">Verba diária total: {p.planned_daily_budget}</div>
        </Card>
        <Card className="p-6 rounded-2xl flex flex-col justify-between">
          <div>
            <div className="text-xs text-muted-foreground mb-2">Ações da IA</div>
            <div className="text-lg font-semibold">Sugerir realocação</div>
          </div>
          <Button onClick={askSuggestions} disabled={suggesting} className="rounded-full" data-testid="budget-suggest-btn">
            {suggesting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Wand2 className="w-4 h-4 mr-1" />}
            Gerar sugestões
          </Button>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {listSection("🔥 Gastando demais", data?.overspenders, "bg-red-500")}
        {listSection("💤 Gastando de menos", data?.underspenders, "bg-yellow-500")}
        {listSection("🏆 Ganhadoras", data?.winners, "bg-primary")}
        {listSection("📉 Perdedoras", data?.losers, "bg-red-500")}
      </div>

      {suggestions.length > 0 && (
        <Card className="p-6 rounded-2xl">
          <div className="text-lg font-semibold mb-4">Sugestões da IA</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {suggestions.map((s, i) => (
              <Card key={i} className="p-4 rounded-xl bg-muted/50">
                <div className="text-sm font-semibold">{s.title}</div>
                <div className="flex gap-1 mt-1">
                  <Badge variant="outline" className="text-[10px]">{s.category}</Badge>
                  <Badge variant="outline" className="text-[10px]">risk: {s.risk}</Badge>
                </div>
                <div className="text-xs mt-2">{s.change}</div>
                <div className="text-[11px] text-muted-foreground mt-1">{s.expected_impact}</div>
              </Card>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
