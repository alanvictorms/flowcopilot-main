import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, ShieldAlert, ShieldX, Loader2, Sparkles } from "lucide-react";

import api, { formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

const RISK_META = {
  low: { label: "Risco baixo", cls: "bg-green-500/10 text-green-600 dark:text-green-400", icon: ShieldCheck },
  medium: { label: "Risco médio", cls: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400", icon: ShieldAlert },
  high: { label: "Risco alto — publicação bloqueada", cls: "bg-red-500/10 text-red-600 dark:text-red-400", icon: ShieldX },
};

const CATEGORY_LABELS = {
  promessa_exagerada: "Promessa exagerada",
  atributo_pessoal: "Atributo pessoal",
  saude: "Saúde",
  financas: "Finanças",
  antes_depois: "Antes/depois",
};

export default function Policy() {
  const [form, setForm] = useState({
    headline: "", primary_text: "", description: "", cta: "",
    landing_url: "", image_description: "", niche: "", use_ai: true,
  });
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadHistory = async () => {
    try {
      const { data } = await api.get("/policy/reviews");
      setHistory(data || []);
    } catch { /* histórico é opcional */ }
  };

  useEffect(() => { loadHistory(); }, []);

  const review = async () => {
    if (!form.headline && !form.primary_text) {
      toast.error("Informe ao menos o título ou o texto principal do anúncio.");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const { data } = await api.post("/policy/review", form);
      setResult(data);
      loadHistory();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  const riskMeta = result ? (RISK_META[result.risk_level] || RISK_META.low) : null;
  const RiskIcon = riskMeta?.icon;

  return (
    <div className="space-y-6" data-testid="policy-page">
      <Card className="p-6 rounded-2xl">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <div className="text-lg font-semibold">Policy Guardian</div>
            <div className="text-sm text-muted-foreground mt-1">
              Revise anúncios antes de publicar: promessas exageradas, atributos pessoais,
              categorias especiais e consistência com a página. Risco alto bloqueia a publicação.
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6 rounded-2xl space-y-4">
          <div className="text-sm font-semibold">Anúncio para revisar</div>
          <div className="space-y-1.5">
            <Label>Título (headline)</Label>
            <Input value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} data-testid="policy-headline" />
          </div>
          <div className="space-y-1.5">
            <Label>Texto principal</Label>
            <Textarea rows={4} value={form.primary_text} onChange={(e) => setForm({ ...form, primary_text: e.target.value })} data-testid="policy-text" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>CTA</Label>
              <Input value={form.cta} onChange={(e) => setForm({ ...form, cta: e.target.value })} placeholder="ex: SHOP_NOW" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>URL da landing page</Label>
            <Input value={form.landing_url} onChange={(e) => setForm({ ...form, landing_url: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Descrição da imagem/vídeo</Label>
              <Input value={form.image_description} onChange={(e) => setForm({ ...form, image_description: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Nicho</Label>
              <Input value={form.niche} onChange={(e) => setForm({ ...form, niche: e.target.value })} placeholder="ex: estética, finanças" />
            </div>
          </div>
          <label className="flex items-center justify-between p-3 rounded-xl border border-border cursor-pointer">
            <div className="text-sm flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" /> Análise profunda com IA</div>
            <Switch checked={form.use_ai} onCheckedChange={(v) => setForm({ ...form, use_ai: v })} />
          </label>
          <Button className="w-full rounded-full" onClick={review} disabled={loading} data-testid="policy-review-btn">
            {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-1" />}
            Revisar anúncio
          </Button>
        </Card>

        <div className="space-y-4">
          {result && (
            <Card className="p-6 rounded-2xl" data-testid="policy-result">
              <div className="flex items-center gap-3 mb-3">
                <Badge className={`rounded-full border-0 ${riskMeta.cls}`}>
                  <RiskIcon className="w-3.5 h-3.5 mr-1" /> {riskMeta.label}
                </Badge>
                {(result.special_categories || []).filter((c) => c && c !== "nenhuma").map((c) => (
                  <Badge key={c} variant="outline" className="rounded-full text-[10px]">categoria especial: {c}</Badge>
                ))}
              </div>
              <div className="text-sm text-muted-foreground mb-4">{result.summary_pt}</div>

              {(result.findings || []).length > 0 && (
                <div className="space-y-2 mb-4">
                  <div className="text-xs font-semibold">Apontamentos</div>
                  {result.findings.map((f, i) => (
                    <div key={i} className={`p-3 rounded-xl border text-xs ${f.severity === "high" ? "border-red-500/40 bg-red-500/5" : "border-yellow-500/30 bg-yellow-500/5"}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="rounded-full text-[10px]">
                          {CATEGORY_LABELS[f.category] || f.category}
                        </Badge>
                        <span className="text-[10px] font-mono text-muted-foreground">{f.source === "scanner" ? "scanner" : "IA"}</span>
                      </div>
                      {f.excerpt && <div className="font-mono text-[11px] mb-1">"{f.excerpt}"</div>}
                      <div className="text-muted-foreground">{f.why_risky}</div>
                    </div>
                  ))}
                </div>
              )}

              {(result.suggestions || []).length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold">Reescritas sugeridas</div>
                  {result.suggestions.map((s, i) => (
                    <div key={i} className="p-3 rounded-xl bg-muted text-xs">{typeof s === "string" ? s : JSON.stringify(s)}</div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {history.length > 0 && (
            <Card className="p-6 rounded-2xl">
              <div className="text-sm font-semibold mb-3">Revisões anteriores</div>
              <ul className="divide-y divide-border">
                {history.slice(0, 8).map((h) => {
                  const m = RISK_META[h.risk_level] || RISK_META.low;
                  return (
                    <li key={h.id} className="py-2.5 flex items-center gap-3">
                      <Badge className={`rounded-full border-0 text-[10px] ${m.cls}`}>{h.risk_level}</Badge>
                      <div className="flex-1 min-w-0 text-xs truncate">
                        {h.input?.headline || h.input?.primary_text || "—"}
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(h.created_at).toLocaleDateString("pt-BR")}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
