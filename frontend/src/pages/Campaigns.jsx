import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Play, Pause, RefreshCw, Search, LayoutGrid, List as ListIcon,
  MoreHorizontal, ArrowUpRight, DollarSign, MousePointerClick, Target, Plus,
} from "lucide-react";

import api, { formatApiError } from "@/lib/api";
import EmptyMetaState from "@/components/EmptyMetaState";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const fmt = (n) => Number(n || 0).toLocaleString("pt-BR");
const fmtMoney = (n) => Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n) => (n ? `${Number(n).toFixed(2)}%` : "—");

const STATUS_META = {
  ACTIVE: { label: "Ativa", cls: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20", dot: "bg-green-500" },
  PAUSED: { label: "Pausada", cls: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20", dot: "bg-yellow-500" },
  DELETED: { label: "Excluída", cls: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20", dot: "bg-red-500" },
  ARCHIVED: { label: "Arquivada", cls: "bg-muted text-muted-foreground border-border", dot: "bg-muted-foreground" },
  LEARNING_LIMITED: { label: "Aprendizado limitado", cls: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20", dot: "bg-orange-500" },
};

function StatusBadge({ status }) {
  const m = STATUS_META[status] || { label: status || "—", cls: "bg-muted text-muted-foreground border-border", dot: "bg-muted-foreground" };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium border ${m.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}

export default function Campaigns() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [notConnected, setNotConnected] = useState(false);
  const [campaigns, setCampaigns] = useState([]);
  const [insights, setInsights] = useState([]);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [busy, setBusy] = useState({});
  const [view, setView] = useState(() => localStorage.getItem("fp_campaigns_view") || "cards");

  const setViewPersist = (v) => { setView(v); localStorage.setItem("fp_campaigns_view", v); };

  const load = async () => {
    setLoading(true);
    setNotConnected(false);
    try {
      const [c, i] = await Promise.all([
        api.get("/meta/campaigns"),
        api.get("/meta/insights", { params: { level: "campaign", date_preset: "last_30d" } }),
      ]);
      setCampaigns(c.data || []);
      setInsights(i.data || []);
    } catch (err) {
      if (err.response?.status === 428) setNotConnected(true);
      else toast.error(formatApiError(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const insightsById = useMemo(() => {
    const m = {};
    for (const r of insights) m[r.campaign_id] = r;
    return m;
  }, [insights]);

  const filtered = useMemo(() => {
    return campaigns
      .filter((c) => (statusFilter === "all" ? true : c.effective_status === statusFilter))
      .filter((c) => (q ? (c.name || "").toLowerCase().includes(q.toLowerCase()) : true));
  }, [campaigns, q, statusFilter]);

  const totals = useMemo(() => {
    let spend = 0, clicks = 0, active = 0;
    for (const c of filtered) {
      const ins = insightsById[c.id] || {};
      spend += Number(ins.spend || 0);
      clicks += Number(ins.clicks || 0);
      if (c.effective_status === "ACTIVE") active += 1;
    }
    return { spend, clicks, active, count: filtered.length };
  }, [filtered, insightsById]);

  const toggleStatus = async (c) => {
    const nextStatus = c.effective_status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    setBusy((b) => ({ ...b, [c.id]: true }));
    try {
      await api.post(`/meta/campaigns/${c.id}/status`, { status: nextStatus });
      toast.success(`Campanha ${c.name} → ${nextStatus === "ACTIVE" ? "Ativa" : "Pausada"}`);
      setCampaigns((prev) => prev.map((x) => (x.id === c.id ? { ...x, effective_status: nextStatus, status: nextStatus } : x)));
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || err.message);
    } finally {
      setBusy((b) => ({ ...b, [c.id]: false }));
    }
  };

  if (notConnected) return <EmptyMetaState />;

  return (
    <div className="space-y-5" data-testid="campaigns-page">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[220px] relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar campanha…" className="pl-9 rounded-full" data-testid="campaigns-search-input" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[170px] rounded-full" data-testid="campaigns-status-filter">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="ACTIVE">Ativas</SelectItem>
            <SelectItem value="PAUSED">Pausadas</SelectItem>
            <SelectItem value="ARCHIVED">Arquivadas</SelectItem>
          </SelectContent>
        </Select>
        {/* View toggle */}
        <div className="flex items-center rounded-full border border-border p-0.5" data-testid="campaigns-view-toggle">
          <button
            onClick={() => setViewPersist("cards")}
            className={`w-8 h-7 rounded-full flex items-center justify-center transition-colors ${view === "cards" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            title="Cards"
            data-testid="campaigns-view-cards"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setViewPersist("list")}
            className={`w-8 h-7 rounded-full flex items-center justify-center transition-colors ${view === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            title="Lista"
            data-testid="campaigns-view-list"
          >
            <ListIcon className="w-3.5 h-3.5" />
          </button>
        </div>
        <Button variant="outline" size="icon" className="rounded-full" onClick={load} disabled={loading} data-testid="campaigns-refresh-btn">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
        <Button className="rounded-full" onClick={() => navigate("/app/builder")} data-testid="campaigns-new-btn">
          <Plus className="w-4 h-4 mr-1" /> Nova campanha
        </Button>
      </div>

      {/* Summary strip */}
      {!loading && filtered.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="outline" className="rounded-full py-1">{totals.count} campanha(s)</Badge>
          <Badge variant="outline" className="rounded-full py-1">{totals.active} ativa(s)</Badge>
          <Badge variant="outline" className="rounded-full py-1">Investido 30d: {fmtMoney(totals.spend)}</Badge>
          <Badge variant="outline" className="rounded-full py-1">Cliques 30d: {fmt(totals.clicks)}</Badge>
        </div>
      )}

      {/* Content */}
      {loading ? (
        view === "cards" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-2xl" />)}
          </div>
        ) : (
          <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        )
      ) : filtered.length === 0 ? (
        <Card className="p-12 rounded-2xl text-center text-sm text-muted-foreground">Nenhuma campanha encontrada.</Card>
      ) : view === "cards" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((c) => {
            const ins = insightsById[c.id] || {};
            const isActive = c.effective_status === "ACTIVE";
            return (
              <Card
                key={c.id}
                onClick={() => navigate(`/app/campaigns/${c.id}`)}
                data-testid={`campaign-card-${c.id}`}
                className="group rounded-2xl p-5 cursor-pointer border hover:border-primary/40 hover:shadow-md transition-all flex flex-col gap-4"
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate group-hover:text-primary transition-colors">{c.name}</div>
                    <div className="text-[10px] font-mono text-muted-foreground truncate mt-0.5">{c.objective || "—"}</div>
                  </div>
                  <StatusBadge status={c.effective_status} />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {[
                    { icon: DollarSign, label: "Investido", value: fmtMoney(ins.spend) },
                    { icon: MousePointerClick, label: "CTR", value: pct(ins.ctr) },
                    { icon: Target, label: "CPC", value: ins.cpc ? fmtMoney(ins.cpc) : "—" },
                  ].map((k) => (
                    <div key={k.label} className="rounded-xl bg-muted/40 p-2.5">
                      <div className="flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
                        <k.icon className="w-3 h-3" /> {k.label}
                      </div>
                      <div className="text-sm font-semibold mt-1 tabular-nums truncate">{k.value}</div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-border/50" onClick={(e) => e.stopPropagation()}>
                  <div className="text-[11px] text-muted-foreground">
                    Verba/dia {c.daily_budget ? fmtMoney(Number(c.daily_budget) / 100) : "—"}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant={isActive ? "outline" : "default"} className="rounded-full h-8" onClick={() => toggleStatus(c)} disabled={busy[c.id]} data-testid={`campaign-toggle-${c.id}`}>
                      {isActive ? <><Pause className="w-3 h-3 mr-1" /> Pausar</> : <><Play className="w-3 h-3 mr-1" /> Ativar</>}
                    </Button>
                    <Button size="icon" variant="ghost" className="rounded-full h-8 w-8" onClick={() => navigate(`/app/campaigns/${c.id}`)} title="Abrir">
                      <ArrowUpRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="rounded-2xl overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campanha</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Objetivo</TableHead>
                    <TableHead className="text-right">Verba/dia</TableHead>
                    <TableHead className="text-right">Investido 30d</TableHead>
                    <TableHead className="text-right">CTR</TableHead>
                    <TableHead className="text-right">CPC</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((c) => {
                    const ins = insightsById[c.id] || {};
                    return (
                      <TableRow key={c.id} data-testid={`campaign-row-${c.id}`} className="cursor-pointer hover:bg-accent/40" onClick={() => navigate(`/app/campaigns/${c.id}`)}>
                        <TableCell className="max-w-[280px]">
                          <div className="text-sm font-medium truncate">{c.name}</div>
                          <div className="text-[10px] font-mono text-muted-foreground">{c.id}</div>
                        </TableCell>
                        <TableCell><StatusBadge status={c.effective_status} /></TableCell>
                        <TableCell><Badge variant="outline" className="font-mono text-[10px]">{c.objective || "—"}</Badge></TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{c.daily_budget ? fmtMoney(Number(c.daily_budget) / 100) : "—"}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{fmtMoney(ins.spend)}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{pct(ins.ctr)}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{ins.cpc ? fmtMoney(ins.cpc) : "—"}</TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end items-center gap-1">
                            <Button size="sm" variant="outline" onClick={() => toggleStatus(c)} disabled={busy[c.id]} data-testid={`campaign-toggle-list-${c.id}`}>
                              {c.effective_status === "ACTIVE" ? <><Pause className="w-3 h-3 mr-1" /> Pausar</> : <><Play className="w-3 h-3 mr-1" /> Ativar</>}
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="icon" variant="ghost" data-testid={`campaign-more-${c.id}`}><MoreHorizontal className="w-4 h-4" /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => navigate(`/app/campaigns/${c.id}`)}>Abrir detalhes</DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                  <a href={`https://business.facebook.com/adsmanager/manage/campaigns?selected_campaign_ids=${c.id}`} target="_blank" rel="noreferrer">Abrir no Ads Manager</a>
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
