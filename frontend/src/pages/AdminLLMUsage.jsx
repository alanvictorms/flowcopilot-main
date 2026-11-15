import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Cpu, RefreshCw, Loader2 } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function AdminLLMUsage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/llm-usage");
      setData(data);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const rows = data?.rows || [];
  const fmt = (n) => (n == null ? "—" : Number(n).toLocaleString("pt-BR"));

  return (
    <div className="space-y-4">
      <Card className="p-5 rounded-2xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Cpu className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold">Consumo de tokens por recurso</div>
            <div className="text-xs text-muted-foreground">
              Média de tokens por execução de cada recurso de IA. Valores estimados quando o provedor não retorna a contagem exata.
            </div>
          </div>
          <Button variant="outline" size="sm" className="rounded-full" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          </Button>
        </div>
        {data && (
          <div className="flex flex-wrap gap-2 mt-4">
            <Badge variant="outline" className="rounded-full">{data.resources} recursos</Badge>
            <Badge variant="outline" className="rounded-full">{fmt(data.total_tokens)} tokens no total</Badge>
          </div>
        )}
      </Card>

      {loading ? (
        <Card className="p-10 rounded-2xl text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></Card>
      ) : rows.length === 0 ? (
        <Card className="p-10 rounded-2xl text-center text-sm text-muted-foreground">
          Ainda não há execuções registradas. Use os recursos de IA e volte aqui.
        </Card>
      ) : (
        <Card className="rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                  <th className="px-4 py-3">Recurso</th>
                  <th className="px-4 py-3 text-right">Execuções</th>
                  <th className="px-4 py-3 text-right">Média entrada</th>
                  <th className="px-4 py-3 text-right">Média saída</th>
                  <th className="px-4 py-3 text-right">Média total</th>
                  <th className="px-4 py-3 text-right">Total acumulado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.resource_key} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-medium">{r.name}</div>
                      <div className="text-[10px] font-mono text-muted-foreground">{r.resource_key}</div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmt(r.executions)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{fmt(r.avg_input_tokens)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{fmt(r.avg_output_tokens)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">{fmt(r.avg_total_tokens)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmt(r.total_tokens)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
