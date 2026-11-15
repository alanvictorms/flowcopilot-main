import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Paintbrush, RefreshCw, Plus, Star, Archive, TrendingUp, Loader2 } from "lucide-react";

import api, { formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const STATUS_COLORS = {
  draft: "bg-neutral-500/10 text-neutral-600",
  active: "bg-green-500/10 text-green-600",
  winner: "bg-primary/10 text-primary",
  archived: "bg-muted text-muted-foreground",
};

export default function CreativeFactory() {
  const [creatives, setCreatives] = useState([]);
  const [briefings, setBriefings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("creatives");
  const [genLoading, setGenLoading] = useState(false);
  const [product, setProduct] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [c, b] = await Promise.all([
        api.get("/creative-factory/creatives"),
        api.get("/creative-factory/briefings"),
      ]);
      setCreatives(c.data?.creatives || c.data || []);
      setBriefings(b.data?.briefings || b.data || []);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const generateBriefing = async () => {
    if (!product.trim()) { toast.error("Informe o produto"); return; }
    setGenLoading(true);
    try {
      await api.post("/creative-factory/briefing", { product_name: product.trim() });
      toast.success("Briefing gerado!");
      setProduct("");
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setGenLoading(false);
    }
  };

  const promote = async (id) => {
    try {
      await api.post(`/creative-factory/${id}/promote`);
      toast.success("Criativo promovido!");
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  const archive = async (id) => {
    try {
      await api.post(`/creative-factory/${id}/archive`);
      toast.success("Criativo arquivado");
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  return (
    <div className="space-y-6" data-testid="creative-factory-page">
      <Card className="p-6 rounded-2xl">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Paintbrush className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <div className="text-lg font-semibold">Creative Factory</div>
            <div className="text-sm text-muted-foreground mt-1">
              Geração de briefings, gestão de criativos e ciclo de vida.
            </div>
          </div>
          <Button variant="outline" size="icon" className="rounded-full" onClick={load}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </Card>

      <Card className="p-5 rounded-2xl">
        <div className="text-sm font-semibold mb-3">Gerar Briefing</div>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground block mb-1">Produto / Oferta</label>
            <input
              className="border rounded-lg px-3 py-2 text-sm bg-background w-full"
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              placeholder="Ex: Curso de Marketing Digital"
            />
          </div>
          <Button className="rounded-full" onClick={generateBriefing} disabled={genLoading}>
            {genLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
            Gerar
          </Button>
        </div>
      </Card>

      <div className="flex gap-2">
        {[
          { key: "creatives", label: "Criativos" },
          { key: "briefings", label: "Briefings" },
        ].map((t) => (
          <Button
            key={t.key}
            variant={tab === t.key ? "default" : "outline"}
            size="sm"
            className="rounded-full"
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : tab === "creatives" ? (
        creatives.length ? (
          <div className="space-y-2">
            {creatives.map((c) => (
              <Card key={c.id} className="p-4 rounded-2xl">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{c.headline || c.name || c.creative_type || "Criativo"}</span>
                      <Badge className={`rounded-full text-[10px] ${STATUS_COLORS[c.status] || ""}`}>
                        {c.status}
                      </Badge>
                    </div>
                    {c.primary_text && <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{c.primary_text}</div>}
                    {c.ai_score ? (
                      <div className="text-xs mt-1 flex items-center gap-1">
                        <Star className="w-3 h-3" /> Score: {c.ai_score}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {c.status !== "winner" && (
                      <Button variant="ghost" size="icon" onClick={() => promote(c.id)} title="Promover">
                        <TrendingUp className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    {c.status !== "archived" && (
                      <Button variant="ghost" size="icon" onClick={() => archive(c.id)} title="Arquivar">
                        <Archive className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="p-10 rounded-2xl text-center text-sm text-muted-foreground">Nenhum criativo cadastrado.</Card>
        )
      ) : (
        briefings.length ? (
          <div className="space-y-3">
            {briefings.map((b, i) => (
              <Card key={b.id || i} className="p-5 rounded-2xl space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-sm font-semibold">{b.product_name || "Briefing"}</div>
                  {b.creative_type && <Badge variant="secondary" className="rounded-full text-[10px]">{b.creative_type}</Badge>}
                  {b.funnel_stage && <Badge variant="outline" className="rounded-full text-[10px]">Funil: {b.funnel_stage}</Badge>}
                </div>

                {Array.isArray(b.hooks) && b.hooks.length > 0 && (
                  <div>
                    <div className="text-xs font-medium mb-2">Hooks</div>
                    <div className="space-y-1.5">
                      {b.hooks.map((h, j) => {
                        const text = typeof h === "string" ? h : (h.text_pt || h.text || "");
                        const angle = typeof h === "object" && h ? h.angle : null;
                        return (
                          <div key={j} className="flex items-start gap-2 text-xs">
                            {angle && <Badge variant="outline" className="rounded-full text-[9px] shrink-0 capitalize">{angle}</Badge>}
                            <span className="text-muted-foreground leading-relaxed">{text}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {Array.isArray(b.angles) && b.angles.length > 0 && (
                  <div>
                    <div className="text-xs font-medium mb-1">Ângulos</div>
                    <div className="flex flex-wrap gap-1">
                      {b.angles.map((a, j) => (
                        <Badge key={j} variant="secondary" className="rounded-full text-[10px]">
                          {typeof a === "string" ? a : (a.text_pt || a.angle || "")}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {Array.isArray(b.suggested_ctas) && b.suggested_ctas.length > 0 && (
                  <div>
                    <div className="text-xs font-medium mb-1">CTAs sugeridos</div>
                    <div className="flex flex-wrap gap-1">
                      {b.suggested_ctas.map((c, j) => (
                        <Badge key={j} variant="outline" className="rounded-full text-[10px] font-mono">
                          {typeof c === "string" ? c : (c.text_pt || "")}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        ) : (
          <Card className="p-10 rounded-2xl text-center text-sm text-muted-foreground">Nenhum briefing gerado.</Card>
        )
      )}
    </div>
  );
}
