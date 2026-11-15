import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Settings2, Save, Loader2 } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function AdminPayments() {
  const [cfg, setCfg] = useState({ credit_value_brl: 0.10, min_recharge_credits: 10 });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try { const { data } = await api.get("/admin/credit-config"); setCfg(data); }
    catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.post("/admin/credit-config", {
        credit_value_brl: Number(cfg.credit_value_brl),
        min_recharge_credits: Number(cfg.min_recharge_credits),
      });
      toast.success("Configuração salva.");
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4 max-w-xl">
      <Card className="p-6 rounded-2xl space-y-4">
        <div className="flex items-center gap-2">
          <Settings2 className="w-5 h-5 text-primary" />
          <div>
            <div className="text-sm font-semibold">Configuração de créditos</div>
            <div className="text-xs text-muted-foreground">Valor do crédito e recarga mínima.</div>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Valor do crédito (R$)</Label>
          <Input type="number" step="0.01" value={cfg.credit_value_brl} onChange={(e) => setCfg({ ...cfg, credit_value_brl: e.target.value })} />
          <div className="text-[11px] text-muted-foreground">Quanto custa 1 crédito em reais.</div>
        </div>
        <div className="space-y-1.5">
          <Label>Recarga mínima (créditos)</Label>
          <Input type="number" value={cfg.min_recharge_credits} onChange={(e) => setCfg({ ...cfg, min_recharge_credits: e.target.value })} />
        </div>
        <Button onClick={save} disabled={saving} className="rounded-full">
          {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />} Salvar
        </Button>
      </Card>
    </div>
  );
}
