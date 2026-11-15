import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Sparkles, RefreshCw, Wand2 } from "lucide-react";

import api, { formatApiError } from "@/lib/api";
import EmptyMetaState from "@/components/EmptyMetaState";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function Creatives() {
  const [loading, setLoading] = useState(true);
  const [notConnected, setNotConnected] = useState(false);
  const [ads, setAds] = useState([]);
  const [selected, setSelected] = useState(null);
  const [scoreLoading, setScoreLoading] = useState(false);
  const [score, setScore] = useState(null);

  const load = async () => {
    setLoading(true);
    setNotConnected(false);
    try {
      const { data } = await api.get("/meta/ads");
      setAds(data || []);
    } catch (err) {
      if (err.response?.status === 428) setNotConnected(true);
      else toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const analyzeAd = async (ad) => {
    setSelected(ad);
    setScore(null);
    setScoreLoading(true);
    try {
      const { data } = await api.post(`/ai/creatives/score/${ad.id}`);
      setScore(data);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || err.message);
    } finally {
      setScoreLoading(false);
    }
  };

  if (notConnected) return <EmptyMetaState />;

  return (
    <div className="space-y-4" data-testid="creatives-page">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Criativos</div>
          <h2 className="text-2xl font-semibold tracking-tight">Scoring por IA</h2>
          <p className="text-xs text-muted-foreground mt-1">
            A IA analisa headline, corpo, CTA e imagem — retornando uma nota 0–100 e recomendações.
          </p>
        </div>
        <Button variant="outline" size="icon" onClick={load} data-testid="creatives-refresh-btn">
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-56 rounded-lg" />)}
        </div>
      ) : ads.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-xs text-muted-foreground">
            Nenhum anúncio encontrado na sua conta.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {ads.map((ad) => {
            const c = ad.creative || {};
            const story = c.object_story_spec || {};
            const link = story.link_data || {};
            const image = c.image_url || c.thumbnail_url;
            const headline = c.title || link.name;
            const body = c.body || link.message;
            return (
              <Card key={ad.id} className="overflow-hidden group hover:border-primary/30" data-testid={`creative-card-${ad.id}`}>
                <div className="aspect-[16/9] bg-muted relative overflow-hidden">
                  {image ? (
                    <img src={image} alt={ad.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground font-mono">
                      sem imagem
                    </div>
                  )}
                </div>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] font-mono">
                      {ad.effective_status || "UNKNOWN"}
                    </Badge>
                    <div className="text-[10px] text-muted-foreground font-mono truncate">{ad.id}</div>
                  </div>
                  <div className="text-sm font-medium truncate">{ad.name}</div>
                  {headline && <div className="text-xs font-medium truncate">{headline}</div>}
                  {body && (
                    <div className="text-xs text-muted-foreground line-clamp-2">{body}</div>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => analyzeAd(ad)}
                    className="w-full mt-2"
                    data-testid={`creative-score-btn-${ad.id}`}
                  >
                    <Sparkles className="w-3.5 h-3.5 mr-1" /> Analisar com IA
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              <div className="flex items-center gap-2">
                <Wand2 className="w-4 h-4 text-primary" /> Scoring do criativo
              </div>
            </DialogTitle>
          </DialogHeader>
          {scoreLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-1/3" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
              <Skeleton className="h-3 w-3/5" />
            </div>
          ) : score ? (
            <div className="space-y-4">
              <div>
                <div className="flex items-baseline gap-2">
                  <div className="text-4xl font-semibold tracking-tighter">{score.score}</div>
                  <div className="text-xs text-muted-foreground">/ 100</div>
                  <Badge variant="outline" className="ml-2 font-mono text-[10px] uppercase">
                    {score.predicted_ctr_band}
                  </Badge>
                </div>
                <Progress value={score.score} className="h-1.5 mt-2" />
              </div>
              {score.pros?.length > 0 && (
                <section>
                  <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Prós</div>
                  <ul className="mt-1 space-y-1 text-sm">
                    {score.pros.map((p, i) => <li key={i}>• {p}</li>)}
                  </ul>
                </section>
              )}
              {score.cons?.length > 0 && (
                <section>
                  <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Contras</div>
                  <ul className="mt-1 space-y-1 text-sm">
                    {score.cons.map((p, i) => <li key={i}>• {p}</li>)}
                  </ul>
                </section>
              )}
              {score.recommendations?.length > 0 && (
                <section>
                  <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Recomendações</div>
                  <ul className="mt-1 space-y-1 text-sm">
                    {score.recommendations.map((p, i) => <li key={i}>→ {p}</li>)}
                  </ul>
                </section>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
