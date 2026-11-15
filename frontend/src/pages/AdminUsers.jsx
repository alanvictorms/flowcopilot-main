import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Users, Search, RefreshCw, Plus, LogIn, Power, Loader2, Coins } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

export default function AdminUsers() {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState({});

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/users");
      setUsers(data || []);
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const filtered = users.filter((u) =>
    !q || `${u.name} ${u.email}`.toLowerCase().includes(q.toLowerCase()));

  const create = async () => {
    if (!form.name || !form.email || !form.password) return toast.error("Preencha tudo.");
    setSaving(true);
    try {
      await api.post("/admin/users", form);
      toast.success("Usuário criado.");
      setOpen(false); setForm({ name: "", email: "", password: "" }); load();
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
    finally { setSaving(false); }
  };

  const toggleActive = async (u) => {
    setBusy((b) => ({ ...b, [u.id]: true }));
    try {
      await api.post(`/admin/users/${u.id}/toggle-active`, { disabled: !u.disabled });
      load();
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
    finally { setBusy((b) => ({ ...b, [u.id]: false })); }
  };

  const loginAs = async (u) => {
    try {
      const { data } = await api.post(`/admin/users/${u.id}/login-as`);
      window.open(`${window.location.origin}/login-as?token=${data.access_token}`, "_blank");
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[220px] relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar usuário…" className="pl-9 rounded-full" />
        </div>
        <Button variant="outline" size="icon" className="rounded-full" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
        <Button className="rounded-full" onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-1" /> Novo usuário</Button>
      </div>

      {loading ? (
        <Card className="p-10 rounded-2xl text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></Card>
      ) : filtered.length === 0 ? (
        <Card className="p-10 rounded-2xl text-center text-sm text-muted-foreground">Nenhum usuário.</Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((u) => (
            <Card key={u.id} className="p-4 rounded-2xl flex flex-wrap items-center gap-3" data-testid={`admin-user-${u.id}`}>
              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => navigate(`/app/admin/users/${u.id}`)}>
                <div className="text-sm font-semibold truncate flex items-center gap-2">
                  {u.name}
                  {u.disabled && <Badge variant="outline" className="text-[10px] text-destructive border-destructive/40">desativado</Badge>}
                  {u.meta_connected && <Badge variant="outline" className="text-[10px]">Meta</Badge>}
                </div>
                <div className="text-[11px] text-muted-foreground truncate">{u.email}</div>
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Coins className="w-3.5 h-3.5 text-primary" /> {(u.credit_balance ?? 0).toLocaleString("pt-BR")}
              </div>
              {u.plan_name && <Badge className="rounded-full text-[10px]">{u.plan_name}</Badge>}
              <div className="flex gap-1">
                <Button size="sm" variant="outline" className="rounded-full" onClick={() => loginAs(u)}>
                  <LogIn className="w-3.5 h-3.5 mr-1" /> Entrar como
                </Button>
                <Button size="sm" variant="ghost" onClick={() => toggleActive(u)} disabled={busy[u.id]} title={u.disabled ? "Ativar" : "Desativar"}>
                  <Power className={`w-3.5 h-3.5 ${u.disabled ? "text-green-500" : "text-destructive"}`} />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo usuário</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Senha</Label><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={create} disabled={saving}>{saving ? "Salvando…" : "Criar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
