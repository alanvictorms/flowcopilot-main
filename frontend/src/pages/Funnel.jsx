import { useState } from "react";
import { toast } from "sonner";
import { Stethoscope, Loader2 } from "lucide-react";

import api, { formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

const emptyFunnel = {
  impressions: 0, clicks: 0, landing_page_views: 0,
  leads: 0, qualified_leads: 0, sales: 0,
  revenue: 0, spend: 0, notes: "",
};

export default function Funnel() {
  const [form, setForm] = useState(emptyFunnel);
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    try {
      const numeric = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, k === "notes" ? v : Number(v)]));
      const { data } = await api.post("/funnel/diagnose", numeric);
      setResult(data);
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
    finally { setRunning(false); }
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="space-y-6" data-testid="funnel-page">
      <Card className="p-6 rounded-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center"><Stethoscope className="w-5 h-5 text-primary" /></div>
          <div>
            <div className="text-lg font-semibold">Funnel Doctor</div>
            <div className="text-xs text-muted-foreground">Preencha os números do seu funil e a IA aponta onde consertar.</div>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="space-y-1.5"><Label>Impressões</Label><Input type="number" value={form.impressions} onChange={set("impressions")} data-testid="funnel-impressions" /></div>
          <div className="space-y-1.5"><Label>Cliques</Label><Input type="number" value={form.clicks} onChange={set("clicks")} data-testid="funnel-clicks" /></div>
          <div className="space-y-1.5"><Label>LP Views</Label><Input type="number" value={form.landing_page_views} onChange={set("landing_page_views")} /></div>
          <div className="space-y-1.5"><Label>Leads</Label><Input type="number" value={form.leads} onChange={set("leads")} data-testid="funnel-leads" /></div>
          <div className="space-y-1.5"><Label>Leads Qualificados</Label><Input type="number" value={form.qualified_leads} onChange={set("qualified_leads")} /></div>
          <div className="space-y-1.5"><Label>Vendas</Label><Input type="number" value={form.sales} onChange={set("sales")} data-testid="funnel-sales" /></div>
          <div className="space-y-1.5"><Label>Receita</Label><Input type="number" value={form.revenue} onChange={set("revenue")} /></div>
          <div className="space-y-1.5"><Label>Investimento</Label><Input type="number" value={form.spend} onChange={set("spend")} /></div>
          <div className="space-y-1.5 col-span-2 md:col-span-4">
            <Label>Notas</Label>
            <Textarea rows={2} value={form.notes} onChange={set("notes")} placeholder="Ex: LP nova rodou nos últimos 15 dias, atendimento demora 3h" />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={run} disabled={running} className="rounded-full" data-testid="funnel-diagnose-btn">
            {running ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Stethoscope className="w-4 h-4 mr-1" />}
            Diagnosticar
          </Button>
        </div>
      </Card>

      {result && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {Object.entries(result.stages || {}).filter(([_, v]) => v !== null).map(([k, v]) => (
              <Card key={k} className="p-4 rounded-2xl">
                <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">
                  {k.replace(/_/g, " → ")}
                </div>
                <div className="text-2xl font-semibold tracking-tighter">{v}%</div>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(result.unit_economics || {}).map(([k, v]) => (
              <Card key={k} className="p-4 rounded-2xl">
                <div className="text-xs text-muted-foreground uppercase">{k}</div>
                <div className="text-2xl font-semibold tracking-tighter">{v}</div>
              </Card>
            ))}
          </div>

          {result.diagnosis && (
            <Card className="p-6 rounded-2xl">
              <div className="flex items-center gap-2 mb-3">
                <Badge className="rounded-full bg-primary/10 text-primary border border-primary/30">
                  Estágio fraco: {result.diagnosis.weakest_stage}
                </Badge>
              </div>
              <div className="text-sm mb-4">{result.diagnosis.diagnosis}</div>

              {result.diagnosis.likely_causes?.length > 0 && (
                <div className="mb-4">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">Causas prováveis</div>
                  <ul className="text-sm space-y-1">
                    {result.diagnosis.likely_causes.map((c, i) => <li key={i}>• {c}</li>)}
                  </ul>
                </div>
              )}

              {result.diagnosis.fixes?.length > 0 && (
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">Correções recomendadas</div>
                  <div className="space-y-2">
                    {result.diagnosis.fixes.map((f, i) => (
                      <div key={i} className="p-3 rounded-xl border border-border">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="rounded-full text-[10px] font-mono">P{f.priority}</Badge>
                          <div className="text-sm font-semibold">{f.action}</div>
                        </div>
                        <div className="text-xs text-muted-foreground">{f.why}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
