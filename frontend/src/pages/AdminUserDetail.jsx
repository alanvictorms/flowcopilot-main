import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Save, LogIn, Loader2, Coins } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export default function AdminUserDetail() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [edit, setEdit] = useState({ name: "", email: "", new_password: "", credit_adjustment: 0, credit_reason: "" });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get(`/admin/users/${userId}`);
      setData(data);
      setEdit((e) => ({ ...e, name: data.user?.name || "", email: data.user?.email || "" }));
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };
  useEffect(() => { load(); }, [userId]);

  const save = async () => {
    setSaving(true);
    try {
      const body = { name: edit.name, email: edit.email };
      if (edit.new_password) body.new_password = edit.new_password;
      if (edit.credit_adjustment) { body.credit_adjustment = Number(edit.credit_adjustment); body.credit_reason = edit.credit_reason || "Ajuste admin"; }
      await api.patch(`/admin/users/${userId}`, body);
      toast.success("Usuário atualizado.");
      setEdit((e) => ({ ...e, new_password: "", credit_adjustment: 0, credit_reason: "" }));
      load();
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
    finally { setSaving(false); }
  };

  const loginAs = async () => {
    try {
      const { data } = await api.post(`/admin/users/${userId}/login-as`);
      window.open(`${window.location.origin}/login-as?token=${data.access_token}`, "_blank");
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };

  if (!data) return <div className="text-sm text-muted-foreground">Carregando…</div>;
  const s = data.stats || {};

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="rounded-full" onClick={() => navigate("/app/admin/users")}><ArrowLeft className="w-4 h-4" /></Button>
        <div className="flex-1">
          <div className="text-lg font-semibold">{data.user?.name}</div>
          <div className="text-xs text-muted-foreground">{data.user?.email}</div>
        </div>
        <Button variant="outline" size="sm" className="rounded-full" onClick={loginAs}><LogIn className="w-3.5 h-3.5 mr-1" /> Entrar como</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          ["Saldo", (s.credit_balance ?? 0).toLocaleString("pt-BR")],
          ["Plano", s.plan_name || "—"],
          ["Campanhas", s.action_plans ?? 0],
          ["Meta", s.meta_connected ? "Conectado" : "Não"],
        ].map(([k, v]) => (
          <Card key={k} className="p-4 rounded-2xl">
            <div className="text-[10px] font-mono uppercase text-muted-foreground">{k}</div>
            <div className="text-lg font-semibold mt-1">{v}</div>
          </Card>
        ))}
      </div>

      <Card className="p-5 rounded-2xl space-y-3">
        <div className="text-sm font-semibold">Editar</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Nome</Label><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Email</Label><Input value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Nova senha (opcional)</Label><Input type="password" value={edit.new_password} onChange={(e) => setEdit({ ...edit, new_password: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Ajuste de créditos (+/-)</Label><Input type="number" value={edit.credit_adjustment} onChange={(e) => setEdit({ ...edit, credit_adjustment: e.target.value })} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Motivo do ajuste</Label><Input value={edit.credit_reason} onChange={(e) => setEdit({ ...edit, credit_reason: e.target.value })} /></div>
        </div>
        <Button onClick={save} disabled={saving} className="rounded-full">
          {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />} Salvar
        </Button>
      </Card>

      <Card className="p-5 rounded-2xl">
        <div className="text-sm font-semibold mb-2">Transações recentes</div>
        {(data.recent_transactions || []).length === 0 ? (
          <div className="text-xs text-muted-foreground">Sem transações.</div>
        ) : (
          <ul className="space-y-1 text-xs">
            {data.recent_transactions.map((t, i) => (
              <li key={i} className="flex justify-between border-b border-border/40 py-1">
                <span className="text-muted-foreground">{t.description || t.type}</span>
                <span className={`font-mono ${t.amount >= 0 ? "text-green-600" : "text-red-600"}`}>{t.amount >= 0 ? "+" : ""}{t.amount}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
