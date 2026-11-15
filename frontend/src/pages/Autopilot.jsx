import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Wand2, Loader2, Copy, Trash2, Eye, ImageIcon } from "lucide-react";

import api, { formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";

const TONES = [
  { value: "direct", label: "Direto" }, { value: "inspirational", label: "Inspirador" },
  { value: "playful", label: "Descontraído" }, { value: "premium", label: "Premium" }, { value: "urgent", label: "Urgente" },
];

const SECTION_LABEL = { headlines: "Títulos", primary_texts: "Textos principais", descriptions: "Descrições", ctas: "CTAs", image_prompts: "Prompts de imagem", video_scripts: "Roteiros de vídeo" };
const SELECTABLE = ["headlines", "primary_texts", "descriptions", "ctas"];

function Section({ title, items, sectionKey, selected, onToggle }) {
  if (!items?.length) return null;
  const copy = (t) => { navigator.clipboard.writeText(t); toast.success("Copiado."); };
  const isSelectable = SELECTABLE.includes(sectionKey);
  return (
    <div>
      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">{title}</div>
      <div className="space-y-1.5">
        {items.map((t, i) => {
          const txt = typeof t === "string" ? t : JSON.stringify(t);
          const key = `${sectionKey}:${i}`;
          const isSel = selected?.[key];
          return (
            <div key={i} className={`text-xs border rounded-xl px-3 py-2 flex items-start gap-2 transition-colors ${isSel ? "border-primary bg-primary/5" : "border-border hover:bg-accent/30"}`}>
              {isSelectable && <Checkbox checked={!!isSel} onCheckedChange={() => onToggle(key, txt)} className="mt-0.5 shrink-0" />}
              <div className="flex-1 whitespace-pre-wrap break-words">{txt}</div>
              <button onClick={() => copy(txt)} className="text-muted-foreground hover:text-foreground shrink-0"><Copy className="w-3 h-3" /></button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function countItems(pack) {
  if (!pack) return 0;
  return Object.keys(SECTION_LABEL).reduce((n, k) => n + (Array.isArray(pack[k]) ? pack[k].length : 0), 0);
}

export default function Autopilot() {
  const [form, setForm] = useState({ product: "", offer: "", audience: "", tone: "direct", language: "pt-BR", extra: "" });
  const [packs, setPacks] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [openPack, setOpenPack] = useState(null);
  // Selection: key -> text content
  const [selected, setSelected] = useState({});
  const [genCreative, setGenCreative] = useState(false);
  const [creativeImages, setCreativeImages] = useState([]);

  const load = async () => { try { const { data } = await api.get("/autopilot/packs"); setPacks(data || []); } catch {} };
  useEffect(() => { load(); }, []);

  const generate = async () => {
    if (!form.product.trim()) return toast.error("Informe o produto.");
    setGenerating(true);
    try { await api.post("/autopilot/generate", form); toast.success("Pacote gerado."); load(); }
    catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
    finally { setGenerating(false); }
  };

  const del = async (id) => {
    if (!confirm("Excluir?")) return;
    await api.delete(`/autopilot/packs/${id}`);
    if (openPack?.id === id) setOpenPack(null);
    load();
  };

  const toggleSelect = (key, text) => {
    setSelected(prev => {
      const copy = { ...prev };
      if (copy[key]) delete copy[key]; else copy[key] = text;
      return copy;
    });
  };

  const getSelected = (section) => {
    return Object.entries(selected).filter(([k]) => k.startsWith(`${section}:`)).map(([, v]) => v);
  };

  const generateCreative = async () => {
    const headline = getSelected("headlines")[0] || "";
    const primaryText = getSelected("primary_texts")[0] || "";
    const cta = getSelected("ctas")[0] || "";
    const desc = getSelected("descriptions")[0] || "";
    if (!headline && !primaryText) return toast.error("Selecione pelo menos um título e um texto principal.");
    setGenCreative(true);
    const prompt = `Create a professional Meta Ads creative image for: "${openPack?.input?.product || "product"}". `
      + `The image should be a complete ad creative suitable for Facebook/Instagram. `
      + `Include the headline text "${headline}" prominently displayed on the image. `
      + (desc ? `Include description: "${desc}". ` : "")
      + `Style: clean, modern, high-contrast advertising design. The text must be legible and well-positioned. `
      + `Do NOT include any Facebook UI elements. Just the ad creative image itself.`;
    try {
      const { data } = await api.post(`/autopilot/packs/${openPack.id}/generate-image`, { prompt });
      if (data.full_data) {
        setCreativeImages(prev => [...prev, { data: data.full_data, mime: data.mime, headline, primaryText, cta, desc }]);
        toast.success("Criativo gerado!");
      }
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
    finally { setGenCreative(false); }
  };

  const selCount = Object.keys(selected).length;

  return (
    <div className="space-y-6" data-testid="autopilot-page">
      <Card className="p-6 rounded-2xl">
        <div className="text-lg font-semibold mb-1">Piloto de Criativos</div>
        <div className="text-xs text-muted-foreground mb-6">Gera títulos, textos, descrições, CTAs, prompts de imagem e roteiros de vídeo.</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5 md:col-span-2"><Label>Produto / oferta *</Label><Textarea rows={2} value={form.product} onChange={(e) => setForm({ ...form, product: e.target.value })} data-testid="autopilot-product" /></div>
          <div className="space-y-1.5 md:col-span-2"><Label>Público-alvo</Label><Textarea rows={2} value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Diferencial</Label><Input value={form.offer} onChange={(e) => setForm({ ...form, offer: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Tom</Label>
            <Select value={form.tone} onValueChange={(v) => setForm({ ...form, tone: v })}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent>{TONES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="space-y-1.5"><Label>Idioma</Label><Input value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Notas extras</Label><Input value={form.extra} onChange={(e) => setForm({ ...form, extra: e.target.value })} /></div>
        </div>
        <div className="mt-6 flex justify-end">
          <Button onClick={generate} disabled={generating} className="rounded-full" data-testid="autopilot-generate-btn">
            {generating ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Wand2 className="w-4 h-4 mr-1" />} Gerar pacote
          </Button>
        </div>
      </Card>

      {packs.length > 0 && (
        <div>
          <div className="text-sm font-semibold mb-3">Pacotes gerados</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {packs.map((p) => (
              <Card key={p.id} onClick={() => { setOpenPack(p); setSelected({}); setCreativeImages([]); }}
                className="p-4 rounded-2xl cursor-pointer hover:shadow-sm hover:border-primary/40 transition-all group" data-testid={`autopilot-pack-${p.id}`}>
                <div className="flex items-start justify-between mb-2">
                  <div className="text-[10px] font-mono text-muted-foreground">{new Date(p.created_at).toLocaleDateString("pt-BR")}</div>
                  <button onClick={(e) => { e.stopPropagation(); del(p.id); }} className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
                <div className="text-sm font-semibold line-clamp-2 mb-2">{p.input?.product || "(sem produto)"}</div>
                <div className="flex flex-wrap gap-1 mb-2">
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-muted">{p.input?.tone || "—"}</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">{countItems(p.pack)} itens</span>
                </div>
                <div className="text-[10px] text-muted-foreground line-clamp-2">{p.input?.audience || "—"}</div>
                <div className="mt-2 flex items-center gap-1 text-[11px] text-primary opacity-0 group-hover:opacity-100 transition"><Eye className="w-3 h-3" /> Ver detalhes</div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Drawer */}
      <Sheet open={!!openPack} onOpenChange={(o) => { if (!o) { setOpenPack(null); setSelected({}); setCreativeImages([]); } }}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-base pr-8 line-clamp-2">{openPack?.input?.product || "Pacote"}</SheetTitle>
            <div className="text-[11px] text-muted-foreground">{openPack && new Date(openPack.created_at).toLocaleString("pt-BR")} · {openPack?.input?.tone}</div>
          </SheetHeader>
          {openPack && (
            <div className="mt-4 space-y-5">
              {/* Generate creative button */}
              {selCount > 0 && (
                <div className="p-3 rounded-xl border border-primary/30 bg-primary/5">
                  <div className="text-xs font-semibold mb-2">{selCount} item(ns) selecionado(s)</div>
                  <div className="text-[10px] text-muted-foreground mb-2">Selecione título, texto, CTA e descrição e gere um criativo de anúncio com IA.</div>
                  <Button size="sm" onClick={generateCreative} disabled={genCreative} className="rounded-full">
                    {genCreative ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5 mr-1" />} Gerar criativo
                  </Button>
                </div>
              )}

              {Object.entries(SECTION_LABEL).map(([key, label]) => (
                <Section key={key} sectionKey={key} title={label} items={openPack.pack?.[key]} selected={selected} onToggle={toggleSelect} />
              ))}

              {/* Generated creatives */}
              {creativeImages.length > 0 && (
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">Criativos gerados</div>
                  <div className="space-y-3">
                    {creativeImages.map((img, i) => (
                      <div key={i} className="rounded-xl border border-border overflow-hidden">
                        <img src={`data:${img.mime};base64,${img.data}`} alt="" className="w-full h-48 object-cover" />
                        <div className="p-3 space-y-1">
                          {img.headline && <div className="text-xs font-semibold">{img.headline}</div>}
                          {img.primaryText && <div className="text-[10px] text-muted-foreground line-clamp-2">{img.primaryText}</div>}
                          {img.cta && <div className="text-[10px] font-mono text-primary">{img.cta}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
