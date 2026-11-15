import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
} from "recharts";
import {
  DollarSign, MousePointerClick, Target, Eye, RefreshCw, TrendingUp,
  ShieldAlert, Inbox, Coins, ArrowUpRight, Activity, CheckCircle2,
} from "lucide-react";

import api, { formatApiError } from "@/lib/api";
import { useLanguage } from "@/contexts/LanguageContext";
import KpiCard from "@/components/kpi/KpiCard";
import EmptyMetaState from "@/components/EmptyMetaState";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const fmt = (n) => Number(n || 0).toLocaleString("pt-BR");
const fmtBRL = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
const shortDate = (d) => (d && d.length >= 10 ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : d);

const MODE_META = {
  recommend: { label: "Somente recomendação", cls: "text-blue-600 dark:text-blue-400" },
  approve: { label: "Requer aprovação", cls: "text-amber-600 dark:text-amber-400" },
  auto: { label: "Automático", cls: "text-green-600 dark:text-green-400" },
};

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-neutral-900 text-white rounded-lg px-3 py-2 text-xs shadow-xl">
      <div className="text-white/50 text-[10px] mb-1">{shortDate(label)}</div>
      <div className="flex items-center gap-4">
        <div><div className="text-white/50 text-[10px] uppercase tracking-widest">Gasto</div><div className="font-semibold">{fmtBRL(d.spend)}</div></div>
        <div><div className="text-white/50 text-[10px] uppercase tracking-widest">Cliques</div><div className="font-semibold">{fmt(d.clicks)}</div></div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [notConnected, setNotConnected] = useState(false);
  const [preset, setPreset] = useState("last_30d");
  const [data, setData] = useState(null);
  const [profit, setProfit] = useState(null);
  const [events, setEvents] = useState([]);
  const [autonomy, setAutonomy] = useState(null);
  const [balance, setBalance] = useState(null);

  const DATE_PRESETS = [
    { value: "today", label: t("dash.today") },
    { value: "yesterday", label: t("dash.yesterday") },
    { value: "last_7d", label: t("dash.last7d") },
    { value: "last_30d", label: t("dash.last30d") },
    { value: "last_90d", label: t("dash.last90d") },
  ];

  const load = async (p = preset) => {
    setLoading(true);
    setNotConnected(false);
    try {
      const ov = await api.get("/dashboard/overview", { params: { date_preset: p } });
      setData(ov.data);
    } catch (err) {
      if (err.response?.status === 428) { setNotConnected(true); setLoading(false); return; }
      toast.error(formatApiError(err.response?.data?.detail) || err.message);
    }
    // Complementos (não bloqueiam a tela)
    const [pf, ev, au, wa] = await Promise.allSettled([
      api.get("/profit/by-campaign", { params: { days: 30 } }),
      api.get("/rules/events/recent"),
      api.get("/autonomy/settings"),
      api.get("/wallet/balance"),
    ]);
    if (pf.status === "fulfilled") setProfit(pf.value.data);
    if (ev.status === "fulfilled") setEvents(ev.value.data || []);
    if (au.status === "fulfilled") setAutonomy(au.value.data);
    if (wa.status === "fulfilled") setBalance(wa.value.data?.balance ?? null);
    setLoading(false);
  };

  useEffect(() => { load(preset); /* eslint-disable-next-line */ }, [preset]);

  const kpis = data?.kpis;
  const currency = data?.account?.currency || "BRL";
  const series = useMemo(() => (data?.timeseries || []).map((r) => ({
    date: r.date, spend: Number(r.spend || 0), clicks: Number(r.clicks || 0),
  })), [data]);

  if (notConnected) return <div className="pt-2"><EmptyMetaState /></div>;

  const mode = MODE_META[autonomy?.mode] || null;
  const topCampaigns = data?.top_campaigns || [];

  const kpiCards = [
    { label: t("dash.totalSpend"), value: kpis ? fmtBRL(kpis.spend) : "—", icon: DollarSign, testid: "kpi-spend", hint: kpis ? `ROAS ${Number(kpis.avg_roas || 0).toFixed(2)}x` : "" },
    { label: t("dash.conversions"), value: fmt(kpis?.purchases), icon: Target, testid: "kpi-purchases", hint: kpis?.cpa ? `CPA ${fmtBRL(kpis.cpa)}` : "" },
    { label: t("dash.clicks"), value: fmt(kpis?.clicks), icon: MousePointerClick, testid: "kpi-clicks", hint: kpis ? `CTR ${kpis.ctr_pct}% · CPC ${fmtBRL(kpis.cpc)}` : "" },
    { label: t("dash.impressions"), value: fmt(kpis?.impressions), icon: Eye, testid: "kpi-impr", hint: kpis?.cpm ? `CPM ${fmtBRL(kpis.cpm)}` : "" },
  ];

  return (
    <div className="space-y-5" data-testid="dashboard-page">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <div className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">{t("dash.activeAccount")}</div>
          <div className="text-lg font-semibold mt-0.5">{data?.account?.name || "—"} · {currency}</div>
        </div>
        <Select value={preset} onValueChange={setPreset}>
          <SelectTrigger className="w-[170px] rounded-full" data-testid="dashboard-date-preset"><SelectValue placeholder={t("dash.period")} /></SelectTrigger>
          <SelectContent>{DATE_PRESETS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
        </Select>
        <Button variant="outline" size="icon" className="rounded-full" onClick={() => load(preset)} disabled={loading} data-testid="dashboard-refresh-btn">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading && !kpis
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[132px] rounded-2xl" />)
          : kpiCards.map((k) => <KpiCard key={k.label} {...k} />)}
      </div>

      {/* Chart + Agente */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-6 rounded-2xl">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-base font-semibold">{t("dash.perfOverview")}</div>
              <div className="text-xs text-muted-foreground">Gasto diário no período</div>
            </div>
          </div>
          {loading ? (
            <Skeleton className="h-[260px] w-full" />
          ) : series.length ? (
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series} margin={{ top: 6, right: 4, left: -18, bottom: 0 }}>
                  <defs><linearGradient id="dashGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.28} /><stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                  <XAxis dataKey="date" tickFormatter={shortDate} fontSize={10} tickLine={false} axisLine={false} stroke="hsl(var(--muted-foreground))" />
                  <YAxis fontSize={10} tickLine={false} axisLine={false} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v} />
                  <Tooltip content={<ChartTooltip />} cursor={{ stroke: "hsl(var(--border))" }} />
                  <Area type="monotone" dataKey="spend" stroke="hsl(var(--primary))" fill="url(#dashGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[260px] flex items-center justify-center text-xs text-muted-foreground">{t("dash.noDataPeriod")}</div>
          )}
        </Card>

        {/* Painel do Agente */}
        <Card className="p-6 rounded-2xl flex flex-col gap-4" data-testid="dashboard-agent-panel">
          <div className="text-base font-semibold">O agente</div>

          <button onClick={() => navigate("/app/autonomy")} className="text-left rounded-xl border border-border p-3 hover:bg-accent/40 transition-colors">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-primary" />
              <span className="text-xs text-muted-foreground">Modo de operação</span>
              <ArrowUpRight className="w-3.5 h-3.5 ml-auto text-muted-foreground" />
            </div>
            <div className={`text-sm font-semibold mt-1 ${mode?.cls || ""}`}>{mode?.label || "—"}</div>
            {autonomy?.kill_switch && <div className="text-[11px] text-destructive mt-0.5">⚠ Kill switch ativo — automação parada</div>}
          </button>

          <button onClick={() => navigate("/app/approvals")} className="text-left rounded-xl border border-border p-3 hover:bg-accent/40 transition-colors">
            <div className="flex items-center gap-2">
              <Inbox className="w-4 h-4 text-primary" />
              <span className="text-xs text-muted-foreground">Aprovações</span>
              <ArrowUpRight className="w-3.5 h-3.5 ml-auto text-muted-foreground" />
            </div>
            <div className="text-sm font-semibold mt-1">Revisar ações propostas</div>
          </button>

          <button onClick={() => navigate("/app/wallet")} className="text-left rounded-xl border border-border p-3 hover:bg-accent/40 transition-colors">
            <div className="flex items-center gap-2">
              <Coins className="w-4 h-4 text-primary" />
              <span className="text-xs text-muted-foreground">Saldo de créditos</span>
              <ArrowUpRight className="w-3.5 h-3.5 ml-auto text-muted-foreground" />
            </div>
            <div className="text-sm font-semibold mt-1 tabular-nums">{balance != null ? fmt(balance) : "—"}</div>
          </button>
        </Card>
      </div>

      {/* Top campanhas + Lucro real */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-6 rounded-2xl">
          <div className="flex items-center justify-between mb-4">
            <div className="text-base font-semibold">Top campanhas</div>
            <button onClick={() => navigate("/app/campaigns")} className="text-xs text-primary hover:underline flex items-center gap-1">Ver todas <ArrowUpRight className="w-3 h-3" /></button>
          </div>
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : topCampaigns.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">Sem dados no período.</div>
          ) : (
            <ul className="divide-y divide-border/60">
              {topCampaigns.slice(0, 6).map((c) => (
                <li key={c.id} className="py-2.5 flex items-center gap-3 cursor-pointer hover:bg-accent/30 -mx-2 px-2 rounded-lg" onClick={() => navigate(`/app/campaigns/${c.id}`)}>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{c.name || c.id}</div>
                    <div className="text-[10px] font-mono text-muted-foreground">CTR {Number(c.ctr || 0).toFixed(2)}% · CPC {fmtBRL(c.cpc)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold tabular-nums">{fmtBRL(c.spend)}</div>
                    <div className="text-[10px] text-muted-foreground">{fmt(c.purchases)} conv.</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Lucro real */}
        <Card className="p-6 rounded-2xl flex flex-col" data-testid="dashboard-profit">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-primary" />
            <div className="text-base font-semibold">Lucro real</div>
          </div>
          {profit ? (
            <>
              <div className={`text-3xl font-bold tabular-nums ${Number(profit.total_profit) >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                {fmtBRL(profit.total_profit)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">últimos 30 dias · vendas do webhook × margem − investimento</div>
              <div className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Campanhas com dados</span><span className="font-medium">{(profit.campaigns || []).length}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Violações de CAC</span><span className={`font-medium ${(profit.cac_violations || []).length ? "text-red-600 dark:text-red-400" : ""}`}>{(profit.cac_violations || []).length}</span></div>
              </div>
              {!profit.has_business_data && (
                <button onClick={() => navigate("/app/business")} className="mt-auto pt-3 text-[11px] text-amber-600 dark:text-amber-400 text-left hover:underline">
                  Cadastre produtos e margens no Cérebro do Negócio para o lucro sair exato →
                </button>
              )}
            </>
          ) : (
            <div className="text-xs text-muted-foreground py-6 text-center">Sem dados de lucro. Conecte suas vendas em Lucro &amp; Leads.</div>
          )}
        </Card>
      </div>

      {/* Ações recentes do agente */}
      <Card className="p-6 rounded-2xl">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-4 h-4 text-primary" />
          <div className="text-base font-semibold">{t("dash.recentActions")}</div>
        </div>
        {events.length === 0 ? (
          <div className="text-xs text-muted-foreground py-6 text-center">{t("dash.noRecentActions")}</div>
        ) : (
          <ul className="space-y-3">
            {events.slice(0, 6).map((e, i) => (
              <li key={i} className="flex items-start gap-3">
                <div className={`w-6 h-6 mt-0.5 rounded-full shrink-0 flex items-center justify-center ${e.kind === "auto_cycle" ? "bg-primary/10" : "bg-muted"}`}>
                  <CheckCircle2 className={`w-3.5 h-3.5 ${e.kind === "auto_cycle" ? "text-primary" : "text-muted-foreground"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {e.kind === "auto_cycle" ? t("dash.autoCycle") : e.kind === "manual" ? t("dash.manualChange") : e.kind}
                    {e.target_type ? <span className="text-muted-foreground font-normal"> · {e.target_type} {e.target_id}</span> : null}
                  </div>
                  <div className="text-[10px] font-mono text-muted-foreground">{e.created_at ? new Date(e.created_at).toLocaleString("pt-BR") : ""}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
