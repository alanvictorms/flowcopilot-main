import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Radio, RefreshCw, Loader2, CheckCircle2, AlertTriangle, ShieldX } from "lucide-react";
import {
  ResponsiveContainer, ComposedChart, Line, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid,
} from "recharts";

import api, { formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const SEVERITY_META = {
  critical: { label: "Crítico", cls: "bg-red-500/10 text-red-600 dark:text-red-400", icon: ShieldX },
  high: { label: "Alto", cls: "bg-orange-500/10 text-orange-600 dark:text-orange-400", icon: AlertTriangle },
  medium: { label: "Médio", cls: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400", icon: AlertTriangle },
};

export default function Tracking() {
  const [status, setStatus] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [s, i] = await Promise.all([
        api.get("/tracking/status"),
        api.get("/tracking/incidents"),
      ]);
      setStatus(s.data);
      setIncidents(i.data || []);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const scan = async () => {
    setScanning(true);
    try {
      const { data } = await api.post("/tracking/scan");
      const n = (data.new_incidents || []).length;
      toast[n ? "warning" : "success"](n ? `${n} novo(s) incidente(s) detectado(s).` : "Varredura concluída — nenhum problema novo.");
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setScanning(false);
    }
  };

  const resolve = async (id) => {
    try {
      await api.post(`/tracking/incidents/${id}/resolve`);
      toast.success("Incidente resolvido. As otimizações voltam ao normal no próximo ciclo.");
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  const chartData = (status?.series || []).map((d) => ({
    date: d.date?.slice(5),
    Compras: d.purchases,
    Leads: d.leads,
    "Vendas CRM": status?.crm_daily?.[d.date]?.sales ?? 0,
    Gasto: d.spend,
  }));

  const openIncidents = incidents.filter((i) => i.status === "open");
  const resolved = incidents.filter((i) => i.status !== "open");

  return (
    <div className="space-y-6" data-testid="tracking-page">
      <Card className={`p-6 rounded-2xl border-2 ${openIncidents.some((i) => i.severity === "critical") ? "border-destructive" : "border-transparent"}`}>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Radio className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <div className="text-lg font-semibold">Monitor de Tracking</div>
            <div className="text-sm text-muted-foreground mt-1">
              Vigia Pixel/CAPI/CRM: queda de eventos, conversões zeradas e divergências.
              Incidente crítico congela otimizações automaticamente.
            </div>
          </div>
          <Button className="rounded-full" onClick={scan} disabled={scanning} data-testid="tracking-scan-btn">
            {scanning ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
            Varredura agora
          </Button>
        </div>
        {status && (
          <div className="mt-3">
            {status.healthy ? (
              <Badge className="rounded-full border-0 bg-green-500/10 text-green-600 dark:text-green-400">
                <CheckCircle2 className="w-3 h-3 mr-1" /> Rastreamento saudável
              </Badge>
            ) : (
              <Badge className="rounded-full border-0 bg-red-500/10 text-red-600 dark:text-red-400">
                <AlertTriangle className="w-3 h-3 mr-1" /> {openIncidents.length} incidente(s) aberto(s)
              </Badge>
            )}
          </div>
        )}
      </Card>

      {loading ? (
        <Skeleton className="h-64" />
      ) : chartData.length === 0 ? (
        <Card className="p-10 rounded-2xl text-center text-sm text-muted-foreground">
          Sem histórico ainda. Sincronize o Hub de Dados (Motor Contínuo → Rodar agora) para alimentar o monitor.
        </Card>
      ) : (
        <Card className="p-6 rounded-2xl">
          <div className="text-sm font-semibold mb-4">Eventos por dia — Meta × CRM (14 dias)</div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="Compras" fill="hsl(83 78% 55%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Vendas CRM" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Line type="monotone" dataKey="Leads" stroke="#a855f7" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {openIncidents.length > 0 && (
        <div className="space-y-3">
          <div className="text-sm font-semibold">Incidentes abertos</div>
          {openIncidents.map((inc) => {
            const m = SEVERITY_META[inc.severity] || SEVERITY_META.medium;
            const Icon = m.icon;
            return (
              <Card key={inc.id} className="p-5 rounded-2xl" data-testid={`tracking-incident-${inc.id}`}>
                <div className="flex flex-wrap items-start gap-3">
                  <Badge className={`rounded-full border-0 ${m.cls}`}>
                    <Icon className="w-3 h-3 mr-1" /> {m.label}
                  </Badge>
                  <div className="flex-1 min-w-[220px]">
                    <div className="text-sm font-semibold">{inc.title}</div>
                    <div className="text-xs text-muted-foreground mt-1">{inc.detail}</div>
                    <div className="text-[10px] text-muted-foreground mt-1">
                      Aberto em {new Date(inc.created_at).toLocaleString("pt-BR")}
                    </div>
                  </div>
                  <Button size="sm" variant="outline" className="rounded-full" onClick={() => resolve(inc.id)}>
                    <CheckCircle2 className="w-4 h-4 mr-1" /> Marcar resolvido
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {resolved.length > 0 && (
        <Card className="p-6 rounded-2xl">
          <div className="text-sm font-semibold mb-3">Histórico de incidentes</div>
          <ul className="divide-y divide-border">
            {resolved.slice(0, 10).map((inc) => (
              <li key={inc.id} className="py-2.5 flex items-center gap-3 text-xs">
                <Badge variant="outline" className="rounded-full text-[10px]">{inc.severity}</Badge>
                <span className="flex-1 truncate">{inc.title}</span>
                <span className="text-muted-foreground text-[10px]">
                  {new Date(inc.created_at).toLocaleDateString("pt-BR")}
                  {inc.resolved_at && ` → resolvido ${new Date(inc.resolved_at).toLocaleDateString("pt-BR")}`}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
