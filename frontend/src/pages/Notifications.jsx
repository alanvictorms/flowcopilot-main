import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bell, RefreshCw, Loader2 } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const URG = { high: "bg-red-500/10 text-red-600", medium: "bg-yellow-500/10 text-yellow-700", low: "bg-muted text-muted-foreground" };

export default function Notifications() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { const { data } = await api.get("/notifications"); setItems(data || []); }
    catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const markRead = async (n) => {
    try { await api.post(`/notifications/${n.id}/read`); setItems((xs) => xs.map((x) => x.id === n.id ? { ...x, read: true } : x)); } catch {}
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center gap-2">
        <Bell className="w-5 h-5 text-primary" />
        <div className="text-sm font-semibold flex-1">Notificações</div>
        <Button variant="outline" size="icon" className="rounded-full" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>
      {loading ? (
        <Card className="p-10 rounded-2xl text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></Card>
      ) : items.length === 0 ? (
        <Card className="p-10 rounded-2xl text-center text-sm text-muted-foreground">Nenhuma notificação.</Card>
      ) : (
        <div className="space-y-2">
          {items.map((n) => (
            <Card key={n.id} className={`p-4 rounded-2xl ${!n.read ? "border-primary/30" : ""}`} onClick={() => !n.read && markRead(n)}>
              <div className="flex items-center gap-2">
                <div className="text-sm font-semibold flex-1">{n.title}</div>
                <Badge className={`rounded-full text-[10px] ${URG[n.urgency] || ""}`}>{n.urgency}</Badge>
                {!n.read && <span className="w-2 h-2 rounded-full bg-primary" />}
              </div>
              <div className="text-xs text-muted-foreground mt-1">{n.message}</div>
              <div className="text-[10px] font-mono text-muted-foreground mt-1">{n.created_at ? new Date(n.created_at).toLocaleString("pt-BR") : ""}</div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
