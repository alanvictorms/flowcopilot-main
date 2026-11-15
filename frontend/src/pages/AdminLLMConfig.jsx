import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Sparkles, Save, Loader2, Server, KeyRound, Info, CheckCircle2 } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
      await api.post("/admin/llm-config", cfg);
      toast.success("Configuração de modelos salva e aplicada.");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally { setSaving(false); }
  };

  if (!cfg) return <div className="text-sm text-muted-foreground">Carregando…</div>;
  const set = (patch) => setCfg((c) => ({ ...c, ...patch }));

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
        <ModeCard value="custom" icon={KeyRound} title="Credenciais próprias" desc="Endpoint compatível com a API da OpenAI (OpenAI, OpenRouter, Groq, DeepSeek, Ollama…)." />
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
          <div className="text-sm font-semibold">Endpoint compatível com OpenAI</div>
          <div className="space-y-1.5">
            <Label>Base URL</Label>
            <Input value={cfg.base_url || ""} onChange={(e) => set({ base_url: e.target.value })} placeholder="https://api.openai.com/v1" />
          </div>
          <div className="space-y-1.5">
            <Label>Modelo de texto</Label>
            <Input value={cfg.custom_model || ""} onChange={(e) => set({ custom_model: e.target.value })} placeholder="gpt-4o-mini" />
          </div>
          <div className="space-y-1.5">
            <Label>Modelo de imagem</Label>
            <Input value={cfg.custom_image_model || ""} onChange={(e) => set({ custom_image_model: e.target.value })} placeholder="gpt-image-1" />
          </div>
          <div className="space-y-1.5">
            <Label>API Key</Label>
            <Input type="password" value={cfg.api_key || ""} onChange={(e) => set({ api_key: e.target.value })} placeholder="sk-…" />
          </div>
          <div className="flex items-start gap-2 text-[11px] text-muted-foreground">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            Exemplos: OpenAI (api.openai.com/v1, imagem <span className="font-mono">gpt-image-1</span> ou <span className="font-mono">dall-e-3</span>), OpenRouter (openrouter.ai/api/v1 — acesso a Claude, Gemini e mais), Groq, DeepSeek, Ollama local. Quando ativado, <b>tudo</b> (texto e imagem) usa estas credenciais.
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
