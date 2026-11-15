import { useEffect, useState } from "react";
import { toast } from "sonner";
import { TrendingUp, Copy, Send, Plus, Loader2, RefreshCw } from "lucide-react";

import api, { formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";

const EVENTS = [
  { value: "lead", label: "Lead capturado" },
  { value: "qualified", label: "Lead qualificado" },
  { value: "sale", label: "Venda aprovada" },
  { value: "refund", label: "Reembolso" },
  { value: "lost", label: "Perdido" },
];

const emptyEvent = {
  external_id: "", event: "sale", value: 0, currency: "BRL",
  email: "", phone: "", campaign_id: "", ad_id: "", lost_reason: "",
};

export default function Profit() {
  const [token, setToken] = useState("");
  const [summary, setSummary] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(emptyEvent);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [t, s, e] = await Promise.all([
        api.get("/profit/webhook/token"),
        api.get("/profit/summary"),
        api.get("/profit/events"),
      ]);
      setToken(t.data?.token || "");
      setSummary(s.data);
      setEvents(e.data || []);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const issueToken = async () => {
    const { data } = await api.post("/profit/webhook/token");
    setToken(data.token);
    toast.success("Novo token gerado.");
  };

  const copyToken = () => { navigator.clipboard.writeText(token); toast.success("Copiado."); };

  const saveEvent = async () => {
    setSaving(true);
    try {
      await api.post("/profit/events", { ...draft, value: Number(draft.value) });
      toast.success("Evento adicionado.");
      setOpen(false); setDraft(emptyEvent);
      load();
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
    finally { setSaving(false); }
  };

  const sync = async () => {
    setSyncing(true);
    try {
      const { data } = await api.post("/profit/sync-to-meta");
      toast.success(`${data.sent} venda(s) enviadas ao Meta CAPI.`);
      load();
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
    finally { setSyncing(false); }
  };

  const webhookUrl = `${window.location.origin}/api/profit/webhook`;

  return (
    <div className="space-y-6" data-testid="profit-page">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-6 rounded-2xl">
          <div className="text-xs text-muted-foreground mb-2">Leads</div>
          <div className="text-3xl font-semibold tracking-tighter">{summary?.total_leads ?? "—"}</div>
          <div className="text-[11px] text-muted-foreground mt-2">Qualif: {summary?.qualification_rate_pct || 0}%</div>
        </Card>
        <Card className="p-6 rounded-2xl">
          <div className="text-xs text-muted-foreground mb-2">Vendas</div>
          <div className="text-3xl font-semibold tracking-tighter">{summary?.sales_count ?? "—"}</div>
          <div className="text-[11px] text-muted-foreground mt-2">Taxa: {summary?.sales_rate_pct || 0}%</div>
        </Card>
        <Card className="p-6 rounded-2xl">
          <div className="text-xs text-muted-foreground mb-2">Receita líquida</div>
          <div className="text-3xl font-semibold tracking-tighter">{summary?.net_revenue?.toLocaleString?.() ?? "—"}</div>
          <div className="text-[11px] text-muted-foreground mt-2">Ticket: {summary?.avg_ticket || 0}</div>
        </Card>
        <Card className="p-6 rounded-2xl flex flex-col justify-between">
          <div className="text-xs text-muted-foreground">Meta Offline Events</div>
          <Button onClick={sync} disabled={syncing} className="rounded-full mt-2" data-testid="profit-sync-btn">
            {syncing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
            Enviar ao Meta
          </Button>
        </Card>
      </div>

      <Card className="p-6 rounded-2xl">
        <div className="flex items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="text-lg font-semibold mb-1">Integração via Webhook</div>
            <div className="text-xs text-muted-foreground mb-3">Configure seu CRM para POSTar eventos aqui.</div>
            <div className="space-y-2 text-xs font-mono">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground shrink-0">URL:</span>
                <code className="flex-1 truncate p-2 rounded bg-muted">{webhookUrl}</code>
                <Button size="icon" variant="ghost" onClick={() => { navigator.clipboard.writeText(webhookUrl); toast.success("Copiado."); }}><Copy className="w-3.5 h-3.5" /></Button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground shrink-0">Header X-Webhook-Token:</span>
                <code className="flex-1 truncate p-2 rounded bg-muted">{token || "— gere um token —"}</code>
                {token && <Button size="icon" variant="ghost" onClick={copyToken}><Copy className="w-3.5 h-3.5" /></Button>}
              </div>
              <div className="text-muted-foreground mt-2">
                Body JSON: {`{external_id, event: "sale"|"lead"|..., value, currency, email, phone, campaign_id, ad_id, lost_reason}`}
              </div>
            </div>
          </div>
          <Button variant="outline" onClick={issueToken} className="rounded-full" data-testid="profit-token-btn">
            {token ? "Regenerar token" : "Gerar token"}
          </Button>
        </div>
      </Card>

      <Card className="p-6 rounded-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="text-lg font-semibold">Eventos recebidos</div>
          <div className="flex gap-2">
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="rounded-full" data-testid="profit-add-btn"><Plus className="w-3.5 h-3.5 mr-1" /> Adicionar manual</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Novo evento</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>External ID</Label>
                      <Input value={draft.external_id} onChange={(e) => setDraft({ ...draft, external_id: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Tipo</Label>
                      <Select value={draft.event} onValueChange={(v) => setDraft({ ...draft, event: v })}>
                        <SelectTrigger className="rounded-full"><SelectValue /></SelectTrigger>
                        <SelectContent>{EVENTS.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Valor</Label>
                      <Input type="number" value={draft.value} onChange={(e) => setDraft({ ...draft, value: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Moeda</Label>
                      <Input value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value })} />
                    </div>
                    <div className="space-y-1.5 col-span-2">
                      <Label>Email</Label>
                      <Input value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
                    </div>
                    <div className="space-y-1.5 col-span-2">
                      <Label>Telefone</Label>
                      <Input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
                    </div>
                    {draft.event === "lost" && (
                      <div className="space-y-1.5 col-span-2">
                        <Label>Motivo da perda</Label>
                        <Input value={draft.lost_reason} onChange={(e) => setDraft({ ...draft, lost_reason: e.target.value })} />
                      </div>
                    )}
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
                  <Button onClick={saveEvent} disabled={saving} className="rounded-full">
                    {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null} Salvar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Button variant="outline" size="icon" className="rounded-full" onClick={load}>
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {events.length === 0 ? (
          <div className="text-center py-8 text-xs text-muted-foreground">Nenhum evento recebido ainda.</div>
        ) : (
          <ul className="divide-y divide-border">
            {events.slice(0, 50).map((e, i) => (
              <li key={i} className="py-3 flex items-center gap-3 text-sm">
                <Badge className="rounded-full text-[10px] font-mono">{e.event}</Badge>
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-xs truncate">{e.external_id}</div>
                  <div className="text-[11px] text-muted-foreground">{new Date(e.received_at).toLocaleString()}</div>
                </div>
                {e.value > 0 && <div className="font-mono text-xs">{Number(e.value).toFixed(2)} {e.currency}</div>}
                {e.synced_to_meta && <Badge variant="outline" className="rounded-full text-[10px]">✓ Meta</Badge>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {summary?.lost_reasons && Object.keys(summary.lost_reasons).length > 0 && (
        <Card className="p-6 rounded-2xl">
          <div className="text-lg font-semibold mb-3">Motivos de perda</div>
          <div className="space-y-2">
            {Object.entries(summary.lost_reasons).map(([reason, count]) => (
              <div key={reason} className="flex items-center gap-3 text-sm">
                <div className="flex-1">{reason}</div>
                <div className="font-mono text-xs">{count}</div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
