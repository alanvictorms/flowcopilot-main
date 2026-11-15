import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Briefcase, Plus, Trash2, Pencil, Loader2, Save, Target } from "lucide-react";

import api, { formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

const EMPTY_PRODUCT = {
  name: "", kind: "product", price: 0, cost: 0, taxes_pct: 0, commission_pct: 0,
  avg_ticket: 0, ltv: 0, refund_rate_pct: 0, max_cac: 0, max_cpl: 0,
  stock: null, daily_capacity: null, regions: [], campaign_ids: [], notes: "",
};

const KIND_LABELS = { product: "Produto", service: "Serviço", offer: "Oferta" };

export default function Business() {
  const [products, setProducts] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(EMPTY_PRODUCT);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [p, pr] = await Promise.all([
        api.get("/business/products"),
        api.get("/business/profile"),
      ]);
      setProducts(p.data || []);
      setProfile(pr.data || {});
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const num = (v) => (v === "" || v === null || v === undefined ? 0 : Number(v));

  const saveProduct = async () => {
    setSaving(true);
    try {
      const payload = {
        ...draft,
        price: num(draft.price), cost: num(draft.cost),
        taxes_pct: num(draft.taxes_pct), commission_pct: num(draft.commission_pct),
        avg_ticket: num(draft.avg_ticket), ltv: num(draft.ltv),
        refund_rate_pct: num(draft.refund_rate_pct),
        max_cac: num(draft.max_cac), max_cpl: num(draft.max_cpl),
        stock: draft.stock === "" || draft.stock === null ? null : Number(draft.stock),
        daily_capacity: draft.daily_capacity === "" || draft.daily_capacity === null ? null : Number(draft.daily_capacity),
        campaign_ids: typeof draft.campaign_ids === "string"
          ? draft.campaign_ids.split(",").map((t) => t.trim()).filter(Boolean)
          : draft.campaign_ids,
        regions: typeof draft.regions === "string"
          ? draft.regions.split(",").map((t) => t.trim()).filter(Boolean)
          : draft.regions,
      };
      if (editingId) {
        await api.patch(`/business/products/${editingId}`, payload);
        toast.success("Produto atualizado.");
      } else {
        await api.post("/business/products", payload);
        toast.success("Produto cadastrado.");
      }
      setOpen(false);
      setDraft(EMPTY_PRODUCT);
      setEditingId(null);
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setSaving(false);
    }
  };

  const editProduct = (p) => {
    setDraft({ ...p, campaign_ids: (p.campaign_ids || []).join(", "), regions: (p.regions || []).join(", ") });
    setEditingId(p.id);
    setOpen(true);
  };

  const delProduct = async (id) => {
    if (!window.confirm("Excluir este produto?")) return;
    await api.delete(`/business/products/${id}`);
    load();
  };

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      await api.put("/business/profile", {
        ...profile,
        revenue_goal_month: num(profile.revenue_goal_month),
        profit_goal_month: num(profile.profit_goal_month),
      });
      toast.success("Perfil do negócio salvo. A IA usará esse contexto nas decisões.");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setSavingProfile(false);
    }
  };

  if (loading || !profile) return <div className="text-sm text-muted-foreground">Carregando…</div>;

  return (
    <div className="space-y-6" data-testid="business-page">
      <Card className="p-6 rounded-2xl">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Briefcase className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <div className="text-lg font-semibold">Business Intelligence Core</div>
            <div className="text-sm text-muted-foreground mt-1">
              Produtos, margens, CAC máximo e metas. É daqui que o Profit Autopilot calcula lucro real
              e a IA entende o seu negócio antes de decidir.
            </div>
          </div>
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setDraft(EMPTY_PRODUCT); setEditingId(null); } }}>
            <Button className="rounded-full" onClick={() => setOpen(true)} data-testid="business-add-btn">
              <Plus className="w-4 h-4 mr-1" /> Produto
            </Button>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{editingId ? "Editar produto" : "Novo produto / oferta"}</DialogTitle></DialogHeader>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Nome *</Label>
                  <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} data-testid="business-product-name" />
                </div>
                <div className="space-y-1.5">
                  <Label>Tipo</Label>
                  <Select value={draft.kind} onValueChange={(v) => setDraft({ ...draft, kind: v })}>
                    <SelectTrigger className="rounded-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(KIND_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Preço de venda (R$)</Label>
                  <Input type="number" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Custo (R$)</Label>
                  <Input type="number" value={draft.cost} onChange={(e) => setDraft({ ...draft, cost: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Impostos (%)</Label>
                  <Input type="number" value={draft.taxes_pct} onChange={(e) => setDraft({ ...draft, taxes_pct: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Comissão (%)</Label>
                  <Input type="number" value={draft.commission_pct} onChange={(e) => setDraft({ ...draft, commission_pct: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>LTV (R$)</Label>
                  <Input type="number" value={draft.ltv} onChange={(e) => setDraft({ ...draft, ltv: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>CAC máximo (R$)</Label>
                  <Input type="number" value={draft.max_cac} onChange={(e) => setDraft({ ...draft, max_cac: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>CPL máximo (R$)</Label>
                  <Input type="number" value={draft.max_cpl} onChange={(e) => setDraft({ ...draft, max_cpl: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Estoque (vazio = não controla)</Label>
                  <Input type="number" value={draft.stock ?? ""} onChange={(e) => setDraft({ ...draft, stock: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Capacidade diária (atendimentos)</Label>
                  <Input type="number" value={draft.daily_capacity ?? ""} onChange={(e) => setDraft({ ...draft, daily_capacity: e.target.value })} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>IDs de campanhas vinculadas (separados por vírgula)</Label>
                  <Input value={draft.campaign_ids} onChange={(e) => setDraft({ ...draft, campaign_ids: e.target.value })}
                    placeholder="ex: 1203984..., 1203985..." data-testid="business-campaign-ids" />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Observações</Label>
                  <Textarea rows={2} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button className="rounded-full" onClick={saveProduct} disabled={saving || !draft.name} data-testid="business-save-product">
                  {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                  Salvar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </Card>

      {products.length === 0 ? (
        <Card className="p-10 rounded-2xl text-center text-sm text-muted-foreground">
          Nenhum produto cadastrado. Sem margem e CAC máximo, o sistema otimiza só por ROAS —
          cadastre para otimizar por lucro real.
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((p) => (
            <Card key={p.id} className="p-5 rounded-2xl" data-testid={`business-product-${p.id}`}>
              <div className="flex items-start justify-between mb-2">
                <Badge className="rounded-full border-0 bg-primary/10 text-primary">{KIND_LABELS[p.kind] || p.kind}</Badge>
                <div className="flex gap-1">
                  <button onClick={() => editProduct(p)} className="text-muted-foreground hover:text-foreground p-1"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => delProduct(p.id)} className="text-muted-foreground hover:text-destructive p-1"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              <div className="text-sm font-semibold">{p.name}</div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-muted-foreground">Preço</span><div className="font-mono">R$ {Number(p.price).toLocaleString("pt-BR")}</div></div>
                <div><span className="text-muted-foreground">Lucro/un.</span><div className="font-mono">R$ {Number(p.unit_profit).toLocaleString("pt-BR")}</div></div>
                <div><span className="text-muted-foreground">Margem</span><div className="font-mono">{p.margin_pct}%</div></div>
                <div><span className="text-muted-foreground">CAC máx</span><div className="font-mono">{p.max_cac ? `R$ ${Number(p.max_cac).toLocaleString("pt-BR")}` : "—"}</div></div>
              </div>
              {(p.campaign_ids || []).length > 0 && (
                <div className="mt-3 text-[10px] text-muted-foreground">
                  {p.campaign_ids.length} campanha(s) vinculada(s)
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Card className="p-6 rounded-2xl">
        <div className="flex items-center gap-3 mb-4">
          <Target className="w-5 h-5 text-primary" />
          <div className="text-lg font-semibold">Perfil e metas do negócio</div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Nome da empresa</Label>
            <Input value={profile.company_name || ""} onChange={(e) => setProfile({ ...profile, company_name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Segmento</Label>
            <Input value={profile.segment || ""} onChange={(e) => setProfile({ ...profile, segment: e.target.value })} placeholder="ex: clínica odontológica, e-commerce de moda" />
          </div>
          <div className="space-y-1.5">
            <Label>Meta de faturamento mensal (R$)</Label>
            <Input type="number" value={profile.revenue_goal_month || 0} onChange={(e) => setProfile({ ...profile, revenue_goal_month: e.target.value })} data-testid="business-revenue-goal" />
          </div>
          <div className="space-y-1.5">
            <Label>Meta de lucro mensal (R$)</Label>
            <Input type="number" value={profile.profit_goal_month || 0} onChange={(e) => setProfile({ ...profile, profit_goal_month: e.target.value })} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Diferenciais da marca</Label>
            <Textarea rows={2} value={profile.differentials || ""} onChange={(e) => setProfile({ ...profile, differentials: e.target.value })} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Personas / público-alvo</Label>
            <Textarea rows={2} value={profile.personas || ""} onChange={(e) => setProfile({ ...profile, personas: e.target.value })} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Principais objeções dos clientes</Label>
            <Textarea rows={2} value={profile.common_objections || ""} onChange={(e) => setProfile({ ...profile, common_objections: e.target.value })} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Restrições de comunicação</Label>
            <Textarea rows={2} value={profile.communication_restrictions || ""} onChange={(e) => setProfile({ ...profile, communication_restrictions: e.target.value })}
              placeholder="ex: não prometer resultados garantidos, não citar concorrentes" />
          </div>
        </div>
        <div className="flex justify-end mt-4">
          <Button className="rounded-full" onClick={saveProfile} disabled={savingProfile} data-testid="business-save-profile">
            {savingProfile ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
            Salvar perfil
          </Button>
        </div>
      </Card>
    </div>
  );
}
