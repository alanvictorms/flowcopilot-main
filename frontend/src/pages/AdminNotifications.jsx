import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bell, Send, Loader2 } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function AdminNotifications() {
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState([]);
  const [form, setForm] = useState({ title: "", message: "", urgency: "medium" });
  const [sending, setSending] = useState(false);

  useEffect(() => {
    api.get("/admin/users").then(({ data }) => setUsers(data || [])).catch(() => {});
  }, []);

  const allIds = users.map((u) => u.id);
  const toggleAll = () => setSelected(selected.length === allIds.length ? [] : allIds);
  const toggle = (id) => setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);

  const send = async () => {
    if (!form.title || !form.message) return toast.error("Preencha título e mensagem.");
    if (selected.length === 0) return toast.error("Selecione ao menos 1 usuário.");
    setSending(true);
    try {
      const { data } = await api.post("/admin/notifications/send", { user_ids: selected, ...form });
      toast.success(`Enviado para ${data.sent} usuário(s).`);
      setForm({ title: "", message: "", urgency: "medium" }); setSelected([]);
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
    finally { setSending(false); }
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <Card className="p-5 rounded-2xl space-y-3">
        <div className="flex items-center gap-2"><Bell className="w-5 h-5 text-primary" /><div className="text-sm font-semibold">Enviar notificação</div></div>
        <div className="space-y-1.5"><Label>Título</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Mensagem</Label><textarea className="w-full border rounded-lg p-2 text-sm bg-background" rows={3} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Urgência</Label>
          <Select value={form.urgency} onValueChange={(v) => setForm({ ...form, urgency: v })}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Baixa</SelectItem>
              <SelectItem value="medium">Média</SelectItem>
              <SelectItem value="high">Alta</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={send} disabled={sending} className="rounded-full">
          {sending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />} Enviar ({selected.length})
        </Button>
      </Card>

      <Card className="p-5 rounded-2xl">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold">Destinatários</div>
          <Button size="sm" variant="outline" className="rounded-full" onClick={toggleAll}>
            {selected.length === allIds.length ? "Limpar" : "Selecionar todos"}
          </Button>
        </div>
        <div className="space-y-1 max-h-72 overflow-y-auto">
          {users.map((u) => (
            <label key={u.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-accent cursor-pointer text-sm">
              <input type="checkbox" checked={selected.includes(u.id)} onChange={() => toggle(u.id)} />
              <span className="flex-1 truncate">{u.name} <span className="text-muted-foreground text-xs">· {u.email}</span></span>
            </label>
          ))}
          {users.length === 0 && <div className="text-xs text-muted-foreground p-2">Nenhum usuário.</div>}
        </div>
      </Card>
    </div>
  );
}
