import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Power, Save, Loader2, Eye, CheckCircle2, Zap, Info } from "lucide-react";

import api, { formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

const ACTIONS = [
  { value: "pause", label: "Pausar campanha/anúncio" },
  { value: "activate", label: "Ativar campanha/anúncio" },
  { value: "change_budget", label: "Alterar orçamento" },
  { value: "notify", label: "Apenas notificar" },
];

const MODES = [
  {
    value: "recommend",
    icon: Eye,
    title: "Somente recomendação",
    desc: "O agente analisa suas campanhas e sugere o que fazer. Nunca executa nada sozinho.",
  },
  {
    value: "approve",
    icon: CheckCircle2,
    title: "Requer aprovação",
    desc: "O agente propõe as ações e envia para a sua fila de Aprovações. Você aprova antes de aplicar.",
  },
  {
    value: "auto",
    icon: Zap,
    title: "Automático",
    desc: "O agente aplica as ações sozinho, sempre respeitando os limites de segurança definidos abaixo.",
  },
];

export default function Autonomy() {
  const [s, setS] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/autonomy/settings");
      setS(data);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/autonomy/settings", s);
      toast.success("Configurações de autonomia salvas.");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setSaving(false);
    }
  };

  const toggleKill = async () => {
    try {
      const { data } = await api.post("/autonomy/kill-switch", null, { params: { engage: !s.kill_switch } });
      setS({ ...s, kill_switch: data.kill_switch });
      toast.success(data.kill_switch ? "Kill switch ATIVADO — automação pausada." : "Kill switch desativado.");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  const toggleAction = (a, list) => {
    const cur = s[list] || [];
    setS({ ...s, [list]: cur.includes(a) ? cur.filter((x) => x !== a) : [...cur, a] });
  };

  if (loading || !s) return <div className="text-sm text-muted-foreground">Carregando…</div>;

  // Modo "somente recomendação": o agente nunca executa, então as configs de
  // execução (limites, guardrails, stop-loss, ações) ficam desabilitadas.
  const execDisabled = s.mode === "recommend";

  return (
    <div className="space-y-6" data-testid="autonomy-page">
      {/* Kill switch — sempre ativo */}
      <Card className={`p-6 rounded-2xl border-2 ${s.kill_switch ? "border-destructive" : "border-transparent"}`}>
        <div className="flex items-center gap-4">
          <div className={`w-14 h-14 rounded-full flex items-center justify-center ${s.kill_switch ? "bg-destructive/10" : "bg-primary/10"}`}>
            <Power className={`w-6 h-6 ${s.kill_switch ? "text-destructive" : "text-primary"}`} />
          </div>
          <div className="flex-1">
            <div className="text-lg font-semibold">Kill Switch</div>
            <div className="text-sm text-muted-foreground">
              {s.kill_switch ? "Automação parada. Nenhuma ação da IA será executada." : "Sistema operando normalmente."}
            </div>
          </div>
          <Button variant={s.kill_switch ? "destructive" : "outline"} onClick={toggleKill} data-testid="autonomy-kill-btn">
            {s.kill_switch ? "Desativar Kill Switch" : "Pausar tudo"}
          </Button>
        </div>
      </Card>

      {/* Modo de operação — cards clicáveis */}
      <div>
        <div className="text-lg font-semibold mb-1">Modo de operação</div>
        <div className="text-xs text-muted-foreground mb-4">Define até onde o agente pode ir sozinho.</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {MODES.map((m) => {
            const active = s.mode === m.value;
            const Icon = m.icon;
            return (
              <button
                key={m.value}
                onClick={() => setS({ ...s, mode: m.value })}
                data-testid={`autonomy-mode-${m.value}`}
                className={`text-left p-4 rounded-2xl border-2 transition-colors ${
                  active ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  {active && <CheckCircle2 className="w-4 h-4 text-primary ml-auto" />}
                </div>
                <div className="text-sm font-semibold">{m.title}</div>
                <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{m.desc}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Aviso quando em modo recomendação */}
      {execDisabled && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-muted/50 border border-border" data-testid="autonomy-recommend-note">
          <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <div className="text-sm text-muted-foreground">
            No modo <b className="text-foreground">somente recomendação</b> o agente apenas analisa e sugere.
            As configurações de execução abaixo ficam desativadas — elas só valem nos modos
            <b className="text-foreground"> Requer aprovação</b> e <b className="text-foreground">Automático</b>.
          </div>
        </div>
      )}

      {/* Configurações de execução — desativadas em modo recomendação */}
      <fieldset disabled={execDisabled} className={`min-w-0 border-0 p-0 m-0 space-y-6 transition-opacity ${execDisabled ? "opacity-50" : ""}`}>
        <Card className="p-6 rounded-2xl">
          <div className="text-lg font-semibold mb-4">Limites de segurança</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Máximo de aumento de orçamento (%)</Label>
              <Input type="number" value={s.max_budget_increase_pct} onChange={(e) => setS({ ...s, max_budget_increase_pct: Number(e.target.value) })} data-testid="autonomy-max-increase" />
            </div>
            <div className="space-y-1.5">
              <Label>Máximo de redução de orçamento (%)</Label>
              <Input type="number" value={s.max_budget_decrease_pct} onChange={(e) => setS({ ...s, max_budget_decrease_pct: Number(e.target.value) })} data-testid="autonomy-max-decrease" />
            </div>
            <div className="space-y-1.5">
              <Label>Mínimo de dados (impressões) antes de decidir</Label>
              <Input type="number" value={s.min_data_points} onChange={(e) => setS({ ...s, min_data_points: Number(e.target.value) })} />
            </div>
            <div className="space-y-1.5">
              <Label>Cooldown entre ações (minutos)</Label>
              <Input type="number" value={s.cooldown_minutes} onChange={(e) => setS({ ...s, cooldown_minutes: Number(e.target.value) })} />
            </div>
          </div>
        </Card>

        <Card className="p-6 rounded-2xl">
          <div className="text-lg font-semibold mb-1">Guardrails do Control Plane</div>
          <div className="text-xs text-muted-foreground mb-4">
            Toda ação (IA, regra ou manual) passa por essas validações antes de chegar à Meta.
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Conversões mínimas para evidência</Label>
              <Input type="number" value={s.min_conversions ?? 5} onChange={(e) => setS({ ...s, min_conversions: Number(e.target.value) })} data-testid="autonomy-min-conversions" />
            </div>
            <div className="space-y-1.5">
              <Label>Teto de ações por 24h</Label>
              <Input type="number" value={s.max_actions_per_day ?? 20} onChange={(e) => setS({ ...s, max_actions_per_day: Number(e.target.value) })} data-testid="autonomy-max-actions" />
            </div>
            <div className="space-y-1.5">
              <Label>Janela de pós-verificação (horas)</Label>
              <Input type="number" value={s.observation_hours ?? 24} onChange={(e) => setS({ ...s, observation_hours: Number(e.target.value) })} />
            </div>
            <div className="space-y-1.5">
              <Label>Degradação que dispara rollback (%)</Label>
              <Input type="number" value={s.rollback_degradation_pct ?? 30} onChange={(e) => setS({ ...s, rollback_degradation_pct: Number(e.target.value) })} />
            </div>
            <div className="space-y-1.5">
              <Label>Variação de orçamento que exige humano (%)</Label>
              <Input type="number" value={s.approval_budget_change_pct ?? 25} onChange={(e) => setS({ ...s, approval_budget_change_pct: Number(e.target.value) })} />
            </div>
          </div>
        </Card>

        <Card className="p-6 rounded-2xl">
          <div className="text-lg font-semibold mb-1">Proteção financeira (stop-loss)</div>
          <div className="text-xs text-muted-foreground mb-4">
            O orquestrador propõe pausas automáticas quando esses limites são violados.
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Stop-loss de gasto diário da conta (R$ · 0 = desativado)</Label>
              <Input type="number" value={s.stop_loss_daily_spend ?? 0} onChange={(e) => setS({ ...s, stop_loss_daily_spend: Number(e.target.value) })} data-testid="autonomy-stop-loss" />
            </div>
            <div className="space-y-1.5">
              <Label>Gasto sem nenhuma conversão que dispara pausa (R$)</Label>
              <Input type="number" value={s.stop_loss_zero_conversion_spend ?? 100} onChange={(e) => setS({ ...s, stop_loss_zero_conversion_spend: Number(e.target.value) })} />
            </div>
          </div>
        </Card>

        <Card className="p-6 rounded-2xl">
          <div className="text-lg font-semibold mb-1">Ações permitidas</div>
          <div className="text-xs text-muted-foreground mb-4">
            Marque quais ações a IA pode aplicar em modo automático.
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {ACTIONS.map((a) => (
              <label key={a.value} className="flex items-center justify-between p-3 rounded-xl border border-border hover:bg-accent cursor-pointer">
                <div className="text-sm font-medium">{a.label}</div>
                <Switch checked={(s.allowed_actions || []).includes(a.value)} onCheckedChange={() => toggleAction(a.value, "allowed_actions")} data-testid={`autonomy-allow-${a.value}`} />
              </label>
            ))}
          </div>
        </Card>

        <Card className="p-6 rounded-2xl">
          <div className="text-lg font-semibold mb-1">Exige aprovação manual</div>
          <div className="text-xs text-muted-foreground mb-4">Ações críticas nunca serão executadas sem aprovação.</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {ACTIONS.map((a) => (
              <label key={a.value} className="flex items-center justify-between p-3 rounded-xl border border-border hover:bg-accent cursor-pointer">
                <div className="text-sm font-medium">{a.label}</div>
                <Switch checked={(s.require_approval_actions || []).includes(a.value)} onCheckedChange={() => toggleAction(a.value, "require_approval_actions")} />
              </label>
            ))}
          </div>
        </Card>
      </fieldset>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving} data-testid="autonomy-save-btn" className="rounded-full">
          {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
          Salvar
        </Button>
      </div>
    </div>
  );
}
