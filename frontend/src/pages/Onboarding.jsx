import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Rocket, ChevronRight, ChevronLeft, KeyRound, Globe, CheckCircle2,
  Loader2, ExternalLink, Copy, HelpCircle,
} from "lucide-react";

import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const STEPS = [
  { title: "Bem-vindo ao FlowPilot", icon: Rocket },
  { title: "Conecte sua conta Meta Ads", icon: Globe },
  { title: "Tudo pronto!", icon: CheckCircle2 },
];

function MetaTutorial() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1 text-xs text-primary hover:underline">
        <HelpCircle className="w-3.5 h-3.5" />
        {open ? "Ocultar tutorial" : "Como gerar minhas credenciais Meta Ads?"}
      </button>
      {open && (
        <div className="mt-3 p-4 bg-muted/50 rounded-xl text-xs space-y-3 leading-relaxed">
          <div className="font-semibold text-sm">Passo a passo para obter o Access Token e Ad Account ID</div>
          <ol className="list-decimal pl-4 space-y-2">
            <li>
              <strong>Acesse o Business Manager:</strong> Vá para{" "}
              <a href="https://business.facebook.com" target="_blank" rel="noreferrer" className="text-primary underline">
                business.facebook.com
              </a>{" "}
              e faça login com sua conta do Facebook.
            </li>
            <li>
              <strong>Crie um App:</strong> Acesse{" "}
              <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer" className="text-primary underline">
                developers.facebook.com/apps
              </a>, clique em "Criar App", selecione "Business" e siga os passos.
            </li>
            <li>
              <strong>Gere o Access Token:</strong> No app criado, vá em{" "}
              <a href="https://developers.facebook.com/tools/explorer" target="_blank" rel="noreferrer" className="text-primary underline">
                Graph API Explorer
              </a>. Selecione seu app, clique em "Generate Access Token" e conceda as permissões:
              <ul className="list-disc pl-4 mt-1 space-y-0.5 text-muted-foreground">
                <li>ads_management</li>
                <li>ads_read</li>
                <li>read_insights</li>
                <li>business_management</li>
              </ul>
            </li>
            <li>
              <strong>Copie o Access Token:</strong> O token gerado aparecerá no campo "Access Token". Copie-o.
            </li>
            <li>
              <strong>Encontre seu Ad Account ID:</strong> Vá em{" "}
              <a href="https://business.facebook.com/settings/ad-accounts" target="_blank" rel="noreferrer" className="text-primary underline">
                Configurações do Business &gt; Contas de anúncio
              </a>. O ID é o número no formato <code className="bg-muted px-1 rounded">act_XXXXXXXXXXXX</code>.
            </li>
            <li>
              <strong>Token de longa duração (recomendado):</strong> No Graph API Explorer, clique em "info" ao lado do token
              e depois em "Extend Access Token" para gerar um token que dura 60 dias.
            </li>
          </ol>
          <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-yellow-700 dark:text-yellow-400">
            <strong>Importante:</strong> Nunca compartilhe seu Access Token. Ele dá acesso total à sua conta de anúncios.
            O FlowPilot armazena seu token com criptografia AES-256.
          </div>
        </div>
      )}
    </div>
  );
}

export default function Onboarding() {
  const navigate = useNavigate();
  const { signin } = useAuth();
  const [step, setStep] = useState(0);
  const [accessToken, setAccessToken] = useState("");
  const [adAccountId, setAdAccountId] = useState("");
  const [saving, setSaving] = useState(false);

  const saveCredentials = async () => {
    if (!accessToken.trim() || !adAccountId.trim()) {
      toast.error("Preencha ambos os campos.");
      return;
    }
    setSaving(true);
    try {
      await api.post("/meta/settings", {
        access_token: accessToken.trim(),
        ad_account_id: adAccountId.trim(),
      });
      toast.success("Conta Meta Ads conectada com sucesso!");
      setStep(2);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setSaving(false);
    }
  };

  // Marca concluído E atualiza o user no contexto, senão o OnboardingGate
  // redireciona de volta pra cá (user.onboarding_completed ainda seria false).
  const done = async () => {
    try {
      await api.post("/auth/complete-onboarding");
      const { data } = await api.get("/auth/me");
      signin(data, localStorage.getItem("mfa_token"));
    } catch {}
    navigate("/app/copilot");
  };

  const finish = done;
  const skip = done;

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-background to-muted/30">
      <Card className="w-full max-w-xl p-8 rounded-3xl shadow-xl space-y-6" data-testid="onboarding">
        {/* Progress */}
        <div className="flex items-center justify-center gap-2">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                i <= step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}>
                {i < step ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div className={`w-12 h-0.5 ${i < step ? "bg-primary" : "bg-muted"}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step 0: Welcome */}
        {step === 0 && (
          <div className="text-center space-y-4">
            <Rocket className="w-12 h-12 text-primary mx-auto" />
            <div className="text-xl font-bold">Bem-vindo ao FlowPilot!</div>
            <div className="text-sm text-muted-foreground max-w-md mx-auto">
              Vamos configurar sua conta em poucos passos. Primeiro, conecte sua conta de anúncios Meta
              para que o FlowPilot possa analisar e otimizar suas campanhas.
            </div>
            <div className="flex gap-3 justify-center pt-2">
              <Button variant="ghost" onClick={skip}>Pular por agora</Button>
              <Button onClick={() => setStep(1)}>
                Começar <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 1: Meta Ads credentials */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="text-center">
              <Globe className="w-10 h-10 text-primary mx-auto mb-2" />
              <div className="text-lg font-bold">Conecte sua conta Meta Ads</div>
              <div className="text-xs text-muted-foreground">
                Insira suas credenciais para conectar o FlowPilot à sua conta de anúncios.
              </div>
            </div>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Access Token</Label>
                <Input
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  placeholder="EAAxxxxxxxxxxxxxxx..."
                  type="password"
                  data-testid="onboarding-token"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Ad Account ID</Label>
                <Input
                  value={adAccountId}
                  onChange={(e) => setAdAccountId(e.target.value)}
                  placeholder="act_1234567890"
                  data-testid="onboarding-account"
                />
              </div>
            </div>
            <MetaTutorial />
            <div className="flex gap-3 justify-between pt-2">
              <Button variant="ghost" onClick={() => setStep(0)}>
                <ChevronLeft className="w-4 h-4 mr-1" /> Voltar
              </Button>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={skip}>Pular</Button>
                <Button onClick={saveCredentials} disabled={saving}>
                  {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <KeyRound className="w-4 h-4 mr-1" />}
                  Conectar
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Done */}
        {step === 2 && (
          <div className="text-center space-y-4">
            <CheckCircle2 className="w-14 h-14 text-green-500 mx-auto" />
            <div className="text-xl font-bold">Tudo pronto!</div>
            <div className="text-sm text-muted-foreground">
              Sua conta Meta Ads foi conectada. O FlowPilot já está analisando seus dados.
              Explore o dashboard e descubra oportunidades de otimização.
            </div>
            <Button onClick={finish} size="lg" className="rounded-full">
              Ir para o Dashboard <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

export { MetaTutorial };
