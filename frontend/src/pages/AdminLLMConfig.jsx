import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Sparkles, Save, Loader2, Server, KeyRound, Info, CheckCircle2 } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const SEL = "w-full h-9 rounded-md border border-input bg-background px-3 text-sm";

export default function AdminLLMConfig() {
  const [cfg, setCfg] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get("/admin/llm-config");
      setCfg(data);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      const { providers: _p, ...body } = cfg;
      await api.post("/admin/llm-config", body);
      toast.success("Configuração de modelos salva e aplicada.");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally { setSaving(false); }
  };

  if (!cfg) return <div className="text-sm text-muted-foreground">Carregando…</div>;
  const set = (patch) => setCfg((c) => ({ ...c, ...patch }));
  const providers = cfg.providers || {};
  const prov = providers[cfg.provider] || {};
  const isCustom = !prov.base_url;

  // Select com os modelos do provedor + "Outro…" para digitar qualquer nome.
  const modelSelect = ({ label, field, options = [], placeholder }) => {
    const value = cfg[field] || "";
    const other = !options.includes(value);
    return (
      <div className="space-y-1.5">
        <Label>{label}</Label>
        {options.length > 0 && (
          <select className={SEL} value={other ? "__other" : value}
            onChange={(e) => set({ [field]: e.target.value === "__other" ? "" : e.target.value })}>
            {options.map((m) => <option key={m} value={m}>{m}</option>)}
            <option value="__other">Outro…</option>
          </select>
        )}
        {(other || options.length === 0) && (
          <Input value={value} onChange={(e) => set({ [field]: e.target.value })} placeholder={placeholder} />
        )}
      </div>
    );
  };

  const ModeCard = ({ value, icon: Icon, title, desc }) => {
    const active = cfg.mode === value;
    return (
      <button onClick={() => set({ mode: value })} className={`text-left p-4 rounded-2xl border-2 transition-colors ${active ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}>
        <div className="flex items-center gap-2 mb-1">
          <Icon className={`w-4 h-4 ${active ? "text-primary" : "text-muted-foreground"}`} />
          <span className="text-sm font-semibold">{title}</span>
        </div>
        <div className="text-xs text-muted-foreground leading-relaxed">{desc}</div>
      </button>
    );
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <Card className="p-6 rounded-2xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center"><Sparkles className="w-5 h-5 text-primary" /></div>
          <div>
            <div className="text-sm font-semibold">Modelos de IA da aplicação</div>
            <div className="text-xs text-muted-foreground">Escolha usar a LLM interna da Emergent ou suas próprias credenciais.</div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <ModeCard value="emergent" icon={Server} title="LLM interna (Emergent)" desc="Padrão. Usa a IA interna, exatamente como o sistema funcionava antes. Sem configuração." />
        <ModeCard value="custom" icon={KeyRound} title="Credenciais próprias" desc="Sua chave: Google Gemini, OpenAI, OpenRouter ou outro endpoint compatível." />
      </div>

      {cfg.mode === "emergent" ? (
        <Card className="p-6 rounded-2xl">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5 shrink-0" />
            <div className="text-sm text-muted-foreground leading-relaxed">
              O sistema está usando a <b className="text-foreground">IA interna da Emergent</b>, com os modelos padrão — <b>funciona como antes</b>, sem nada para configurar.
              Para usar sua própria chave (OpenAI etc.), selecione <b>Credenciais próprias</b> acima. Para voltar ao normal, basta selecionar esta opção e salvar.
            </div>
          </div>
        </Card>
      ) : (
        <Card className="p-6 rounded-2xl space-y-4">
          <div className="space-y-1.5">
            <Label>Provedor</Label>
            <select className={SEL} value={cfg.provider || "custom"}
              onChange={(e) => {
                const p = providers[e.target.value] || {};
                set({ provider: e.target.value, custom_model: p.text_models?.[0] || cfg.custom_model, custom_image_model: p.image_models?.[0] || cfg.custom_image_model });
              }}>
              {Object.entries(providers).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
            </select>
          </div>
          {isCustom && (
            <div className="space-y-1.5">
              <Label>Base URL</Label>
              <Input value={cfg.base_url || ""} onChange={(e) => set({ base_url: e.target.value })} placeholder="https://api.openai.com/v1" />
            </div>
          )}
          {modelSelect({ label: "Modelo de texto", field: "custom_model", options: prov.text_models, placeholder: "gpt-4o-mini" })}
          {modelSelect({ label: "Modelo de imagem", field: "custom_image_model", options: prov.image_models, placeholder: "gpt-image-1" })}
          <div className="space-y-1.5">
            <Label>API Key</Label>
            <Input type="password" value={cfg.api_key || ""} onChange={(e) => set({ api_key: e.target.value })}
              placeholder={cfg.provider === "gemini" ? "AIza…" : "sk-…"} />
          </div>
          <div className="flex items-start gap-2 text-[11px] text-muted-foreground">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            {cfg.provider === "gemini"
              ? <span>Gere a chave em <b>aistudio.google.com/apikey</b>. Texto e imagem passam a usar o Gemini.</span>
              : <span>Quando ativado, <b>tudo</b> (texto e imagem) usa estas credenciais. Em "Outro", informe qualquer endpoint compatível com OpenAI (Groq, DeepSeek, Ollama…).</span>}
          </div>
        </Card>
      )}

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving} className="rounded-full">
          {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />} Salvar e aplicar
        </Button>
      </div>
    </div>
  );
}
