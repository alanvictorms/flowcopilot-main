import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bot, Save, Loader2, AlertTriangle } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const normalizeLang = (l) => (String(l || "").toLowerCase().startsWith("zh") ? "zh-CN" : "en-US");

export default function AdminPageAgent() {
  const [cfg, setCfg] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get("/page-agent/admin/config");
      setCfg(data);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.post("/page-agent/admin/config", cfg);
      toast.success("Configuração salva. Recarregue a página para aplicar.");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setSaving(false);
    }
  };

  if (!cfg) return <div className="text-sm text-muted-foreground">Carregando…</div>;
  const set = (patch) => setCfg((c) => ({ ...c, ...patch }));

  return (
    <div className="space-y-4 max-w-2xl">
      <Card className="p-6 rounded-2xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Bot className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold">Agente da Página (experimental)</div>
            <div className="text-xs text-muted-foreground">
              Integra o page-agent: um agente que vive na página e executa navegação e tarefas por comando.
            </div>
          </div>
          <Switch checked={!!cfg.enabled} onCheckedChange={(v) => set({ enabled: v })} data-testid="page-agent-enabled" />
        </div>
      </Card>

      <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30">
        <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
        <div className="text-xs text-muted-foreground leading-relaxed">
          Ao ligar, o agente é carregado no navegador de quem usa o app. Se você informar uma chave de modelo,
          ela é entregue ao navegador (use uma <b>chave de teste dedicada</b>). Sem chave, ele usa a API de
          demonstração gratuita do page-agent. Para produção, o ideal é um proxy no backend.
        </div>
      </div>

      <Card className="p-6 rounded-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">Usar API de demonstração (grátis)</div>
            <div className="text-xs text-muted-foreground">Deixe ligado para testar sem chave própria.</div>
          </div>
          <Switch checked={!!cfg.use_demo} onCheckedChange={(v) => set({ use_demo: v })} />
        </div>

        <div className="space-y-1.5">
          <Label>Idioma</Label>
          <Select value={normalizeLang(cfg.language)} onValueChange={(v) => set({ language: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="en-US">English (en-US)</SelectItem>
              <SelectItem value="zh-CN">中文 (zh-CN)</SelectItem>
            </SelectContent>
          </Select>
          <div className="text-[11px] text-muted-foreground">
            O page-agent suporta só <b>en-US</b> e <b>zh-CN</b> (não tem pt-BR ainda). Após salvar,
            recarregue com <b>Ctrl+Shift+R</b> — o script fica em cache.
          </div>
        </div>

        {!cfg.use_demo && (
          <>
            <div className="space-y-1.5">
              <Label>Modelo</Label>
              <Input value={cfg.model || ""} onChange={(e) => set({ model: e.target.value })} placeholder="ex: gpt-4o-mini" />
            </div>
            <div className="space-y-1.5">
              <Label>Base URL (compatível OpenAI)</Label>
              <Input value={cfg.base_url || ""} onChange={(e) => set({ base_url: e.target.value })} placeholder="https://api.openai.com/v1" />
            </div>
            <div className="space-y-1.5">
              <Label>API Key</Label>
              <Input type="password" value={cfg.api_key || ""} onChange={(e) => set({ api_key: e.target.value })} placeholder="sk-…" />
            </div>
            <div className="text-[11px] text-amber-600 dark:text-amber-400 leading-relaxed">
              Para OpenAI: Base URL <span className="font-mono">https://api.openai.com/v1</span>, Modelo <span className="font-mono">gpt-4o-mini</span>.
              Atenção: o agente chama o modelo <b>direto do navegador</b> — a OpenAI pode bloquear por CORS. Se o painel abrir
              mas não responder, provavelmente é CORS, e aí o caminho é o proxy no nosso backend.
            </div>
          </>
        )}

        <Button onClick={save} disabled={saving} className="rounded-full">
          {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />} Salvar
        </Button>
      </Card>
    </div>
  );
}
