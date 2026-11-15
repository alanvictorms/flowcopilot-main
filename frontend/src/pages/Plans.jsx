import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CreditCard, Check, Loader2, Sparkles } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function Plans() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mySub, setMySub] = useState(null);
  const [paying, setPaying] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [{ data: p }, { data: s }] = await Promise.all([
          api.get("/plans/"),
          api.get("/plans/my-subscription").catch(() => ({ data: null })),
        ]);
        setPlans(p || []); setMySub(s);
      } catch {} finally { setLoading(false); }
    })();
  }, []);

  const subscribe = async (plan) => {
    setPaying(plan.id);
    try {
      const { data } = await api.post("/payments/charge", { plan_id: plan.id });
      if (data?.pix_payload || data?.payment_id) toast.success("Cobrança criada. Siga as instruções de pagamento.");
      else toast.info("Checkout indisponível neste ambiente — configure o gateway de pagamento.");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Checkout indisponível — configure o gateway de pagamento.");
    } finally { setPaying(null); }
  };

  return (
    <div className="space-y-6" data-testid="plans-page">
      <div className="text-center space-y-2">
        <h2 className="text-xl font-bold">Escolha seu plano</h2>
        <p className="text-sm text-muted-foreground">{mySub ? `Plano atual: ${mySub.plan?.name || "—"}` : "Você ainda não tem um plano ativo."}</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">{[1, 2, 3].map((i) => <div key={i} className="h-64 bg-muted/40 rounded-2xl animate-pulse" />)}</div>
      ) : plans.length === 0 ? (
        <Card className="p-10 text-center rounded-2xl"><CreditCard className="w-10 h-10 text-muted-foreground mx-auto mb-3" /><div className="text-sm text-muted-foreground">Nenhum plano disponível.</div></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {plans.map((plan) => {
            const isCurrent = mySub?.plan_id === plan.id;
            return (
              <Card key={plan.id} className={`rounded-2xl overflow-hidden flex flex-col ${plan.highlight ? "border-primary border-2 relative" : ""}`}>
                {plan.highlight && <div className="absolute top-0 left-0 right-0 bg-primary text-primary-foreground text-[10px] text-center py-1 font-semibold uppercase tracking-wider"><Sparkles className="w-3 h-3 inline mr-1 -mt-0.5" /> Mais popular</div>}
                <CardHeader className={`pb-2 ${plan.highlight ? "pt-8" : ""}`}>
                  <div className="text-lg font-bold">{plan.name}</div>
                  <div className="text-xs text-muted-foreground">{plan.description}</div>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col justify-between gap-4">
                  <div>
                    <div className="flex items-baseline gap-1 mb-3">
                      <span className="text-3xl font-extrabold">R$ {Number(plan.price).toFixed(2)}</span>
                      <span className="text-xs text-muted-foreground">/{plan.duration_days || 30} dias</span>
                    </div>
                    <Badge className="rounded-full bg-primary/10 text-primary border-0 mb-3">{(plan.credits || 0).toLocaleString("pt-BR")} créditos</Badge>
                    {plan.features?.length > 0 && (
                      <ul className="space-y-1.5">
                        {plan.features.map((f, i) => <li key={i} className="flex items-center gap-2 text-xs"><Check className="w-3.5 h-3.5 text-green-500 shrink-0" /><span>{f}</span></li>)}
                      </ul>
                    )}
                  </div>
                  <Button onClick={() => subscribe(plan)} disabled={paying === plan.id || isCurrent} className="w-full rounded-full" variant={isCurrent ? "outline" : "default"}>
                    {paying === plan.id ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : isCurrent ? "Plano atual" : <><CreditCard className="w-4 h-4 mr-1" /> Assinar</>}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
