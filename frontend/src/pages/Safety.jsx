import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ShieldAlert, AlertTriangle, AlertOctagon, Info, RefreshCw, Loader2 } from "lucide-react";

import api, { formatApiError } from "@/lib/api";
import EmptyMetaState from "@/components/EmptyMetaState";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const SEV_ICON = {
  critical: AlertOctagon,
  high: AlertTriangle,
  medium: AlertTriangle,
  low: Info,
};
const SEV_COLOR = {
  critical: "text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/30",
  high: "text-orange-600 dark:text-orange-400 bg-orange-500/10 border-orange-500/30",
  medium: "text-yellow-600 dark:text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
  low: "text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/30",
};

export default function Safety() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [notConnected, setNotConnected] = useState(false);

  const scan = async () => {
    setLoading(true);
    setNotConnected(false);
    try {
      const { data } = await api.get("/safety/scan");
      setData(data);
      if (data.critical_count > 0) toast.error(`${data.critical_count} incidente(s) crítico(s) detectado(s)`);
      else if ((data.incidents || []).length > 0) toast.warning(`${data.incidents.length} alerta(s)`);
      else toast.success("Nenhum incidente detectado.");
    } catch (err) {
      if (err.response?.status === 428) setNotConnected(true);
      else toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { scan(); }, []);

  if (notConnected) return <EmptyMetaState />;

  return (
    <div className="space-y-6" data-testid="safety-page">
      <Card className={`p-6 rounded-2xl border-2 ${data?.should_freeze_automation ? "border-destructive" : "border-transparent"}`}>
        <div className="flex items-center gap-4">
          <div className={`w-14 h-14 rounded-full flex items-center justify-center ${data?.should_freeze_automation ? "bg-destructive/10" : "bg-primary/10"}`}>
            <ShieldAlert className={`w-6 h-6 ${data?.should_freeze_automation ? "text-destructive" : "text-primary"}`} />
          </div>
          <div className="flex-1">
            <div className="text-lg font-semibold">
              {data?.should_freeze_automation ? "🚨 Automação deve ser congelada" : "Sistema saudável"}
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              {data ? `${data.incidents?.length || 0} incidente(s) detectado(s) · ${data.critical_count || 0} crítico(s)` : "Executando varredura…"}
            </div>
            {data?.scanned_at && (
              <div className="text-[11px] font-mono text-muted-foreground mt-1">
                Última varredura: {new Date(data.scanned_at).toLocaleString()}
              </div>
            )}
          </div>
          <Button onClick={scan} disabled={loading} className="rounded-full" data-testid="safety-scan-btn">
            {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
            Nova varredura
          </Button>
        </div>
      </Card>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}
        </div>
      ) : (data?.incidents || []).length === 0 ? (
        <Card className="p-10 rounded-2xl text-center text-sm text-muted-foreground">
          ✅ Nenhum incidente encontrado.
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.incidents.map((inc, i) => {
            const Icon = SEV_ICON[inc.severity] || Info;
            return (
              <Card key={i} className={`p-6 rounded-2xl border-l-4 ${SEV_COLOR[inc.severity]?.split(" ")[2] || ""}`} data-testid={`safety-incident-${i}`}>
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${SEV_COLOR[inc.severity]}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className={`rounded-full text-[10px] font-mono uppercase border ${SEV_COLOR[inc.severity]}`}>
                        {inc.severity}
                      </Badge>
                      <Badge variant="outline" className="rounded-full text-[10px] font-mono">{inc.category}</Badge>
                    </div>
                    <div className="text-sm font-semibold">{inc.title}</div>
                    <div className="text-xs text-muted-foreground mt-1">{inc.detail}</div>
                    {inc.action && (
                      <div className="text-xs mt-2 pt-2 border-t border-border">
                        <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Ação</span>{" "}
                        {inc.action}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
