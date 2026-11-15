import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft, Play, Pause, RefreshCw, ExternalLink, Loader2,
  DollarSign, MousePointerClick, Eye, Target, Sparkles, Trash2, Pencil, Save, X,
  Zap, PlusCircle, ChevronDown, ChevronRight, Stethoscope, TrendingUp, Users,
  MoreHorizontal, Brain,
} from "lucide-react";
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

import api, { formatApiError } from "@/lib/api";
import CampaignKnowledge from "@/components/CampaignKnowledge";
import CampaignCreatives from "@/components/CampaignCreatives";
import AdComposer from "@/components/AdComposer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const STATUS_META = {
  ACTIVE: { label: "Ativa", cls: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20", dot: "bg-green-500" },
  PAUSED: { label: "Pausada", cls: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20", dot: "bg-yellow-500" },
  DELETED: { label: "Excluída", cls: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20", dot: "bg-red-500" },
  ARCHIVED: { label: "Arquivada", cls: "bg-muted text-muted-foreground border-border", dot: "bg-muted-foreground" },
};

function StatusBadge({ status }) {
  const m = STATUS_META[status] || { label: status || "—", cls: "bg-muted text-muted-foreground border-border", dot: "bg-muted-foreground" };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium border ${m.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />{m.label}
    </span>
  );
}

const fmtBRL = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
const fmt = (n) => Number(n || 0).toLocaleString("pt-BR");
const pct = (n) => `${Number(n || 0).toFixed(2)}%`;

function StatTile({ icon: Icon, label, value, hint }) {
  return (
    <Card className="p-4 rounded-2xl">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</div>
          <div className="text-xl font-semibold mt-1 tabular-nums truncate">{value}</div>
          {hint && <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{hint}</div>}
        </div>
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0"><Icon className="w-3.5 h-3.5 text-primary" /></div>
      </div>
    </Card>
  );
}

export default function CampaignDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [timeseries, setTimeseries] = useState([]);
  const [busy, setBusy] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState("");
  const [savingName, setSavingName] = useState(false);

  // AI optimization
  const [aiOpen, setAiOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [aiCachedAt, setAiCachedAt] = useState(null);
  const [executingSuggestion, setExecutingSuggestion] = useState(null);

  // Create adset drawer
  const [createAdsetOpen, setCreateAdsetOpen] = useState(false);
  const [adsetForm, setAdsetForm] = useState({ name: "", daily_budget: 30, optimization_goal: "LINK_CLICKS", billing_event: "IMPRESSIONS" });
  const [savingAdset, setSavingAdset] = useState(false);

  // Create ad drawer
  const [createAdOpen, setCreateAdOpen] = useState(false);
  const [targetAdsetId, setTargetAdsetId] = useState(null);
  const [pages, setPages] = useState([]);
  const [pagesLoaded, setPagesLoaded] = useState(false);

  // Expanded adsets
  const [expandedAdsets, setExpandedAdsets] = useState({});

  // Ecossistema da campanha: conversões reais (webhook/CRM) + funil
  const [profit, setProfit] = useState(null);
  const [funnelInput, setFunnelInput] = useState(null);
  const [funnelResult, setFunnelResult] = useState(null);
  const [funnelLoading, setFunnelLoading] = useState(false);

  // Filtro de data do gráfico de desempenho
  const [seriesPreset, setSeriesPreset] = useState("last_30d");
  const [seriesFrom, setSeriesFrom] = useState("");
  const [seriesTo, setSeriesTo] = useState("");
  const [seriesLoading, setSeriesLoading] = useState(false);

  const loadSeries = async (preset = seriesPreset, from = seriesFrom, to = seriesTo) => {
    setSeriesLoading(true);
    try {
      const params = preset === "custom" && from && to ? { since: from, until: to } : { date_preset: preset };
      const { data } = await api.get(`/meta/campaigns/${id}/timeseries`, { params });
      setTimeseries(data || []);
    } catch (err) { /* silencioso */ }
    finally { setSeriesLoading(false); }
  };

  const applyPreset = (v) => {
    setSeriesPreset(v);
    if (v !== "custom") loadSeries(v);
  };

  const load = async () => {
    setLoading(true);
    try {
      const { data: dd } = await api.get(`/meta/campaigns/${id}/detail`);
      setData(dd);
      const exp = {};
      (dd?.adsets || []).forEach(a => { exp[a.id] = true; });
      setExpandedAdsets(exp);
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail) || err.message); }
    finally { setLoading(false); }
    loadSeries("last_30d");
    try {
      const { data: pd } = await api.get("/profit/by-campaign", { params: { days: 30 } });
      const row = (pd.campaigns || []).find((c) => c.campaign_id === id) || null;
      setProfit({ row, has_business_data: pd.has_business_data });
    } catch { setProfit({ row: null }); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const totals = useMemo(() => {
    const ins = (data?.insights_30d || [])[0] || {};
    const purchases = (ins.actions || []).find((a) => a.action_type === "purchase")?.value || 0;
    const roas = ((ins.purchase_roas || [])[0] || {}).value || 0;
    return { spend: Number(ins.spend || 0), impressions: Number(ins.impressions || 0), clicks: Number(ins.clicks || 0), ctr: Number(ins.ctr || 0), cpc: Number(ins.cpc || 0), purchases: Number(purchases), roas: Number(roas) };
  }, [data]);

  const chartData = useMemo(() => (timeseries || []).map((r) => ({ date: r.date_start, spend: Number(r.spend || 0), clicks: Number(r.clicks || 0) })), [timeseries]);

  useEffect(() => {
    if (data && profit && !funnelInput) {
      const r = profit.row || {};
      setFunnelInput({
        impressions: Math.round(totals.impressions),
        clicks: Math.round(totals.clicks),
        landing_page_views: 0,
        leads: r.leads || 0,
        qualified_leads: r.qualified || 0,
        sales: r.sales || 0,
        revenue: r.revenue || 0,
        spend: Math.round(totals.spend),
        notes: `Campanha ${data?.campaign?.name || id}`,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, profit]);

  const setFI = (patch) => setFunnelInput((f) => ({ ...f, ...patch }));
  const runFunnel = async () => {
    if (!funnelInput) return;
    setFunnelLoading(true);
    try {
      const { data: r } = await api.post("/funnel/diagnose", funnelInput);
      setFunnelResult(r);
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
    finally { setFunnelLoading(false); }
  };

  const adsByAdset = useMemo(() => {
    const map = {};
    (data?.ads || []).forEach(ad => {
      const asId = ad.adset_id || "unknown";
      if (!map[asId]) map[asId] = [];
      map[asId].push(ad);
    });
    return map;
  }, [data]);

  const toggleStatus = async () => {
    const next = data?.campaign?.effective_status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    setBusy(true);
    try { await api.post(`/meta/campaigns/${id}/status`, { status: next }); toast.success(`Campanha → ${next === "ACTIVE" ? "Ativa" : "Pausada"}`); load(); }
    catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  const saveName = async () => {
    setSavingName(true);
    try { await api.patch(`/meta/campaigns/${id}`, { name: nameVal }); toast.success("Nome atualizado."); setEditingName(false); load(); }
    catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
    finally { setSavingName(false); }
  };

  const deleteCampaign = async () => {
    if (!confirm("Excluir esta campanha?")) return;
    try { await api.delete(`/meta/campaigns/${id}`); toast.success("Campanha excluída."); navigate("/app/campaigns"); }
    catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };

  const runAiOptimize = async () => {
    setAiOpen(true);
    if (aiSuggestions.length > 0 && aiCachedAt) {
      const elapsed = Date.now() - aiCachedAt;
      if (elapsed < 3600000) return;
    }
    setAiLoading(true);
    setAiSuggestions([]);
    try {
      const { data: r } = await api.post(`/meta/campaigns/${id}/optimize`);
      setAiSuggestions(r.suggestions || []);
      setAiCachedAt(Date.now());
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
    finally { setAiLoading(false); }
  };

  const executeSuggestion = async (s, idx) => {
    setExecutingSuggestion(idx);
    try {
      if (s.target_type === "campaign" && s.target_id) await api.patch(`/meta/campaigns/${s.target_id}`, { status: "PAUSED" });
      else if (s.target_type === "adset" && s.target_id) await api.patch(`/meta/adsets/${s.target_id}`, { status: "PAUSED" });
      else if (s.target_type === "ad" && s.target_id) await api.post(`/meta/ads/${s.target_id}/status`, { status: "PAUSED" });
      toast.success(`Ação executada: ${s.title}`);
      load();
    } catch (err) { toast.error("Não foi possível executar esta ação automaticamente."); }
    finally { setExecutingSuggestion(null); }
  };

  const toggleAdSet = async (asId, status) => {
    const next = status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    try { await api.post(`/meta/adsets/${asId}/status`, { status: next }); toast.success(`Conjunto → ${next === "ACTIVE" ? "Ativo" : "Pausado"}`); load(); }
    catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };
  const deleteAdSet = async (asId) => {
    if (!confirm("Excluir este conjunto?")) return;
    try { await api.delete(`/meta/adsets/${asId}`); toast.success("Conjunto excluído."); load(); }
    catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };
  const toggleAd = async (adId, status) => {
    const next = status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    try { await api.post(`/meta/ads/${adId}/status`, { status: next }); toast.success(`Anúncio → ${next === "ACTIVE" ? "Ativo" : "Pausado"}`); load(); }
    catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };
  const deleteAd = async (adId) => {
    if (!confirm("Excluir este anúncio?")) return;
    try { await api.delete(`/meta/ads/${adId}`); toast.success("Anúncio excluído."); load(); }
    catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };

  const submitAdset = async () => {
    if (!adsetForm.name.trim()) return toast.error("Informe o nome do conjunto.");
    setSavingAdset(true);
    try {
      await api.post("/builder/manual/adset", { campaign_id: id, ...adsetForm, countries: ["BR"], age_min: 18, age_max: 65, publisher_platforms: ["facebook", "instagram"] });
      toast.success("Conjunto criado.");
      setCreateAdsetOpen(false);
      setAdsetForm({ name: "", daily_budget: 30, optimization_goal: "LINK_CLICKS", billing_event: "IMPRESSIONS" });
      load();
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
    finally { setSavingAdset(false); }
  };

  const openCreateAd = async (asId) => {
    setTargetAdsetId(asId);
    setCreateAdOpen(true);
    if (!pagesLoaded) {
      try { const { data } = await api.get("/builder/pages"); setPages(data || []); } catch {}
      finally { setPagesLoaded(true); }
    }
  };

  if (loading) return (
    <div className="space-y-5">
      <Skeleton className="h-24 rounded-3xl" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
      <Skeleton className="h-72 rounded-2xl" />
    </div>
  );
  if (!data) return null;
  const c = data.campaign || {};
  const isActive = c.effective_status === "ACTIVE";

  return (
    <div className="space-y-5" data-testid="campaign-detail-page">
      {/* Hero header */}
      <Card className="rounded-3xl p-5 md:p-6 bg-gradient-to-br from-muted/40 to-transparent">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" className="rounded-full shrink-0 -ml-1" onClick={() => navigate("/app/campaigns")} data-testid="back-btn">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1 min-w-0">
            {editingName ? (
              <div className="flex items-center gap-2">
                <Input value={nameVal} onChange={(e) => setNameVal(e.target.value)} className="text-lg font-semibold h-9 max-w-md" autoFocus />
                <Button size="icon" variant="ghost" className="rounded-full" onClick={saveName} disabled={savingName}>{savingName ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}</Button>
                <Button size="icon" variant="ghost" className="rounded-full" onClick={() => setEditingName(false)}><X className="w-4 h-4" /></Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl md:text-2xl font-semibold tracking-tight truncate">{c.name || "Campanha"}</h2>
                <button onClick={() => { setNameVal(c.name || ""); setEditingName(true); }} className="w-6 h-6 rounded-full bg-muted hover:bg-accent flex items-center justify-center shrink-0" data-testid="edit-name-btn"><Pencil className="w-3 h-3" /></button>
                <StatusBadge status={c.effective_status} />
              </div>
            )}
            <div className="text-[11px] text-muted-foreground font-mono mt-1.5 truncate">{c.objective || "—"} · {c.created_time?.slice(0, 10) || "—"} · {c.id}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" className="rounded-full" onClick={runAiOptimize} data-testid="ai-optimize-btn"><Sparkles className="w-3.5 h-3.5 mr-1 text-primary" /> Otimizar IA</Button>
            <Button size="sm" className="rounded-full" onClick={toggleStatus} disabled={busy} data-testid="detail-toggle-btn">
              {busy ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : (isActive ? <Pause className="w-3.5 h-3.5 mr-1" /> : <Play className="w-3.5 h-3.5 mr-1" />)}
              {isActive ? "Pausar" : "Ativar"}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full" data-testid="detail-more-btn"><MoreHorizontal className="w-4 h-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={load}><RefreshCw className="w-4 h-4 mr-2" /> Atualizar</DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href={`https://business.facebook.com/adsmanager/manage/campaigns?selected_campaign_ids=${c.id}`} target="_blank" rel="noreferrer"><ExternalLink className="w-4 h-4 mr-2" /> Abrir no Gerenciador</a>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={deleteCampaign} className="text-destructive focus:text-destructive"><Trash2 className="w-4 h-4 mr-2" /> Excluir campanha</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile icon={DollarSign} label="Investido" value={fmtBRL(totals.spend)} hint={`ROAS ${totals.roas.toFixed(2)}x`} />
        <StatTile icon={Eye} label="Impressões" value={fmt(totals.impressions)} hint={totals.impressions ? `CPM ${fmtBRL((totals.spend / totals.impressions) * 1000)}` : "—"} />
        <StatTile icon={MousePointerClick} label="Cliques" value={fmt(totals.clicks)} hint={`CTR ${pct(totals.ctr)} · CPC ${fmtBRL(totals.cpc)}`} />
        <StatTile icon={Target} label="Conversões" value={fmt(totals.purchases)} hint={totals.purchases ? `CPA ${fmtBRL(totals.spend / totals.purchases)}` : "—"} />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="flex flex-wrap h-auto gap-1 bg-muted/60 rounded-full p-1">
          <TabsTrigger value="overview" className="rounded-full" data-testid="tab-overview">Visão geral</TabsTrigger>
          <TabsTrigger value="structure" className="rounded-full" data-testid="tab-structure">Estrutura ({data.adsets?.length || 0})</TabsTrigger>
          <TabsTrigger value="results" className="rounded-full" data-testid="tab-results"><TrendingUp className="w-3.5 h-3.5 mr-1" /> Resultados</TabsTrigger>
          <TabsTrigger value="funnel" className="rounded-full" data-testid="tab-funnel"><Stethoscope className="w-3.5 h-3.5 mr-1" /> Funil</TabsTrigger>
          <TabsTrigger value="creatives" className="rounded-full" data-testid="tab-creatives"><Sparkles className="w-3.5 h-3.5 mr-1" /> Criativos</TabsTrigger>
          <TabsTrigger value="knowledge" className="rounded-full" data-testid="tab-knowledge"><Brain className="w-3.5 h-3.5 mr-1" /> Conhecimento</TabsTrigger>
        </TabsList>

        {/* Visão geral: gráfico + financeiro */}
        <TabsContent value="overview" className="mt-4 space-y-4">
          <Card className="p-5 rounded-2xl">
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <div className="text-sm font-semibold flex-1">Desempenho {seriesLoading && <Loader2 className="w-3 h-3 inline animate-spin ml-1" />}</div>
              <Select value={seriesPreset} onValueChange={applyPreset}>
                <SelectTrigger className="w-[170px] h-9 rounded-full" data-testid="series-preset"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="last_7d">Últimos 7 dias</SelectItem>
                  <SelectItem value="last_30d">Últimos 30 dias</SelectItem>
                  <SelectItem value="last_90d">Últimos 90 dias</SelectItem>
                  <SelectItem value="custom">Período personalizado</SelectItem>
                </SelectContent>
              </Select>
              {seriesPreset === "custom" && (
                <div className="flex items-center gap-2">
                  <Input type="date" value={seriesFrom} onChange={(e) => setSeriesFrom(e.target.value)} className="h-9 w-[150px]" data-testid="series-from" />
                  <span className="text-xs text-muted-foreground">até</span>
                  <Input type="date" value={seriesTo} onChange={(e) => setSeriesTo(e.target.value)} className="h-9 w-[150px]" data-testid="series-to" />
                  <Button size="sm" className="rounded-full" onClick={() => loadSeries("custom", seriesFrom, seriesTo)} disabled={!seriesFrom || !seriesTo || seriesLoading} data-testid="series-apply">
                    Aplicar
                  </Button>
                </div>
              )}
            </div>
            {chartData.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                    <defs><linearGradient id="gs" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.28} /><stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} /></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.35} vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 10, fontSize: 11 }} />
                    <Area type="monotone" dataKey="spend" stroke="hsl(var(--primary))" fill="url(#gs)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-40 flex items-center justify-center text-xs text-muted-foreground">Sem dados no período.</div>
            )}
          </Card>

          <Card className="p-5 rounded-2xl">
            <div className="text-sm font-semibold mb-4">Financeiro</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              {[
                ["Verba diária", c.daily_budget ? fmtBRL(Number(c.daily_budget) / 100) : "—"],
                ["Verba vitalícia", c.lifetime_budget ? fmtBRL(Number(c.lifetime_budget) / 100) : "—"],
                ["Restante", c.budget_remaining ? fmtBRL(Number(c.budget_remaining) / 100) : "—"],
                ["ROAS", `${totals.roas.toFixed(2)}x`],
              ].map(([label, value]) => (
                <div key={label}>
                  <div className="text-[10px] font-mono uppercase text-muted-foreground">{label}</div>
                  <div className="text-lg font-semibold mt-1 tabular-nums">{value}</div>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>

        {/* Estrutura */}
        <TabsContent value="structure" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={() => setCreateAdsetOpen(true)} className="rounded-full" data-testid="create-adset-btn">
              <PlusCircle className="w-3.5 h-3.5 mr-1" /> Criar Conjunto
            </Button>
          </div>

          {(!data.adsets || data.adsets.length === 0) ? (
            <Card className="p-10 rounded-2xl text-center text-xs text-muted-foreground">Nenhum conjunto de anúncios. Crie o primeiro.</Card>
          ) : data.adsets.map((as) => {
            const isExp = expandedAdsets[as.id];
            const adsInSet = adsByAdset[as.id] || [];
            return (
              <Card key={as.id} className="rounded-2xl overflow-hidden" data-testid={`adset-card-${as.id}`}>
                <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-accent/30" onClick={() => setExpandedAdsets(p => ({ ...p, [as.id]: !p[as.id] }))}>
                  {isExp ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{as.name}</div>
                    <div className="text-[10px] font-mono text-muted-foreground truncate">{as.optimization_goal || "—"} · {as.daily_budget ? fmtBRL(Number(as.daily_budget) / 100) + "/dia" : "—"}</div>
                  </div>
                  <StatusBadge status={as.effective_status} />
                  <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full" onClick={() => toggleAdSet(as.id, as.effective_status)} data-testid={`adset-toggle-${as.id}`}>
                      {as.effective_status === "ACTIVE" ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full text-destructive hover:text-destructive" onClick={() => deleteAdSet(as.id)} data-testid={`adset-delete-${as.id}`}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>

                {isExp && (
                  <div className="border-t border-border/50 bg-muted/20">
                    <div className="flex items-center justify-between px-4 py-2">
                      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Anúncios ({adsInSet.length})</div>
                      <Button size="sm" variant="ghost" onClick={() => openCreateAd(as.id)} className="h-7 text-xs rounded-full" data-testid={`create-ad-${as.id}`}>
                        <PlusCircle className="w-3 h-3 mr-1" /> Criar Anúncio
                      </Button>
                    </div>
                    {adsInSet.length === 0 ? (
                      <div className="px-4 pb-3 text-xs text-muted-foreground">Nenhum anúncio neste conjunto.</div>
                    ) : adsInSet.map((ad) => {
                      const ins = data.ad_insights_by_id?.[ad.id] || {};
                      const thumb = ad.creative?.thumbnail_url || ad.creative?.image_url;
                      return (
                        <div key={ad.id} className="flex items-center gap-3 px-4 py-2 border-t border-border/30 hover:bg-accent/20" data-testid={`ad-row-${ad.id}`}>
                          {thumb ? <img src={thumb} alt="" className="w-9 h-9 rounded-lg object-cover border border-border shrink-0" /> : <div className="w-9 h-9 rounded-lg bg-muted border border-border shrink-0" />}
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium truncate">{ad.name}</div>
                            <div className="text-[10px] font-mono text-muted-foreground truncate">{ins.spend ? fmtBRL(ins.spend) : "—"}{ins.ctr ? ` · CTR ${pct(ins.ctr)}` : ""}</div>
                          </div>
                          <StatusBadge status={ad.effective_status} />
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" className="h-7 w-7 rounded-full" onClick={() => toggleAd(ad.id, ad.effective_status)}>
                              {ad.effective_status === "ACTIVE" ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 rounded-full text-destructive hover:text-destructive" onClick={() => deleteAd(ad.id)}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            );
          })}
        </TabsContent>

        {/* Resultados reais */}
        <TabsContent value="results" className="mt-4 space-y-3">
          {profit?.row ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatTile icon={Users} label="Leads" value={fmt(profit.row.leads)} hint={profit.row.cost_per_lead ? `Custo/lead ${fmtBRL(profit.row.cost_per_lead)}` : "—"} />
                <StatTile icon={Target} label="Qualificados" value={fmt(profit.row.qualified)} hint={`Taxa ${pct(profit.row.qualification_rate_pct)}`} />
                <StatTile icon={DollarSign} label="Vendas" value={fmt(profit.row.sales)} hint={profit.row.cac ? `CAC ${fmtBRL(profit.row.cac)}` : "—"} />
                <StatTile icon={TrendingUp} label="Receita" value={fmtBRL(profit.row.revenue)} hint={`Líquida ${fmtBRL(profit.row.net_revenue)}`} />
              </div>
              <Card className={`p-5 rounded-2xl border ${profit.row.profit >= 0 ? "border-green-500/30" : "border-red-500/30"}`}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Lucro real (receita × margem − investimento)</div>
                    <div className={`text-2xl font-bold mt-1 tabular-nums ${profit.row.profit >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>{fmtBRL(profit.row.profit)}</div>
                  </div>
                  {!profit.row.margin_configured && (
                    <div className="text-[11px] text-amber-600 dark:text-amber-400 max-w-[220px] text-right">
                      Margem não configurada — cadastre o produto no Cérebro do Negócio e vincule esta campanha para o lucro sair exato.
                    </div>
                  )}
                </div>
              </Card>
              {profit.row.cac_violation && (
                <div className="text-xs text-red-600 dark:text-red-400 px-1">⚠ CAC ({fmtBRL(profit.row.cac)}) acima do máximo definido ({fmtBRL(profit.row.max_cac)}).</div>
              )}
            </>
          ) : (
            <Card className="p-10 rounded-2xl text-center">
              <TrendingUp className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <div className="text-sm font-medium">Sem dados de conversão para esta campanha</div>
              <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                A Meta entrega gasto, cliques e impressões. Para ver leads, vendas, receita e lucro reais aqui,
                conecte suas vendas via webhook em <b>Lucro &amp; Leads</b> e envie o <span className="font-mono">campaign_id</span> desta campanha em cada evento.
              </p>
              <Button variant="outline" size="sm" className="mt-3 rounded-full" onClick={() => navigate("/app/profit")}>Configurar Lucro &amp; Leads</Button>
            </Card>
          )}
        </TabsContent>

        {/* Funil */}
        <TabsContent value="funnel" className="mt-4 space-y-3">
          <Card className="p-5 rounded-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <div className="text-sm font-semibold">Diagnóstico de funil desta campanha</div>
                <div className="text-xs text-muted-foreground">Já preenchido com os dados reais (Meta + suas vendas). Ajuste o que quiser e diagnostique.</div>
              </div>
              <Button size="sm" onClick={runFunnel} disabled={funnelLoading || !funnelInput} data-testid="funnel-diagnose-btn" className="rounded-full">
                {funnelLoading ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Stethoscope className="w-3.5 h-3.5 mr-1" />} Diagnosticar
              </Button>
            </div>
            {funnelInput && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  ["impressions", "Impressões"], ["clicks", "Cliques"], ["landing_page_views", "Views da LP"],
                  ["leads", "Leads"], ["qualified_leads", "Qualificados"], ["sales", "Vendas"],
                  ["revenue", "Receita (R$)"], ["spend", "Investido (R$)"],
                ].map(([key, label]) => (
                  <div key={key} className="space-y-1">
                    <Label className="text-[11px]">{label}</Label>
                    <Input type="number" value={funnelInput[key]} onChange={(e) => setFI({ [key]: Number(e.target.value) })} />
                  </div>
                ))}
              </div>
            )}
          </Card>

          {funnelResult?.diagnosis && (
            <Card className="p-5 rounded-2xl space-y-4">
              {funnelResult.diagnosis.weakest_stage && (
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Estágio mais fraco</div>
                  <div className="text-lg font-semibold text-red-600 dark:text-red-400">{funnelResult.diagnosis.weakest_stage}</div>
                </div>
              )}
              {funnelResult.diagnosis.diagnosis && <p className="text-sm leading-relaxed">{funnelResult.diagnosis.diagnosis}</p>}
              {Array.isArray(funnelResult.diagnosis.fixes) && funnelResult.diagnosis.fixes.length > 0 && (
                <div className="space-y-2">
                  <div className="text-sm font-semibold">Correções priorizadas</div>
                  {funnelResult.diagnosis.fixes.map((f, i) => (
                    <div key={i} className="border border-border rounded-xl p-3">
                      <div className="text-sm font-medium">{f.action}</div>
                      {f.why && <div className="text-xs text-muted-foreground mt-0.5">{f.why}</div>}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
        </TabsContent>

        <TabsContent value="creatives" className="mt-4">
          <CampaignCreatives campaignId={id} />
        </TabsContent>

        <TabsContent value="knowledge" className="mt-4">
          <CampaignKnowledge campaignId={id} />
        </TabsContent>
      </Tabs>

      {/* AI Drawer */}
      <Sheet open={aiOpen} onOpenChange={setAiOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 text-base"><Sparkles className="w-4 h-4 text-primary" /> Otimizações IA</SheetTitle>
            <div className="text-[11px] text-muted-foreground">
              {aiCachedAt ? `Gerado em ${new Date(aiCachedAt).toLocaleTimeString("pt-BR")} (cache 1h)` : "Analisando sua campanha..."}
            </div>
          </SheetHeader>
          {aiLoading ? (
            <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Analisando…</div>
          ) : aiSuggestions.length === 0 ? (
            <div className="mt-6 text-xs text-muted-foreground">Sem sugestões.</div>
          ) : (
            <div className="mt-6 space-y-3">
              {aiSuggestions.map((s, i) => (
                <div key={i} className="border border-border rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="text-sm font-semibold flex-1">{s.title || `Ação ${i + 1}`}</div>
                    {s.risk && <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-full ${s.risk === "high" ? "bg-red-500/10 text-red-600" : s.risk === "medium" ? "bg-yellow-500/10 text-yellow-700" : "bg-green-500/10 text-green-600"}`}>{s.risk === "high" ? "risco alto" : s.risk === "medium" ? "risco médio" : "risco baixo"}</span>}
                  </div>
                  {s.change && <div className="text-xs mb-1"><span className="text-muted-foreground">Mudança: </span>{s.change}</div>}
                  {s.expected_impact && <div className="text-xs mb-1"><span className="text-muted-foreground">Impacto: </span>{s.expected_impact}</div>}
                  {s.target_id && (
                    <Button size="sm" variant="outline" onClick={() => executeSuggestion(s, i)} disabled={executingSuggestion === i} className="mt-2 rounded-full" data-testid={`exec-sug-${i}`}>
                      {executingSuggestion === i ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Zap className="w-3.5 h-3.5 mr-1 text-primary" />} Executar
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Create AdSet Drawer */}
      <Sheet open={createAdsetOpen} onOpenChange={setCreateAdsetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader><SheetTitle>Criar Conjunto de Anúncios</SheetTitle></SheetHeader>
          <div className="mt-4 space-y-3">
            <div className="space-y-1.5"><Label>Nome *</Label><Input value={adsetForm.name} onChange={(e) => setAdsetForm({ ...adsetForm, name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Verba diária (R$)</Label><Input type="number" value={adsetForm.daily_budget} onChange={(e) => setAdsetForm({ ...adsetForm, daily_budget: Number(e.target.value) })} /></div>
            <div className="space-y-1.5"><Label>Otimização</Label>
              <Select value={adsetForm.optimization_goal} onValueChange={(v) => setAdsetForm({ ...adsetForm, optimization_goal: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["LINK_CLICKS", "OFFSITE_CONVERSIONS", "LANDING_PAGE_VIEWS", "REACH", "IMPRESSIONS", "LEAD_GENERATION", "THRUPLAY"].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={submitAdset} disabled={savingAdset} className="w-full rounded-full">{savingAdset ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <PlusCircle className="w-4 h-4 mr-1" />} Criar Conjunto</Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Create Ad Drawer — mesma UX do criador manual, com preview e importar criativo */}
      <Sheet open={createAdOpen} onOpenChange={setCreateAdOpen}>
        <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto">
          <SheetHeader><SheetTitle>Criar Anúncio</SheetTitle></SheetHeader>
          <div className="mt-4">
            {targetAdsetId && (
              <AdComposer
                adsetId={targetAdsetId}
                campaignId={id}
                pages={pages}
                onCreated={() => { setCreateAdOpen(false); load(); }}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
