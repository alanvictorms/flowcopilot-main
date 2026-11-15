import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Upload, Rocket, Sparkles, X } from "lucide-react";

import api, { formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const CTAS = ["LEARN_MORE", "SHOP_NOW", "SIGN_UP", "SUBSCRIBE", "DOWNLOAD", "BUY_NOW", "GET_OFFER", "CONTACT_US", "ORDER_NOW"];
const EMPTY = { name: "", page_id: "", headline: "", message: "", description: "", link: "", cta_type: "LEARN_MORE", image_hash: "", image_preview: "" };

// Compositor de anúncio com preview em tempo real (mesma UX do criador manual),
// para criar um anúncio dentro de um conjunto existente. Permite importar um
// criativo gerado pelo copiloto.
export default function AdComposer({ adsetId, campaignId, pages: pagesProp, onCreated }) {
  const [ad, setAd] = useState({ ...EMPTY });
  const [pages, setPages] = useState(pagesProp || []);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [creatives, setCreatives] = useState([]);
  const [loadingCreatives, setLoadingCreatives] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    if ((!pagesProp || pagesProp.length === 0)) {
      api.get("/builder/pages").then(({ data }) => setPages(data || [])).catch(() => {});
    } else {
      setPages(pagesProp);
    }
  }, [pagesProp]);

  const set = (field, val) => setAd((p) => ({ ...p, [field]: val }));

  const handleFile = async (file) => {
    if (!file) return;
    if (file.type.startsWith("video/")) { toast.info("Vídeo será enviado ao publicar (preview indisponível)."); return; }
    setUploading(true);
    try {
      const reader = new FileReader();
      const b64 = await new Promise((res, rej) => { reader.onload = () => res(reader.result); reader.onerror = rej; reader.readAsDataURL(file); });
      const { data } = await api.post("/builder/manual/upload-image", { filename: file.name, data_base64: b64 });
      set("image_hash", data.image_hash);
      set("image_preview", data.url || b64);
      toast.success("Imagem enviada.");
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const openPicker = async () => {
    setPickerOpen(true);
    setLoadingCreatives(true);
    try {
      const { data } = await api.get("/creative-factory/creatives", { params: { campaign_id: campaignId, limit: 50 } });
      setCreatives(data || []);
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
    finally { setLoadingCreatives(false); }
  };

  const importCreative = (cr) => {
    setAd((p) => ({
      ...p,
      headline: cr.headline || p.headline,
      message: cr.primary_text || p.message,
      description: cr.description || p.description,
      cta_type: cr.cta || p.cta_type,
      name: p.name || (cr.headline ? cr.headline.slice(0, 30) : p.name),
    }));
    setPickerOpen(false);
    toast.success("Criativo importado. Ajuste e escolha a página/URL.");
  };

  const submit = async () => {
    if (!ad.name || !ad.page_id || !ad.headline || !ad.message || !ad.link) {
      return toast.error("Preencha nome, página, título, texto e URL.");
    }
    setSaving(true);
    try {
      await api.post("/builder/manual/ad", {
        adset_id: adsetId, name: ad.name, page_id: ad.page_id, instagram_actor_id: null,
        message: ad.message, headline: ad.headline, description: ad.description || null,
        link: ad.link, cta_type: ad.cta_type, image_hash: ad.image_hash || null,
      });
      toast.success("Anúncio criado (Pausado).");
      setAd({ ...EMPTY });
      onCreated?.();
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
    finally { setSaving(false); }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* Form */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Novo anúncio</div>
          <Button size="sm" variant="outline" className="rounded-full" onClick={openPicker} data-testid="ad-import-creative">
            <Sparkles className="w-3.5 h-3.5 mr-1 text-primary" /> Importar criativo
          </Button>
        </div>

        {pickerOpen && (
          <Card className="p-3 rounded-xl border-primary/30 max-h-64 overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold">Criativos gerados desta campanha</div>
              <button onClick={() => setPickerOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
            </div>
            {loadingCreatives ? (
              <div className="py-4 text-center"><Loader2 className="w-4 h-4 animate-spin mx-auto text-muted-foreground" /></div>
            ) : creatives.length === 0 ? (
              <div className="text-xs text-muted-foreground py-3 text-center">Nenhum criativo gerado. Use a aba Criativos para gerar.</div>
            ) : (
              <div className="space-y-1.5">
                {creatives.map((cr) => (
                  <button key={cr.id} onClick={() => importCreative(cr)} className="w-full text-left p-2 rounded-lg border border-border hover:bg-accent/40">
                    <div className="text-xs font-medium truncate">{cr.headline || "(sem título)"}</div>
                    <div className="text-[10px] text-muted-foreground line-clamp-1">{cr.primary_text}</div>
                  </button>
                ))}
              </div>
            )}
          </Card>
        )}

        <div className="space-y-1"><Label className="text-xs">Nome *</Label><Input value={ad.name} onChange={(e) => set("name", e.target.value)} className="h-8 text-sm" /></div>
        <div className="space-y-1"><Label className="text-xs">Página *</Label>
          <Select value={ad.page_id} onValueChange={(v) => set("page_id", v)}>
            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder={pages.length ? "Selecione" : "Carregando…"} /></SelectTrigger>
            <SelectContent>{pages.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1"><Label className="text-xs">Título * (40)</Label><Input value={ad.headline} onChange={(e) => set("headline", e.target.value)} maxLength={40} className="h-8 text-sm" /></div>
        <div className="space-y-1"><Label className="text-xs">Texto principal *</Label><Textarea rows={3} value={ad.message} onChange={(e) => set("message", e.target.value)} className="text-sm" /></div>
        <div className="space-y-1"><Label className="text-xs">Descrição (30)</Label><Input value={ad.description} onChange={(e) => set("description", e.target.value)} maxLength={30} className="h-8 text-sm" /></div>
        <div className="space-y-1"><Label className="text-xs">URL *</Label><Input value={ad.link} onChange={(e) => set("link", e.target.value)} className="h-8 text-sm" placeholder="https://…" /></div>
        <div className="space-y-1"><Label className="text-xs">CTA</Label>
          <Select value={ad.cta_type} onValueChange={(v) => set("cta_type", v)}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>{CTAS.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1"><Label className="text-xs">Mídia (imagem/vídeo)</Label>
          <label className="border border-dashed border-border rounded-lg px-3 py-2 text-xs cursor-pointer hover:bg-accent flex items-center gap-2">
            <Upload className="w-3.5 h-3.5" />
            <span>{ad.image_hash ? "Trocar mídia" : "Enviar imagem/vídeo"}</span>
            <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
          </label>
          {uploading && <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-1"><Loader2 className="w-3 h-3 animate-spin" /> Enviando…</div>}
        </div>
        <Button onClick={submit} disabled={saving} className="w-full rounded-full mt-1">
          {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Rocket className="w-4 h-4 mr-1" />} Criar anúncio (Pausado)
        </Button>
      </div>

      {/* Preview em tempo real */}
      <div>
        <div className="text-sm font-semibold mb-2">Preview</div>
        <Card className="rounded-xl overflow-hidden border-border sticky top-0">
          {ad.image_preview ? (
            <img src={ad.image_preview} alt="" className="w-full h-48 object-cover" />
          ) : (
            <div className="w-full h-48 bg-muted flex items-center justify-center"><Upload className="w-6 h-6 text-muted-foreground" /></div>
          )}
          <div className="p-4">
            <div className="text-sm font-semibold mb-1">{ad.headline || "Seu título aparece aqui"}</div>
            <div className="text-xs text-muted-foreground line-clamp-4 mb-2">{ad.message || "O texto principal do anúncio aparece aqui conforme você digita."}</div>
            {ad.description && <div className="text-[10px] text-muted-foreground mb-2">{ad.description}</div>}
            <div className="flex items-center justify-between">
              <div className="text-[10px] text-muted-foreground truncate max-w-[60%]">{ad.link || "sualanding.com"}</div>
              <Badge variant="outline" className="text-[10px]">{ad.cta_type}</Badge>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
