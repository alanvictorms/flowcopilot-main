import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Coins, RefreshCw, Loader2, Plus } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const TX_LABELS = {
  welcome_bonus: "Bônus de boas-vindas", recharge: "Recarga", plan_activation: "Ativação de plano",
  usage: "Uso de recurso", admin_adjustment: "Ajuste do admin", referral_commission: "Comissão de indicação",
};

export default function WalletPage() {
  const [balance, setBalance] = useState(null);
  const [txs, setTxs] = useState([]);
  const [cfg, setCfg] = useState({ credit_value_brl: 0.10, min_recharge_credits: 10 });
  const [amount, setAmount] = useState(50);
  const [loading, setLoading] = useState(true);
  const [recharging, setRecharging] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [b, t, c] = await Promise.all([
        api.get("/wallet/balance"),
        api.get("/wallet/transactions").catch(() => ({ data: [] })),
        api.get("/payments/credit-config").catch(() => ({ data: cfg })),
      ]);
      setBalance(b.data?.balance ?? 0); setTxs(t.data || []); if (c.data) setCfg(c.data);
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const credits = cfg.credit_value_brl ? Math.floor(Number(amount) / Number(cfg.credit_value_brl)) : 0;

  const recharge = async () => {
    setRecharging(true);
    try {
      const { data } = await api.post("/payments/recharge", { amount_brl: Number(amount) });
      if (data?.pix_payload || data?.payment_id) toast.success("Cobrança PIX criada.");
      else toast.info("Recarga indisponível neste ambiente — configure o gateway.");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Recarga indisponível — configure o gateway de pagamento.");
    } finally { setRecharging(false); }
  };

  return (
    <div className="space-y-5 max-w-2xl">
      <Card className="p-6 rounded-2xl bg-gradient-to-br from-primary/10 to-transparent">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-primary/15 flex items-center justify-center"><Coins className="w-6 h-6 text-primary" /></div>
          <div className="flex-1">
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Saldo de créditos</div>
            <div className="text-3xl font-bold tabular-nums">{balance != null ? balance.toLocaleString("pt-BR") : "—"}</div>
          </div>
          <Button variant="outline" size="icon" className="rounded-full" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </Card>

      <Card className="p-5 rounded-2xl space-y-3">
        <div className="text-sm font-semibold">Recarregar</div>
        <div className="flex items-end gap-3">
          <div className="flex-1 space-y-1.5">
            <Label>Valor (R$)</Label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <div className="text-[11px] text-muted-foreground">≈ {credits.toLocaleString("pt-BR")} créditos (R$ {Number(cfg.credit_value_brl).toFixed(2)}/crédito)</div>
          </div>
          <Button onClick={recharge} disabled={recharging} className="rounded-full">
            {recharging ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />} Recarregar
          </Button>
        </div>
      </Card>

      <Card className="p-5 rounded-2xl">
        <div className="text-sm font-semibold mb-2">Extrato</div>
        {txs.length === 0 ? (
          <div className="text-xs text-muted-foreground">Sem movimentações.</div>
        ) : (
          <ul className="divide-y divide-border/50">
            {txs.map((t, i) => (
              <li key={i} className="py-2 flex items-center gap-2 text-sm">
                <span className="flex-1 truncate">{TX_LABELS[t.type] || t.description || t.type}</span>
                <span className="text-[10px] font-mono text-muted-foreground">{t.created_at ? new Date(t.created_at).toLocaleDateString("pt-BR") : ""}</span>
                <span className={`font-mono tabular-nums ${t.amount >= 0 ? "text-green-600" : "text-red-600"}`}>{t.amount >= 0 ? "+" : ""}{t.amount}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
