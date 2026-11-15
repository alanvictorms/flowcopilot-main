import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Sparkles, Loader2, Copy, Trash2, Wand2, Image as ImageIcon, RefreshCw } from "lucide-react";
import api, { formatApiError, API_BASE } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

// Aba "Criativos" da campanha: copiloto que gera criativos usando o contexto do
// negócio + a base de conhecimento da campanha, e lista os criativos gerados.
export default function CampaignCreatives({ campaignId }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [imgLoadingId, setImgLoadingId] = useState(null);

  const token = () => localStorage.getItem("mfa_token") || "";
  const imageUrl = (cr) => `${API_BASE}/creative-factory/creatives/${cr.id}/image?t=${encodeURIComponent(token())}&v=${encodeURIComponent(cr.image_generated_at || "")}`;

  const genImage = async (id) => {
    setImgLoadingId(id);
    try {
      await api.post(`/creative-factory/creatives/${id}/image`);
      toast.success("Imagem gerada.");
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally { setImgLoadingId(null); }
  };

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/creative-factory/creatives", { params: { campaign_id: campaignId, limit: 50 } });
      setItems(data || []);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [campaignId]);

  const generate = async () => {
    setGenerating(true);
    try {
      const { data } = await api.post("/creative-factory/generate", { campaign_id: campaignId, instruction, count: 3 });
      if (data.count > 0) toast.success(`${data.count} criativo(s) gerado(s).`);
      else toast.error("Não foi possível gerar criativos agora.");
      setInstruction("");
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally { setGenerating(false); }
  };

  const del = async (id) => {
    try { await api.post(`/creative-factory/${id}/archive`); load(); }
    catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };

  const copy = (cr) => {
    const txt = `${cr.headline}\n\n${cr.primary_text}\n\n${cr.description || ""}\nCTA: ${cr.cta}`;
    navigator.clipboard.writeText(txt);
    toast.success("Texto copiado.");
  };

  const active = items.filter((i) => i.status !== "archived");

  return (
    <div className="space-y-4">
      {/* Copiloto */}
      <Card className="p-5 rounded-2xl space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0"><Wand2 className="w-4 h-4 text-primary" /></div>
          <div>
            <div className="text-sm font-semibold">Copiloto de criativo</div>
            <div className="text-xs text-muted-foreground">Gera criativos de conversão usando o seu negócio + a base de conhecimento desta campanha.</div>
          </div>
        </div>
        <Textarea
          rows={2}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="Instrução opcional para o copiloto (ex: foco em urgência, tom mais formal, destaque a garantia…)"
          className="text-sm"
        />
        <div className="flex justify-end">
          <Button onClick={generate} disabled={generating} className="rounded-full">
            {generating ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />} Gerar criativos
          </Button>
        </div>
      </Card>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-40 bg-muted/40 rounded-2xl animate-pulse" />)}</div>
      ) : active.length === 0 ? (
        <Card className="p-10 rounded-2xl text-center">
          <ImageIcon className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <div className="text-sm font-medium">Nenhum criativo gerado ainda</div>
          <div className="text-xs text-muted-foreground mt-1">Use o copiloto acima. Depois, no conjunto, é só clicar em “Criar Anúncio” e importar.</div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {active.map((cr) => (
            <Card key={cr.id} className="p-4 rounded-2xl space-y-2">
              <div className="flex items-center gap-2">
                {cr.angle && <Badge variant="outline" className="rounded-full text-[10px] capitalize">{cr.angle}</Badge>}
                <Badge className="rounded-full text-[10px] bg-primary/10 text-primary border-0">{cr.cta}</Badge>
                <div className="ml-auto flex gap-1">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => copy(cr)} title="Copiar texto"><Copy className="w-3.5 h-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => del(cr.id)} title="Arquivar"><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              </div>
              {/* Imagem do criativo */}
              {cr.has_image ? (
                <div className="relative group">
                  <img src={imageUrl(cr)} alt="" className="w-full h-40 object-cover rounded-xl border border-border" />
                  <button
                    onClick={() => genImage(cr.id)}
                    disabled={imgLoadingId === cr.id}
                    className="absolute top-2 right-2 bg-background/90 rounded-full px-2 py-1 text-[10px] flex items-center gap-1 border border-border opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Gerar novamente"
                  >
                    {imgLoadingId === cr.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Regenerar
                  </button>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border h-24 flex items-center justify-center">
                  <Button size="sm" variant="outline" className="rounded-full" onClick={() => genImage(cr.id)} disabled={imgLoadingId === cr.id} data-testid={`gen-image-${cr.id}`}>
                    {imgLoadingId === cr.id ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5 mr-1" />} Gerar imagem
                  </Button>
                </div>
              )}

              <div className="text-sm font-semibold">{cr.headline}</div>
              <div className="text-xs text-muted-foreground leading-relaxed">{cr.primary_text}</div>
              {cr.description && <div className="text-[11px] text-muted-foreground">{cr.description}</div>}
              {cr.image_prompt && (
                <div className="text-[10px] text-muted-foreground/70 border-t border-border/50 pt-2 mt-1">
                  <span className="font-mono uppercase">image prompt:</span> {cr.image_prompt}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
