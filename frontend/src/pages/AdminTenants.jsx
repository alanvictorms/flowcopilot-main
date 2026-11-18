import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Building2, Plus, Loader2, Trash2, Pencil } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const EMPTY = { name: "", domain: "", color: "#2563eb", logo: "", owner_email: "", license_fee: 15000, price_per_account: 490 };
const brl = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function readLogo(file, cb) {
  if (!file) return;
  if (file.size > 300_000) { toast.error("Logo maior que 300 KB"); return; }
  const r = new FileReader();
  r.onload = () => cb(r.result);
  r.readAsDataURL(file);
}

export default function AdminTenants() {
  const [items, setItems] = useState(null);
  const [form, setForm] = useState(null); // null = fechado; {id?} = editando
  const [saving, setSaving] = useState(false);

  const load = () => api.get("/admin/tenants").then(({ data }) => setItems(data))
    .catch((e) => toast.error(formatApiError(e.response?.data?.detail)));
  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      const body = { ...form, owner_email: form.owner_email || null };
      if (form.id) await api.patch(`/admin/tenants/${form.id}`, body);
      else await api.post("/admin/tenants", body);
      toast.success("Agência salva");
      setForm(null); load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    finally { setSaving(false); }
  };
  const remove = async (t) => {
    if (!window.confirm(`Excluir a agência ${t.name}? As contas voltam para a marca padrão.`)) return;
    await api.delete(`/admin/tenants/${t.id}`).catch((e) => toast.error(formatApiError(e.response?.data?.detail)));
    load();
  };
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const total = (items || []).reduce((s, t) => s + t.monthly, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Building2 className="w-5 h-5 text-primary" />
        <div className="flex-1">
          <div className="text-sm font-semibold">Agências (white label)</div>
          <div className="text-xs text-muted-foreground">Recorrente estimado: {brl(total)}/mês</div>
        </div>
        <Button size="sm" className="rounded-full" onClick={() => setForm({ ...EMPTY })}><Plus className="w-4 h-4 mr-1" /> Nova agência</Button>
      </div>

      {form && (
        <Card className="p-5 rounded-2xl space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Nome da marca</Label><Input value={form.name} onChange={(e) => set({ name: e.target.value })} /></div>
            <div className="space-y-1"><Label>Domínio (ex.: app.agencia.com.br)</Label><Input value={form.domain} onChange={(e) => set({ domain: e.target.value })} /></div>
            <div className="space-y-1"><Label>E-mail do dono (já cadastrado)</Label><Input value={form.owner_email || ""} onChange={(e) => set({ owner_email: e.target.value })} /></div>
            <div className="space-y-1">
              <Label>Cor principal</Label>
              <div className="flex gap-2"><input type="color" value={form.color || "#2563eb"} onChange={(e) => set({ color: e.target.value })} className="h-9 w-12 rounded border" /><Input value={form.color} onChange={(e) => set({ color: e.target.value })} /></div>
            </div>
            <div className="space-y-1"><Label>Licença (R$)</Label><Input type="number" value={form.license_fee} onChange={(e) => set({ license_fee: Number(e.target.value) })} /></div>
            <div className="space-y-1"><Label>Preço por conta/mês (R$)</Label><Input type="number" value={form.price_per_account} onChange={(e) => set({ price_per_account: Number(e.target.value) })} /></div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Logo (PNG/SVG, até 300 KB)</Label>
              <div className="flex items-center gap-3">
                {form.logo && <img src={form.logo} alt="" className="w-10 h-10 object-contain rounded" />}
                <input type="file" accept="image/*" onChange={(e) => readLogo(e.target.files?.[0], (logo) => set({ logo }))} className="text-xs" />
              </div>
            </div>
          </div>
          <div className="text-[11px] text-muted-foreground">
            Para o domínio funcionar: aponte o DNS (CNAME) do domínio para o servidor e adicione o domínio no EasyPanel (serviço flowpilot → frontend, porta 80).
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="rounded-full" onClick={save} disabled={saving || !form.name}>{saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />} Salvar</Button>
            <Button size="sm" variant="ghost" className="rounded-full" onClick={() => setForm(null)}>Cancelar</Button>
          </div>
        </Card>
      )}

      {!items ? <Loader2 className="w-5 h-5 animate-spin" /> : items.length === 0 ? (
        <Card className="p-10 rounded-2xl text-center text-sm text-muted-foreground">Nenhuma agência cadastrada.</Card>
      ) : (
        <div className="space-y-2">
          {items.map((t) => (
            <Card key={t.id} className="p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="w-3 h-10 rounded-full shrink-0" style={{ background: t.color || "#888" }} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold">{t.name}</div>
                <div className="text-xs text-muted-foreground truncate">{t.domain || "sem domínio"} · dono: {t.owner_email || "—"}</div>
              </div>
              <div className="text-xs text-right">
                <div>{t.accounts} conta(s) × {brl(t.price_per_account)}</div>
                <div className="font-semibold">{brl(t.monthly)}/mês</div>
              </div>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" className="rounded-full" onClick={() => setForm({ ...EMPTY, ...t, logo: "" })}><Pencil className="w-4 h-4" /></Button>
                <Button size="icon" variant="ghost" className="rounded-full" onClick={() => remove(t)}><Trash2 className="w-4 h-4" /></Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
