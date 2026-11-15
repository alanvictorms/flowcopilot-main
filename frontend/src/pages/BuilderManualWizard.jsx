import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Rocket, CheckCircle2, Upload, ChevronRight, ChevronLeft, Copy, Trash2, Plus, Video } from "lucide-react";

import api, { formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

const OBJECTIVES = [
  { value: "OUTCOME_SALES", label: "Vendas / Compras" }, { value: "OUTCOME_LEADS", label: "Leads" },
  { value: "OUTCOME_ENGAGEMENT", label: "Engajamento" }, { value: "OUTCOME_TRAFFIC", label: "Tráfego" },
  { value: "OUTCOME_AWARENESS", label: "Reconhecimento" }, { value: "OUTCOME_APP_PROMOTION", label: "App" },
];

const OPT_GOALS = {
  OUTCOME_SALES: ["OFFSITE_CONVERSIONS", "VALUE", "LINK_CLICKS"],
  OUTCOME_LEADS: ["LEAD_GENERATION", "OFFSITE_CONVERSIONS", "LINK_CLICKS"],
  OUTCOME_ENGAGEMENT: ["THRUPLAY", "IMPRESSIONS", "REACH"],
  OUTCOME_TRAFFIC: ["LINK_CLICKS", "LANDING_PAGE_VIEWS", "IMPRESSIONS"],
  OUTCOME_AWARENESS: ["REACH", "IMPRESSIONS"],
  OUTCOME_APP_PROMOTION: ["LINK_CLICKS", "OFFSITE_CONVERSIONS"],
};

const SPECIAL_CATS = ["CREDIT", "EMPLOYMENT", "HOUSING", "ISSUES_ELECTIONS_POLITICS", "ONLINE_GAMBLING_AND_GAMING"];
const SPECIAL_LABELS = { CREDIT: "Crédito", EMPLOYMENT: "Emprego", HOUSING: "Imóveis", ISSUES_ELECTIONS_POLITICS: "Política/Eleições", ONLINE_GAMBLING_AND_GAMING: "Jogos de azar" };
const CTAS = ["LEARN_MORE", "SHOP_NOW", "SIGN_UP", "SUBSCRIBE", "DOWNLOAD", "BUY_NOW", "GET_OFFER", "CONTACT_US", "ORDER_NOW"];
const CUSTOM_EVENTS = ["PURCHASE", "LEAD", "COMPLETE_REGISTRATION", "ADD_TO_CART", "INITIATE_CHECKOUT", "VIEW_CONTENT", "SUBSCRIBE", "OTHER"];

function StepIndicator({ step }) {
  const steps = ["Campanha", "Conjunto", "Anúncio(s)"];
  return (
    <div className="flex items-center gap-2 mb-6">
      {steps.map((s, i) => (
        <div key={s} className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-mono ${step > i + 1 ? "bg-primary text-primary-foreground" : step === i + 1 ? "bg-primary/20 text-primary border border-primary" : "bg-muted text-muted-foreground"}`}>
            {step > i + 1 ? <CheckCircle2 className="w-3.5 h-3.5" /> : i + 1}
          </div>
          <div className={`text-xs ${step === i + 1 ? "font-semibold" : "text-muted-foreground"}`}>{s}</div>
          {i < 2 && <div className="w-5 h-px bg-border mx-1" />}
        </div>
      ))}
    </div>
  );
}

function MultiSelect({ options, value, onChange, labels }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const on = value.includes(opt);
        return <button key={opt} type="button" onClick={() => onChange(on ? value.filter(v => v !== opt) : [...value, opt])}
          className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${on ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:bg-accent"}`}>{labels?.[opt] || opt}</button>;
      })}
    </div>
  );
}

const EMPTY_AD = { name: "", page_id: "", headline: "", message: "", description: "", link: "", cta_type: "LEARN_MORE", image_hash: "", image_preview: "", video_id: "", media_type: "image" };

export default function BuilderManualWizard({ onDone }) {
  const [step, setStep] = useState(1);
  const [pages, setPages] = useState([]);
  const [pagesLoaded, setPagesLoaded] = useState(false);

  // Step 1
  const [c, setC] = useState({ name: "", objective: "OUTCOME_SALES", buying_type: "AUCTION", daily_budget: 30, special_ad_categories: [] });

  // Step 2
  const [a, setA] = useState({
    name: "", daily_budget: 30, billing_event: "IMPRESSIONS", optimization_goal: "OFFSITE_CONVERSIONS",
    bid_strategy: "LOWEST_COST_WITHOUT_CAP", bid_amount: "",
    countries: ["BR"], age_min: 18, age_max: 65, genders: [],
    pixel_id: "", custom_event_type: "PURCHASE",
    start_time: "", end_time: "",
    publisher_platforms: ["facebook", "instagram"],
  });
  const [interestsRaw, setInterestsRaw] = useState("");

  // Step 3 - Multiple ads
  const [ads, setAds] = useState([{ ...EMPTY_AD }]);
  const [uploading, setUploading] = useState(null); // index of uploading ad

  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [resultIds, setResultIds] = useState({});

  const needsBid = a.bid_strategy === "LOWEST_COST_WITH_BID_CAP" || a.bid_strategy === "COST_CAP";
  const optGoals = OPT_GOALS[c.objective] || OPT_GOALS.OUTCOME_SALES;

  useEffect(() => {
    if (step >= 2 && !pagesLoaded) {
      (async () => { try { const { data } = await api.get("/builder/pages"); setPages(data || []); } catch {} finally { setPagesLoaded(true); } })();
    }
  }, [step, pagesLoaded]);

  // eslint-disable-next-line
  useEffect(() => { if (!optGoals.includes(a.optimization_goal)) setA(p => ({ ...p, optimization_goal: optGoals[0] })); }, [c.objective]);

  const toggleCat = (cat) => {
    setC(prev => ({ ...prev, special_ad_categories: prev.special_ad_categories.includes(cat) ? prev.special_ad_categories.filter(v => v !== cat) : [...prev.special_ad_categories, cat] }));
  };

  const updateAd = (idx, field, val) => { setAds(prev => { const copy = [...prev]; copy[idx] = { ...copy[idx], [field]: val }; return copy; }); };
  const addAd = () => setAds(prev => [...prev, { ...EMPTY_AD, name: `Anúncio ${prev.length + 1}` }]);
  const duplicateAd = (idx) => setAds(prev => [...prev, { ...prev[idx], name: prev[idx].name + " (cópia)" }]);
  const removeAd = (idx) => { if (ads.length <= 1) return; setAds(prev => prev.filter((_, i) => i !== idx)); };

  const handleFile = async (idx, file) => {
    if (!file) return;
    setUploading(idx);
    const isVideo = file.type.startsWith("video/");
    try {
      const reader = new FileReader();
      const b64 = await new Promise((res, rej) => { reader.onload = () => res(reader.result); reader.onerror = rej; reader.readAsDataURL(file); });
      if (isVideo) {
        updateAd(idx, "media_type", "video");
        updateAd(idx, "image_preview", ""); // video preview not supported via base64
        toast.info("Vídeos serão enviados ao publicar. Preview indisponível.");
      } else {
        const { data } = await api.post("/builder/manual/upload-image", { filename: file.name, data_base64: b64 });
        updateAd(idx, "image_hash", data.image_hash);
        updateAd(idx, "image_preview", data.url || b64);
        updateAd(idx, "media_type", "image");
        toast.success("Imagem enviada.");
      }
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
    finally { setUploading(null); }
  };

  const submitAll = async () => {
    const validAds = ads.filter(ad => ad.name && ad.page_id && ad.headline && ad.message && ad.link);
    if (!validAds.length) return toast.error("Preencha pelo menos um anúncio completo.");
    if (!c.name.trim()) return toast.error("Nome da campanha obrigatório.");
    if (!a.name.trim()) return toast.error("Nome do conjunto obrigatório.");
    if (needsBid && !a.bid_amount) return toast.error("Informe o valor do lance.");
    setSubmitting(true);
    try {
      const { data: campData } = await api.post("/builder/manual/campaign", c);
      const campaignId = campData.meta_campaign_id;
      const interests_arr = interestsRaw.split(",").map(s => s.trim()).filter(Boolean).map(name => ({ name }));
      const promoted = (a.optimization_goal === "OFFSITE_CONVERSIONS" && a.pixel_id) ? { pixel_id: a.pixel_id, custom_event_type: a.custom_event_type } : null;
      const adsetPayload = {
        campaign_id: campaignId, name: a.name, daily_budget: a.daily_budget, billing_event: a.billing_event,
        optimization_goal: a.optimization_goal, bid_strategy: a.bid_strategy,
        countries: a.countries, age_min: a.age_min, age_max: a.age_max, genders: a.genders,
        interests: interests_arr, publisher_platforms: a.publisher_platforms, promoted_object: promoted,
      };
      if (needsBid && a.bid_amount) adsetPayload.bid_amount = a.bid_amount;
      if (a.start_time) adsetPayload.start_time = a.start_time;
      if (a.end_time) adsetPayload.end_time = a.end_time;
      const { data: adsetData } = await api.post("/builder/manual/adset", adsetPayload);
      const adsetId = adsetData.meta_adset_id;
      const adIds = [];
      for (const ad of validAds) {
        const { data: adData } = await api.post("/builder/manual/ad", {
          adset_id: adsetId, name: ad.name, page_id: ad.page_id,
          instagram_actor_id: null, message: ad.message, headline: ad.headline,
          description: ad.description || null, link: ad.link, cta_type: ad.cta_type,
          image_hash: ad.image_hash || null,
        });
        adIds.push(adData.meta_ad_id);
      }
      setResultIds({ campaignId, adsetId, adIds });
      setDone(true);
      toast.success(`Tudo criado! ${adIds.length} anúncio(s) no Meta.`);
      onDone?.();
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
    finally { setSubmitting(false); }
  };

  return (
    <Card className="p-6 rounded-2xl">
      <StepIndicator step={step} />

      {/* STEP 1 - Campaign */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="text-base font-semibold">1. Campanha</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5 md:col-span-2"><Label>Nome *</Label><Input value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} placeholder="Ex: [BR] Curso Finanças - Vendas" data-testid="wiz-c-name" /></div>
            <div className="space-y-1.5"><Label>Objetivo</Label>
              <Select value={c.objective} onValueChange={(v) => setC({ ...c, objective: v })}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent>{OBJECTIVES.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="space-y-1.5"><Label>Tipo de compra</Label>
              <Select value={c.buying_type} onValueChange={(v) => setC({ ...c, buying_type: v })}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="AUCTION">Leilão</SelectItem><SelectItem value="RESERVED">Reservado</SelectItem></SelectContent></Select>
            </div>
            <div className="space-y-1.5"><Label>Verba diária (R$)</Label><Input type="number" value={c.daily_budget} onChange={(e) => setC({ ...c, daily_budget: Number(e.target.value) })} data-testid="wiz-c-budget" /></div>
            <div className="space-y-1.5"><Label>Categorias especiais</Label>
              <div className="space-y-2">
                {SPECIAL_CATS.map(cat => (
                  <label key={cat} className="flex items-center justify-between p-2.5 rounded-xl border border-border hover:bg-accent cursor-pointer">
                    <span className="text-xs">{SPECIAL_LABELS[cat] || cat}</span>
                    <Switch checked={c.special_ad_categories.includes(cat)} onCheckedChange={() => toggleCat(cat)} />
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => { if (!c.name.trim()) return toast.error("Nome obrigatório."); setA(p => ({ ...p, name: `${c.name} - Conjunto 1`, daily_budget: c.daily_budget })); setStep(2); }} className="rounded-full" data-testid="wiz-c-submit">
              Próximo <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* STEP 2 - Ad Set */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="text-base font-semibold">2. Conjunto de Anúncios</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5 md:col-span-2"><Label>Nome *</Label><Input value={a.name} onChange={(e) => setA({ ...a, name: e.target.value })} data-testid="wiz-a-name" /></div>
            <div className="space-y-1.5"><Label>Verba diária (R$)</Label><Input type="number" value={a.daily_budget} onChange={(e) => setA({ ...a, daily_budget: Number(e.target.value) })} /></div>
            <div className="space-y-1.5"><Label>Otimização</Label>
              <Select value={a.optimization_goal} onValueChange={(v) => setA({ ...a, optimization_goal: v })}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent>{optGoals.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="space-y-1.5"><Label>Cobrança</Label>
              <Select value={a.billing_event} onValueChange={(v) => setA({ ...a, billing_event: v })}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="IMPRESSIONS">Impressões</SelectItem><SelectItem value="LINK_CLICKS">Cliques</SelectItem></SelectContent></Select>
            </div>
            <div className="space-y-1.5"><Label>Estratégia de lance</Label>
              <Select value={a.bid_strategy} onValueChange={(v) => setA({ ...a, bid_strategy: v })}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="LOWEST_COST_WITHOUT_CAP">Menor custo (auto)</SelectItem><SelectItem value="LOWEST_COST_WITH_BID_CAP">Com teto de lance</SelectItem><SelectItem value="COST_CAP">Teto de custo</SelectItem></SelectContent></Select>
            </div>
            {needsBid && <div className="space-y-1.5"><Label>Valor do lance (centavos) *</Label><Input type="number" value={a.bid_amount} onChange={(e) => setA({ ...a, bid_amount: e.target.value })} placeholder="500 = R$5,00" /></div>}
            {(a.optimization_goal === "OFFSITE_CONVERSIONS" || a.optimization_goal === "VALUE") && (
              <><div className="space-y-1.5"><Label>Pixel ID</Label><Input value={a.pixel_id} onChange={(e) => setA({ ...a, pixel_id: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Evento</Label><Select value={a.custom_event_type} onValueChange={(v) => setA({ ...a, custom_event_type: v })}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent>{CUSTOM_EVENTS.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select></div></>
            )}
            <div className="md:col-span-2 border-t border-border pt-3 mt-1"><div className="text-sm font-semibold mb-2">Programação</div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5"><Label>Início</Label><Input type="datetime-local" value={a.start_time} onChange={(e) => setA({ ...a, start_time: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Término (opcional)</Label><Input type="datetime-local" value={a.end_time} onChange={(e) => setA({ ...a, end_time: e.target.value })} /></div>
              </div>
            </div>
            <div className="md:col-span-2 border-t border-border pt-3 mt-1"><div className="text-sm font-semibold mb-2">Segmentação</div></div>
            <div className="space-y-1.5"><Label>Países</Label><Input value={a.countries.join(", ")} onChange={(e) => setA({ ...a, countries: e.target.value.split(",").map(s => s.trim().toUpperCase()).filter(Boolean) })} /></div>
            <div className="space-y-1.5"><Label>Idade</Label><div className="flex items-center gap-2"><Input type="number" value={a.age_min} onChange={(e) => setA({ ...a, age_min: Number(e.target.value) })} className="w-20" /><span className="text-xs text-muted-foreground">até</span><Input type="number" value={a.age_max} onChange={(e) => setA({ ...a, age_max: Number(e.target.value) })} className="w-20" /></div></div>
            <div className="space-y-1.5"><Label>Gênero</Label>
              <div className="flex gap-2">{[{ v: 0, l: "Todos" }, { v: 1, l: "Homens" }, { v: 2, l: "Mulheres" }].map(g => (
                <button key={g.v} type="button" onClick={() => setA({ ...a, genders: g.v === 0 ? [] : [g.v] })}
                  className={`text-xs px-3 py-1.5 rounded-full border ${(g.v === 0 ? a.genders.length === 0 : a.genders.includes(g.v)) ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:bg-accent"}`}>{g.l}</button>
              ))}</div>
            </div>
            <div className="space-y-1.5 md:col-span-2"><Label>Interesses (vírgula)</Label><Input value={interestsRaw} onChange={(e) => setInterestsRaw(e.target.value)} placeholder="finanças, marketing digital" /></div>
            <div className="md:col-span-2 border-t border-border pt-3 mt-1"><div className="text-sm font-semibold mb-2">Plataformas</div>
              <MultiSelect options={["facebook", "instagram", "audience_network", "messenger"]} value={a.publisher_platforms} onChange={(v) => setA({ ...a, publisher_platforms: v })} />
            </div>
          </div>
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)} className="rounded-full"><ChevronLeft className="w-4 h-4 mr-1" /> Voltar</Button>
            <Button onClick={() => { if (!a.name.trim()) return toast.error("Nome obrigatório."); if (needsBid && !a.bid_amount) return toast.error("Informe o lance."); setAds(prev => prev.length ? prev.map((ad, i) => ({ ...ad, name: ad.name || `${a.name} - Anúncio ${i+1}` })) : [{ ...EMPTY_AD, name: `${a.name} - Anúncio 1` }]); setStep(3); }} className="rounded-full" data-testid="wiz-a-submit">
              Próximo <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* STEP 3 - Ads (multiple) */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-base font-semibold">3. Anúncio(s)</div>
            <Button size="sm" variant="outline" onClick={addAd} className="rounded-full"><Plus className="w-3.5 h-3.5 mr-1" /> Novo anúncio</Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Ad forms */}
            <div className="space-y-4 lg:col-span-1">
              {ads.map((ad, idx) => (
                <Card key={idx} className="p-4 rounded-xl border-border" data-testid={`ad-form-${idx}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-sm font-semibold">Anúncio {idx + 1}</div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" className="h-7" onClick={() => duplicateAd(idx)} title="Duplicar"><Copy className="w-3 h-3" /></Button>
                      {ads.length > 1 && <Button size="sm" variant="ghost" className="h-7 text-destructive" onClick={() => removeAd(idx)} title="Remover"><Trash2 className="w-3 h-3" /></Button>}
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="space-y-1"><Label className="text-xs">Nome *</Label><Input value={ad.name} onChange={(e) => updateAd(idx, "name", e.target.value)} className="h-8 text-xs" /></div>
                    <div className="space-y-1"><Label className="text-xs">Página *</Label>
                      <Select value={ad.page_id} onValueChange={(v) => { const p = pages.find(pp => pp.id === v); updateAd(idx, "page_id", v); if (p?.instagram_business_account?.id) updateAd(idx, "instagram_actor_id", p.instagram_business_account.id); }}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={pagesLoaded ? "Selecione" : "Carregando..."} /></SelectTrigger>
                        <SelectContent>{pages.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1"><Label className="text-xs">Título * (40 chars)</Label><Input value={ad.headline} onChange={(e) => updateAd(idx, "headline", e.target.value)} maxLength={40} className="h-8 text-xs" /></div>
                    <div className="space-y-1"><Label className="text-xs">Texto principal *</Label><Textarea rows={2} value={ad.message} onChange={(e) => updateAd(idx, "message", e.target.value)} className="text-xs" /></div>
                    <div className="space-y-1"><Label className="text-xs">Descrição (30 chars)</Label><Input value={ad.description} onChange={(e) => updateAd(idx, "description", e.target.value)} maxLength={30} className="h-8 text-xs" /></div>
                    <div className="space-y-1"><Label className="text-xs">URL *</Label><Input value={ad.link} onChange={(e) => updateAd(idx, "link", e.target.value)} className="h-8 text-xs" /></div>
                    <div className="space-y-1"><Label className="text-xs">CTA</Label>
                      <Select value={ad.cta_type} onValueChange={(v) => updateAd(idx, "cta_type", v)}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>{CTAS.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select>
                    </div>
                    <div className="space-y-1"><Label className="text-xs">Mídia (imagem ou vídeo)</Label>
                      <label className="border border-dashed border-border rounded-lg px-3 py-2 text-xs cursor-pointer hover:bg-accent flex items-center gap-2">
                        <Upload className="w-3.5 h-3.5" />
                        <span>{ad.image_hash ? "Trocar mídia" : "Enviar imagem/vídeo"}</span>
                        <input type="file" accept="image/*,video/*" className="hidden" onChange={(e) => handleFile(idx, e.target.files?.[0])} />
                      </label>
                      {uploading === idx && <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-1"><Loader2 className="w-3 h-3 animate-spin" /> Enviando...</div>}
                      {ad.image_preview && <img src={ad.image_preview} alt="" className="w-full h-24 object-cover rounded-lg border mt-1" />}
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            {/* Preview panel */}
            <div className="lg:col-span-1">
              <div className="sticky top-0 space-y-3">
                <div className="text-sm font-semibold mb-2">Preview</div>
                {ads.filter(ad => ad.headline || ad.message).map((ad, idx) => (
                  <Card key={idx} className="rounded-xl overflow-hidden border-border">
                    {ad.image_preview ? (
                      <img src={ad.image_preview} alt="" className="w-full h-40 object-cover" />
                    ) : (
                      <div className="w-full h-40 bg-muted flex items-center justify-center"><Upload className="w-6 h-6 text-muted-foreground" /></div>
                    )}
                    <div className="p-3">
                      {ad.headline && <div className="text-sm font-semibold mb-1">{ad.headline}</div>}
                      {ad.message && <div className="text-xs text-muted-foreground line-clamp-3 mb-2">{ad.message}</div>}
                      {ad.description && <div className="text-[10px] text-muted-foreground">{ad.description}</div>}
                      <div className="mt-2 flex items-center justify-between">
                        {ad.link && <div className="text-[10px] text-muted-foreground truncate max-w-[60%]">{ad.link}</div>}
                        {ad.cta_type && <Badge variant="outline" className="text-[10px]">{ad.cta_type}</Badge>}
                      </div>
                    </div>
                  </Card>
                ))}
                {ads.every(ad => !ad.headline && !ad.message) && (
                  <div className="text-xs text-muted-foreground text-center py-10 border border-dashed border-border rounded-xl">Preencha os dados para ver o preview</div>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(2)} className="rounded-full"><ChevronLeft className="w-4 h-4 mr-1" /> Voltar</Button>
            <Button onClick={submitAll} disabled={submitting || done} className="rounded-full" data-testid="wiz-ad-submit">
              {submitting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Rocket className="w-4 h-4 mr-1" />}
              {done ? "Tudo criado!" : `Criar tudo (${ads.length} anúncio${ads.length > 1 ? "s" : ""})`}
            </Button>
          </div>
          {done && (
            <div className="mt-4 p-4 rounded-2xl bg-primary/10 border border-primary/20 text-sm">
              <div className="flex items-center gap-2 text-primary font-semibold mb-1"><CheckCircle2 className="w-4 h-4" /> Tudo criado!</div>
              <div className="text-xs text-muted-foreground">Campanha, conjunto e {resultIds.adIds?.length || 0} anúncio(s) criados com status Pausado.</div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
