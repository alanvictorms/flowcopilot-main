import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Users, RefreshCw, Loader2, Phone, Mail } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const COLS = [
  { key: "novo", label: "Novos" },
  { key: "contato", label: "Em contato" },
  { key: "qualificado", label: "Qualificados" },
  { key: "ganho", label: "Ganhos" },
  { key: "perdido", label: "Perdidos" },
];

function Stat({ label, value }) {
  return (
    <Card className="p-4 rounded-2xl">
      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </Card>
  );
}

export default function Leads() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null);

  const load = async () => {
    setLoading(true);
    try { setData((await api.get("/leads")).data); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const move = async (lead, status) => {
    setData((d) => ({ ...d, leads: d.leads.map((l) => (l.id === lead.id ? { ...l, status } : l)) }));
    try { await api.patch(`/leads/${lead.id}`, { status }); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); load(); }
  };

  const leads = data?.leads || [];
  const s = data?.stats || {};
  const won = leads.filter((l) => l.status === "ganho").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Users className="w-5 h-5 text-primary" />
        <div className="text-sm font-semibold flex-1">Leads</div>
        <Button variant="outline" size="icon" className="rounded-full" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Visitas na página" value={s.views ?? 0} />
        <Stat label="Leads" value={s.total ?? 0} />
        <Stat label="Conversão da página" value={`${s.conversion ?? 0}%`} />
        <Stat label="Vendas (ganhos)" value={won} />
      </div>

      {loading && !data ? (
        <Card className="p-10 rounded-2xl text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></Card>
      ) : leads.length === 0 ? (
        <Card className="p-10 rounded-2xl text-center text-sm text-muted-foreground">
          Nenhum lead ainda. Publique a landing no Copiloto e os leads aparecem aqui.
        </Card>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {COLS.map((c) => {
            const items = leads.filter((l) => (l.status || "novo") === c.key);
            return (
              <div key={c.key} className="w-72 shrink-0 space-y-2">
                <div className="flex items-center justify-between px-1 text-xs font-medium">
                  <span>{c.label}</span><span className="text-muted-foreground font-mono">{items.length}</span>
                </div>
                {items.map((l) => (
                  <Card key={l.id} className="p-3 rounded-xl space-y-2 cursor-pointer" onClick={() => setOpen(open === l.id ? null : l.id)}>
                    <div className="text-sm font-medium">{l.name}</div>
                    <div className="text-[11px] text-muted-foreground">{l.campaign_name} · {new Date(l.created_at).toLocaleDateString("pt-BR")}</div>
                    {open === l.id && (
                      <div className="space-y-1.5 text-xs" onClick={(e) => e.stopPropagation()}>
                        <a href={`mailto:${l.email}`} className="flex items-center gap-1 text-primary"><Mail className="w-3 h-3" />{l.email}</a>
                        {l.phone && (
                          <a href={`https://wa.me/${l.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-primary">
                            <Phone className="w-3 h-3" />{l.phone}
                          </a>
                        )}
                        {Object.entries(l.answers || {}).map(([q, a]) => (
                          <div key={q}><div className="text-muted-foreground">{q}</div><div>{a}</div></div>
                        ))}
                      </div>
                    )}
                    <select value={l.status || "novo"} onClick={(e) => e.stopPropagation()} onChange={(e) => move(l, e.target.value)}
                      className="w-full text-xs rounded-lg border bg-background px-2 py-1">
                      {COLS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                    </select>
                  </Card>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
