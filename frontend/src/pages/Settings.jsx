import { useEffect, useState } from "react";
import { toast } from "sonner";
import { KeyRound, CheckCircle2, Unplug, Loader2, ExternalLink } from "lucide-react";

import api, { formatApiError } from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/contexts/AuthContext";

export default function Settings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ app_id: "", app_secret: "", access_token: "", ad_account_id: "" });

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/meta/settings");
      setSettings(data);
      if (data.app_id) setForm((f) => ({ ...f, app_id: data.app_id, ad_account_id: data.ad_account_id || "" }));
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
      const { data } = await api.post("/meta/settings", form);
      setSettings(data);
      toast.success("Meta Ads conectado com sucesso.");
      setForm((f) => ({ ...f, app_secret: "", access_token: "" }));
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || err.message);
    } finally {
      setSaving(false);
    }
  };

  const disconnect = async () => {
    if (!confirm("Desconectar sua conta Meta Ads? As chaves salvas serão removidas.")) return;
    await api.delete("/meta/settings");
    setSettings({ connected: false });
    toast.success("Desconectado.");
  };

  return (
    <div className="space-y-6 max-w-3xl" data-testid="settings-page">
      <div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Configurações</div>
        <h2 className="text-2xl font-semibold tracking-tight">Conta e integrações</h2>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-primary" />
            <div>
              <div className="text-sm font-semibold">Meta Ads</div>
              <div className="text-xs text-muted-foreground">
                Conecte suas credenciais do Meta for Developers.
              </div>
            </div>
            <div className="ml-auto">
              {settings?.connected ? (
                <Badge className="bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/30">
                  <CheckCircle2 className="w-3 h-3 mr-1" /> Conectado
                </Badge>
              ) : (
                <Badge variant="outline">Não conectado</Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {settings?.connected && (
            <div className="text-xs text-muted-foreground border border-border rounded-md p-3 font-mono">
              <div>Conta: <span className="text-foreground">{settings.ad_account_name || "—"}</span></div>
              <div>Ad Account ID: <span className="text-foreground">{settings.ad_account_id}</span></div>
              <div>Moeda: {settings.currency || "—"}</div>
              <div>Atualizado em: {settings.updated_at ? new Date(settings.updated_at).toLocaleString() : "—"}</div>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>App ID</Label>
              <Input
                value={form.app_id}
                onChange={(e) => setForm({ ...form, app_id: e.target.value })}
                placeholder="1234567890"
                data-testid="settings-app-id-input"
              />
            </div>
            <div className="space-y-1.5">
              <Label>App Secret</Label>
              <Input
                type="password"
                value={form.app_secret}
                onChange={(e) => setForm({ ...form, app_secret: e.target.value })}
                placeholder="•••••••••••••"
                data-testid="settings-app-secret-input"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Access Token</Label>
              <Input
                type="password"
                value={form.access_token}
                onChange={(e) => setForm({ ...form, access_token: e.target.value })}
                placeholder="EAAG… (long-lived ou system user)"
                data-testid="settings-access-token-input"
              />
              <div className="text-[11px] text-muted-foreground">
                Escopos mínimos: <span className="font-mono">ads_read</span>,{" "}
                <span className="font-mono">ads_management</span>.
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Ad Account ID</Label>
              <Input
                value={form.ad_account_id}
                onChange={(e) => setForm({ ...form, ad_account_id: e.target.value })}
                placeholder="act_1234567890 ou 1234567890"
                data-testid="settings-ad-account-input"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={save} disabled={saving || !form.app_id || !form.app_secret || !form.access_token || !form.ad_account_id} data-testid="settings-save-btn">
              {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
              Conectar & validar
            </Button>
            {settings?.connected && (
              <Button variant="outline" onClick={disconnect} data-testid="settings-disconnect-btn">
                <Unplug className="w-4 h-4 mr-1" /> Desconectar
              </Button>
            )}
            <Button variant="ghost" asChild>
              <a
                href="https://developers.facebook.com/apps"
                target="_blank"
                rel="noreferrer"
                data-testid="settings-open-meta-devs"
              >
                Abrir Meta for Developers <ExternalLink className="w-3.5 h-3.5 ml-1" />
              </a>
            </Button>
          </div>
          <Separator />
          <div className="text-xs text-muted-foreground leading-relaxed">
            <b>Onde encontrar:</b> App ID e App Secret ficam em <b>My Apps → Settings → Basic</b>. Um
            Access Token pode ser gerado no <b>Graph API Explorer</b> (para testes) ou como System
            User Token (produção). O Ad Account ID está no Ads Manager (formato <span className="font-mono">act_XXXXXXXXXXX</span>).
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <div className="text-sm font-semibold">Perfil</div>
          <div className="text-xs text-muted-foreground">Informações da sua conta na plataforma</div>
        </CardHeader>
        <CardContent className="text-sm space-y-1">
          <div><span className="text-muted-foreground">Nome:</span> {user?.name}</div>
          <div><span className="text-muted-foreground">Email:</span> {user?.email}</div>
        </CardContent>
      </Card>
    </div>
  );
}
