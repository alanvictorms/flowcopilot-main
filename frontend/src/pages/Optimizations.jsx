import { useState } from "react";
import { toast } from "sonner";
import { Wand2, Loader2, ArrowRight, ShieldAlert } from "lucide-react";

import api, { formatApiError } from "@/lib/api";
import EmptyMetaState from "@/components/EmptyMetaState";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const RISK_BADGE = {
  low: "bg-green-500/10 text-green-600 border-green-500/30 dark:text-green-400",
  medium: "bg-yellow-500/10 text-yellow-600 border-yellow-500/30 dark:text-yellow-400",
  high: "bg-red-500/10 text-red-600 border-red-500/30 dark:text-red-400",
};

export default function Optimizations() {
  const [loading, setLoading] = useState(false);
  const [notConnected, setNotConnected] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [applyingIdx, setApplyingIdx] = useState(null);

  const generate = async () => {
    setLoading(true);
    setNotConnected(false);
    try {
      const { data } = await api.post("/ai/optimizations/suggest");
      setSuggestions(data.suggestions || []);
      toast.success(`${(data.suggestions || []).length} sugestões geradas.`);
    } catch (err) {
      if (err.response?.status === 428) setNotConnected(true);
      else toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  const applyOne = async (idx, s) => {
    // Only apply if it maps to a concrete pause/activate/budget change we implement.
    if (!s.target_id) {
      toast.error("Sugestão sem target_id — abra Ads Manager manualmente.");
      return;
    }
    setApplyingIdx(idx);
    try {
      const t = s.target_type;
      const change = (s.change || "").toLowerCase();
      let status = null;
      if (change.includes("paus")) status = "PAUSED";
      else if (change.includes("ativ") || change.includes("activate")) status = "ACTIVE";
      if (status && (t === "campaign" || t === "adset" || t === "ad")) {
        await api.post(`/meta/${t}s/${s.target_id}/status`, { status });
        toast.success(`Aplicado: ${status} em ${t} ${s.target_id}`);
      } else {
        toast.info("Alteração requer intervenção manual (abrindo detalhes).");
      }
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setApplyingIdx(null);
    }
  };

  if (notConnected) return <EmptyMetaState />;

  return (
    <div className="space-y-4" data-testid="optimizations-page">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            Ações prioritárias
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">Otimizações sugeridas por IA</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Sugestões contextuais baseadas nos últimos 30 dias — priorizadas por impacto e risco.
          </p>
        </div>
        <Button onClick={generate} disabled={loading} data-testid="opt-generate-btn">
          {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Wand2 className="w-4 h-4 mr-1" />}
          Gerar sugestões
        </Button>
      </div>

      {suggestions.length === 0 ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center text-center gap-3">
            <ShieldAlert className="w-8 h-8 text-primary" />
            <div className="text-sm font-semibold">Nenhuma sugestão gerada ainda.</div>
            <div className="text-xs text-muted-foreground max-w-md">
              Clique em <b>Gerar sugestões</b> para pedir ao Claude uma lista de ações priorizadas
              baseada no snapshot da sua conta.
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {suggestions.map((s, i) => (
            <Card key={i} className="hover:border-primary/30" data-testid={`opt-card-${i}`}>
              <CardHeader className="pb-2">
                <div className="flex items-start gap-3">
                  <div className="text-xs font-mono text-muted-foreground shrink-0 mt-1">
                    #{String(i + 1).padStart(2, "0")}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold">{s.title}</div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      <Badge variant="outline" className="text-[10px] font-mono">{s.category}</Badge>
                      {s.target_type && (
                        <Badge variant="outline" className="text-[10px] font-mono">
                          {s.target_type}
                        </Badge>
                      )}
                      {s.risk && (
                        <span className={`text-[10px] font-mono uppercase tracking-widest border rounded-full px-1.5 py-0.5 ${RISK_BADGE[s.risk] || ""}`}>
                          risk {s.risk}
                        </span>
                      )}
                      {typeof s.confidence === "number" && (
                        <Badge variant="secondary" className="text-[10px] font-mono">
                          conf {(s.confidence * 100).toFixed(0)}%
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                {s.change && (
                  <div>
                    <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Ação</span>
                    <div className="text-sm">{s.change}</div>
                  </div>
                )}
                {s.expected_impact && (
                  <div>
                    <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Impacto esperado</span>
                    <div className="text-sm text-muted-foreground">{s.expected_impact}</div>
                  </div>
                )}
                {s.target_id && (
                  <div className="text-[10px] font-mono text-muted-foreground">target_id: {s.target_id}</div>
                )}
                <div className="pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => applyOne(i, s)}
                    disabled={applyingIdx === i}
                    data-testid={`opt-apply-${i}`}
                  >
                    {applyingIdx === i ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5 mr-1" />}
                    Aplicar sugestão
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
