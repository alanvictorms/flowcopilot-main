import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Activity, PlayCircle, RefreshCw, Loader2 } from "lucide-react";

import api, { formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function Automation() {
  const [status, setStatus] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [s, h] = await Promise.all([
        api.get("/automation/status"),
        api.get("/automation/history"),
      ]);
      setStatus(s.data);
      setHistory(h.data || []);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const runNow = async () => {
    setRunning(true);
    try {
      const { data } = await api.post("/automation/run-now");
      if (data.skipped) toast.info(`Ciclo pulado: ${data.reason}`);
      else toast.success(`Ciclo executado · ${(data.rules || []).length} regra(s) avaliada(s).`);
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setRunning(false);
    }
  };

  if (loading || !status) return <div className="text-sm text-muted-foreground">Carregando…</div>;

  return (
    <div className="space-y-6" data-testid="automation-page">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-6 rounded-2xl lg:col-span-2">
          <div className="flex items-start gap-4">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${status.kill_switch ? "bg-destructive/10" : "bg-primary/10"}`}>
              <Activity className={`w-5 h-5 ${status.kill_switch ? "text-destructive" : "text-primary"}`} />
            </div>
            <div className="flex-1">
              <div className="text-lg font-semibold">Motor de Automação Contínua</div>
              <div className="text-sm text-muted-foreground mt-1">
                Executa suas regras ativas a cada {Math.round(status.interval_seconds / 60)} minutos.
              </div>
              <div className="flex gap-2 mt-3">
                <Badge variant="outline" className="rounded-full">Modo: {status.mode}</Badge>
                <Badge variant={status.kill_switch ? "destructive" : "outline"} className="rounded-full">
                  {status.kill_switch ? "Kill Switch ATIVO" : "Operando"}
                </Badge>
                <Badge variant="outline" className="rounded-full">{status.total_runs || 0} execuções totais</Badge>
              </div>
              <div className="text-xs text-muted-foreground mt-3">
                Última execução: {status.last_run_at ? new Date(status.last_run_at).toLocaleString() : "—"}
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-6 rounded-2xl flex flex-col items-center justify-center gap-3">
          <div className="text-sm text-muted-foreground">Ciclo manual</div>
          <Button onClick={runNow} disabled={running || status.kill_switch} className="rounded-full" data-testid="automation-run-now">
            {running ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <PlayCircle className="w-4 h-4 mr-1" />}
            Rodar agora
          </Button>
          <div className="text-xs text-muted-foreground text-center max-w-[220px]">
            Executa todas as regras ativas imediatamente.
          </div>
        </Card>
      </div>

      <Card className="p-6 rounded-2xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-lg font-semibold">Histórico de execuções</div>
            <div className="text-xs text-muted-foreground">Últimos 30 ciclos</div>
          </div>
          <Button variant="outline" size="icon" className="rounded-full" onClick={load}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
        {history.length === 0 ? (
          <div className="text-center py-8 text-xs text-muted-foreground">
            Nenhuma execução ainda. O primeiro ciclo automático rodará em breve.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {history.map((h, i) => (
              <li key={i} className="py-3 flex items-center gap-4">
                <div className={`w-2 h-2 rounded-full ${h.result?.skipped ? "bg-yellow-500" : "bg-primary"}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">
                    {h.result?.skipped ? `Pulado — ${h.result?.reason}` : `${(h.result?.rules || []).length} regra(s) avaliadas`}
                  </div>
                  <div className="text-[11px] font-mono text-muted-foreground">
                    {new Date(h.created_at).toLocaleString()} {h.manual ? "· manual" : "· automático"}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  {(h.result?.rules || []).reduce((a, r) => a + (r.applied || 0), 0)} aplicações
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
