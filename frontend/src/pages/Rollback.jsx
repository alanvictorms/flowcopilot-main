import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Undo2, RefreshCw, Loader2 } from "lucide-react";

import api, { formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function Rollback() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState({});

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/rollback/events");
      setEvents(data || []);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const revert = async (id) => {
    if (!confirm("Reverter esta alteração? A configuração anterior será restaurada no Meta.")) return;
    setBusy((b) => ({ ...b, [id]: true }));
    try {
      await api.post(`/rollback/${id}`);
      toast.success("Alteração revertida.");
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setBusy((b) => ({ ...b, [id]: false }));
    }
  };

  return (
    <div className="space-y-4" data-testid="rollback-page">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">Verificação</div>
          <h2 className="text-2xl font-semibold tracking-tight">Rollback de alterações</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Alterações com estado anterior salvo podem ser revertidas em 1 clique.
          </p>
        </div>
        <Button variant="outline" size="icon" className="rounded-full" onClick={load}>
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <Card className="p-6 rounded-2xl">
        {loading ? (
          <div className="text-sm text-muted-foreground">Carregando…</div>
        ) : events.length === 0 ? (
          <div className="text-center py-10 text-xs text-muted-foreground">
            Nenhuma alteração revertível ainda. Assim que uma otimização for aplicada, ela aparecerá aqui.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {events.map((e) => (
              <li key={e.id} className="py-4 flex flex-wrap items-center gap-3" data-testid={`rollback-row-${e.id}`}>
                <Badge variant="outline" className="rounded-full text-[10px] font-mono uppercase">
                  {e.kind}
                </Badge>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">
                    {e.target_type} · <span className="font-mono text-xs">{e.target_id}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                    Antes: {JSON.stringify(e.before_state)} → Depois: {JSON.stringify(e.change)}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {new Date(e.created_at).toLocaleString()}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => revert(e.id)}
                  disabled={busy[e.id]}
                  className="rounded-full"
                  data-testid={`rollback-btn-${e.id}`}
                >
                  {busy[e.id] ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Undo2 className="w-3.5 h-3.5 mr-1" />}
                  Reverter
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
