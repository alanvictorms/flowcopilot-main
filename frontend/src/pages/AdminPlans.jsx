import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CreditCard, Plus, Save, Loader2, Power, Pencil } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const empty = { name: "", description: "", price: 0, credits: 0, duration_days: 30, features: "", highlight: false, order: 0 };

export default function AdminPlans() {
  const [plans, setPlans] = useState([]);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try { const { data } = await api.get("/plans/admin/all"); setPlans(data || []); }
    catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };
  useEffect(() => { load(); }, []);

  const openNew = () => { setForm(empty); setEditId(null); setOpen(true); };
  const openEdit = (p) => {
    setForm({ ...empty, ...p, features: (p.features || []).join("\n") });
    setEditId(p.id); setOpen(true);
  };

  const save = async () => {
    setSaving(true);
    const body = {
      name: form.name, description: form.description, price: Number(form.price),
      credits: Number(form.credits), duration_days: Number(form.duration_days),
      features: String(form.features).split("\n").map((s) => s.trim()).filter(Boolean),
      highlight: !!form.highlight, order: Number(form.order),
    };
    try {
      if (editId) await api.patch(`/plans/admin/${editId}`, body);
      else await api.post("/plans/admin/create", body);
      toast.success("Plano salvo."); setOpen(false); load();
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
    finally { setSaving(false); }
  };

  const toggle = async (p) => {
    try { await api.delete(`/plans/admin/${p.id}`); load(); }
    catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button className="rounded-full" onClick={openNew}><Plus className="w-4 h-4 mr-1" /> Novo plano</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {plans.map((p) => (
          <Card key={p.id} className={`p-5 rounded-2xl ${p.highlight ? "border-primary border-2" : ""} ${!p.active ? "opacity-60" : ""}`}>
            <div className="flex items-start justify-between">
              <div className="text-base font-bold">{p.name}</div>
              {!p.active && <Badge variant="outline" className="text-[10px]">inativo</Badge>}
            </div>
            <div className="text-xs text-muted-foreground">{p.description}</div>
            <div className="text-2xl font-extrabold mt-2">R$ {Number(p.price).toFixed(2)}</div>
            <div className="text-xs text-muted-foreground">{(p.credits || 0).toLocaleString("pt-BR")} créditos · {p.duration_days}d</div>
            <div className="flex gap-1 mt-3">
              <Button size="sm" variant="outline" className="rounded-full" onClick={() => openEdit(p)}><Pencil className="w-3.5 h-3.5 mr-1" /> Editar</Button>
              <Button size="sm" variant="ghost" onClick={() => toggle(p)} title={p.active ? "Desativar" : "Ativar"}><Power className={`w-3.5 h-3.5 ${p.active ? "text-destructive" : "text-green-500"}`} /></Button>
            </div>
          </Card>
        ))}
        {plans.length === 0 && <Card className="p-8 rounded-2xl text-center text-sm text-muted-foreground col-span-full">Nenhum plano.</Card>}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editId ? "Editar plano" : "Novo plano"}</DialogTitle></DialogHeader>
          <div className="space-y-3 max-h-[70vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Ordem</Label><Input type="number" value={form.order} onChange={(e) => setForm({ ...form, order: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Preço (R$)</Label><Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Créditos</Label><Input type="number" value={form.credits} onChange={(e) => setForm({ ...form, credits: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Duração (dias)</Label><Input type="number" value={form.duration_days} onChange={(e) => setForm({ ...form, duration_days: e.target.value })} /></div>
              <div className="space-y-1.5 flex items-end gap-2"><input type="checkbox" checked={form.highlight} onChange={(e) => setForm({ ...form, highlight: e.target.checked })} /><Label>Destaque</Label></div>
            </div>
            <div className="space-y-1.5"><Label>Descrição</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Recursos (um por linha)</Label>
              <textarea className="w-full border rounded-lg p-2 text-sm bg-background" rows={4} value={form.features} onChange={(e) => setForm({ ...form, features: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving || !form.name}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-1" />} Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
