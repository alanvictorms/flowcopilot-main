import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ScrollText, RefreshCw, Loader2 } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function AdminAudit() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { const { data } = await api.get("/admin/audit-log", { params: { limit: 100 } }); setLogs(data || []); }
    catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ScrollText className="w-5 h-5 text-primary" />
        <div className="text-sm font-semibold flex-1">Log de ações administrativas</div>
        <Button variant="outline" size="icon" className="rounded-full" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>
      {loading ? (
        <Card className="p-10 rounded-2xl text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></Card>
      ) : logs.length === 0 ? (
        <Card className="p-10 rounded-2xl text-center text-sm text-muted-foreground">Nenhuma ação registrada.</Card>
      ) : (
        <Card className="rounded-2xl divide-y divide-border/50">
          {logs.map((l, i) => (
            <div key={i} className="p-3 flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="outline" className="text-[10px] font-mono">{l.action}</Badge>
              <span className="flex-1 min-w-0 truncate">{l.summary}</span>
              <span className="text-xs text-muted-foreground">{l.admin_name || l.admin_email}</span>
              <span className="text-[10px] font-mono text-muted-foreground">{l.created_at ? new Date(l.created_at).toLocaleString("pt-BR") : ""}</span>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
