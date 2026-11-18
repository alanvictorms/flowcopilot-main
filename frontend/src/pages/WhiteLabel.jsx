import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Building2, Loader2, Plus, Save } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { applyBrand } from "@/lib/brand";
import { readLogo } from "@/pages/AdminTenants";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const err = (e) => toast.error(formatApiError(e.response?.data?.detail));
const brl = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function WhiteLabel() {
  const [t, setT] = useState(null);
  const [acc, setAcc] = useState(null);
  const [nu, setNu] = useState({ name: "", email: "", password: "" });
  const [busy, setBusy] = useState("");

  const load = () => {
    api.get("/tenant/me").then(({ data }) => setT(data)).catch(err);
    api.get("/tenant/accounts").then(({ data }) => setAcc(data)).catch(err);
  };
  useEffect(() => { load(); }, []);

  const saveBrand = async () => {
    setBusy("brand");
    try {
      await api.put("/tenant/me", { name: t.name, color: t.color || "", logo: t.logo || "" });
      applyBrand({ name: t.name, color: t.color, logo: t.logo || undefined });
      toast.success("Marca atualizada");
    } catch (e) { err(e); } finally { setBusy(""); }
  };
  const addAccount = async () => {
    setBusy("acc");
    try { await api.post("/tenant/accounts", nu); setNu({ name: "", email: "", password: "" }); toast.success("Conta criada"); load(); }
    catch (e) { err(e); } finally { setBusy(""); }
  };

  if (!t) return <Loader2 className="w-5 h-5 animate-spin" />;
  const accounts = acc?.accounts || [];

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center gap-2">
        <Building2 className="w-5 h-5 text-primary" />
        <div className="text-sm font-semibold">Minha agência</div>
      </div>

      <Card className="p-5 rounded-2xl space-y-3">
        <div className="text-sm font-semibold">Marca</div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1"><Label>Nome</Label><Input value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} /></div>
          <div className="space-y-1">
            <Label>Cor principal</Label>
            <div className="flex gap-2"><input type="color" value={t.color || "#2563eb"} onChange={(e) => setT({ ...t, color: e.target.value })} className="h-9 w-12 rounded border" /><Input value={t.color || ""} onChange={(e) => setT({ ...t, color: e.target.value })} /></div>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>Logo (até 300 KB)</Label>
            <div className="flex items-center gap-3">
              {t.logo && <img src={t.logo} alt="" className="w-10 h-10 object-contain rounded" />}
              <input type="file" accept="image/*" onChange={(e) => readLogo(e.target.files?.[0], (logo) => setT({ ...t, logo }))} className="text-xs" />
            </div>
          </div>
        </div>
        <div className="text-xs text-muted-foreground">Domínio: <b>{t.domain || "não configurado (fale com o suporte)"}</b></div>
        <Button size="sm" className="rounded-full" onClick={saveBrand} disabled={busy === "brand"}>
          {busy === "brand" ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />} Salvar marca
        </Button>
      </Card>

      <Card className="p-5 rounded-2xl space-y-3">
        <div className="flex items-center">
          <div className="text-sm font-semibold flex-1">Contas de clientes</div>
          <div className="text-xs text-muted-foreground">{accounts.length} × {brl(acc?.price_per_account)} = <b>{brl(accounts.length * (acc?.price_per_account || 0))}/mês</b></div>
        </div>
        <div className="grid sm:grid-cols-4 gap-2">
          <Input placeholder="Nome" value={nu.name} onChange={(e) => setNu({ ...nu, name: e.target.value })} />
          <Input placeholder="E-mail" value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} />
          <Input placeholder="Senha inicial" type="password" value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} />
          <Button className="rounded-full" onClick={addAccount} disabled={busy === "acc" || !nu.name || !nu.email || nu.password.length < 6}>
            {busy === "acc" ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />} Criar conta
          </Button>
        </div>
        {accounts.length === 0 ? (
          <div className="text-xs text-muted-foreground">Nenhuma conta ainda. Clientes também podem se cadastrar pelo seu domínio.</div>
        ) : (
          <div className="divide-y">
            {accounts.map((a) => (
              <div key={a.id} className="py-2 flex items-center text-sm gap-3">
                <div className="flex-1 min-w-0"><div className="font-medium truncate">{a.name}</div><div className="text-xs text-muted-foreground truncate">{a.email}</div></div>
                <div className="text-xs text-muted-foreground">{a.journeys} campanha(s) · {a.leads} lead(s)</div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
