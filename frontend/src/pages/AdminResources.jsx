import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Coins, Pencil, Trash2, Save, Loader2 } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function AdminResources() {
  const [resources, setResources] = useState([]);
  const [form, setForm] = useState({ resource_key: "", name: "", credits_per_use: 1, description: "" });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try { const { data } = await api.get("/plans/admin/resources"); setResources(data || []); } catch {}
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.resource_key || !form.name) { toast.error("Preencha key e nome."); return; }
    setSaving(true);
    try {
      await api.post("/plans/admin/resources", form);
      toast.success("Recurso salvo!");
      setForm({ resource_key: "", name: "", credits_per_use: 1, description: "" });
      load();
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
    finally { setSaving(false); }
  };

  const del = async (key) => {
    try { await api.delete(`/plans/admin/resources/${key}`); load(); } catch {}
  };

  return (
    <div className="space-y-4">
      <Card className="p-5 rounded-2xl space-y-3">
        <div className="text-sm font-semibold">Adicionar / Atualizar Recurso</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="space-y-1"><Label>Chave</Label><Input placeholder="ai_chat" value={form.resource_key} onChange={(e) => setForm({...form, resource_key: e.target.value})} /></div>
          <div className="space-y-1"><Label>Nome</Label><Input placeholder="Chat IA" value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} /></div>
          <div className="space-y-1"><Label>Créditos/uso</Label><Input type="number" value={form.credits_per_use} onChange={(e) => setForm({...form, credits_per_use: parseInt(e.target.value) || 0})} /></div>
          <div className="flex items-end">
            <Button onClick={save} disabled={saving} className="rounded-full w-full">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-1" />} Salvar
            </Button>
          </div>
        </div>
      </Card>

      <div className="space-y-2">
        {resources.map((r) => (
          <Card key={r.resource_key} className="p-4 rounded-2xl flex items-center gap-3">
            <Coins className="w-4 h-4 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold">{r.name}</div>
              <div className="text-[10px] text-muted-foreground font-mono">{r.resource_key}</div>
            </div>
            <Badge className="rounded-full">{r.credits_per_use} créditos</Badge>
            <Button variant="ghost" size="icon" onClick={() => setForm(r)}><Pencil className="w-3 h-3" /></Button>
            <Button variant="ghost" size="icon" onClick={() => del(r.resource_key)}><Trash2 className="w-3 h-3 text-destructive" /></Button>
          </Card>
        ))}
        {resources.length === 0 && <Card className="p-8 rounded-2xl text-center text-sm text-muted-foreground">Nenhum recurso configurado.</Card>}
      </div>
    </div>
  );
}
