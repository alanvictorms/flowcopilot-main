import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  KeyRound, CheckCircle2, Unplug, Loader2, ExternalLink, User,
  Shield, Link2, Phone, Lock,
} from "lucide-react";

import api, { formatApiError } from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";

export default function Profile() {
  const { user } = useAuth();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ app_id: "", app_secret: "", access_token: "", ad_account_id: "" });
  const [phone, setPhone] = useState("");
  const [savingPhone, setSavingPhone] = useState(false);
  const [pwForm, setPwForm] = useState({ current: "", new_password: "", confirm: "" });
  const [savingPw, setSavingPw] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/meta/settings");
      setSettings(data);
      if (data.app_id) setForm((f) => ({ ...f, app_id: data.app_id, ad_account_id: data.ad_account_id || "" }));
    } catch (err) {
      if (err.response?.status !== 404) toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const saveMeta = async () => {
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

  const changePassword = async () => {
    if (!pwForm.current || !pwForm.new_password) return toast.error("Preencha todos os campos.");
    if (pwForm.new_password !== pwForm.confirm) return toast.error("As senhas não conferem.");
    if (pwForm.new_password.length < 6) return toast.error("A nova senha deve ter pelo menos 6 caracteres.");
    setSavingPw(true);
    try {
      await api.post("/auth/change-password", {
        current_password: pwForm.current,
        new_password: pwForm.new_password,
      });
      toast.success("Senha alterada com sucesso.");
      setPwForm({ current: "", new_password: "", confirm: "" });
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setSavingPw(false);
    }
  };

  const updatePhone = async () => {
    setSavingPhone(true);
    try {
      await api.patch("/auth/profile", { phone });
      toast.success("Telefone atualizado.");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setSavingPhone(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="profile-page">
      <div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Perfil</div>
        <h2 className="text-2xl font-semibold tracking-tight">Minha conta</h2>
      </div>

      <Tabs defaultValue="account" className="w-full">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="account" data-testid="tab-account" className="gap-1.5">
            <User className="w-3.5 h-3.5" /> Conta
          </TabsTrigger>
          <TabsTrigger value="security" data-testid="tab-security" className="gap-1.5">
            <Shield className="w-3.5 h-3.5" /> Segurança
          </TabsTrigger>
          <TabsTrigger value="integration" data-testid="tab-integration" className="gap-1.5">
            <Link2 className="w-3.5 h-3.5" /> Integração
          </TabsTrigger>
        </TabsList>

        {/* CONTA */}
        <TabsContent value="account" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="text-sm font-semibold">Informações pessoais</div>
              <div className="text-xs text-muted-foreground">Dados da sua conta na plataforma</div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Nome</Label>
                  <Input value={user?.name || ""} disabled className="bg-muted" />
                  <div className="text-[10px] text-muted-foreground">Nome não pode ser alterado.</div>
                </div>
                <div className="space-y-1.5">
                  <Label>E-mail</Label>
                  <Input value={user?.email || ""} disabled className="bg-muted" />
                  <div className="text-[10px] text-muted-foreground">E-mail não pode ser alterado.</div>
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> Telefone</Label>
                  <div className="flex gap-2">
                    <Input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="(99) 99999-9999"
                      data-testid="profile-phone"
                    />
                    <Button size="sm" onClick={updatePhone} disabled={savingPhone} data-testid="save-phone-btn">
                      {savingPhone ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Salvar"}
                    </Button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Cadastrado em</Label>
                  <Input value={user?.created_at ? new Date(user.created_at).toLocaleDateString("pt-BR") : "—"} disabled className="bg-muted" />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* SEGURANÇA */}
        <TabsContent value="security" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-primary" />
                <div>
                  <div className="text-sm font-semibold">Alterar senha</div>
                  <div className="text-xs text-muted-foreground">Defina uma nova senha para sua conta</div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label>Senha atual</Label>
                <Input
                  type="password"
                  value={pwForm.current}
                  onChange={(e) => setPwForm({ ...pwForm, current: e.target.value })}
                  data-testid="pw-current"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Nova senha</Label>
                  <Input
                    type="password"
                    value={pwForm.new_password}
                    onChange={(e) => setPwForm({ ...pwForm, new_password: e.target.value })}
                    data-testid="pw-new"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Confirmar nova senha</Label>
                  <Input
                    type="password"
                    value={pwForm.confirm}
                    onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })}
                    data-testid="pw-confirm"
                  />
                </div>
              </div>
              <Button onClick={changePassword} disabled={savingPw} data-testid="change-pw-btn">
                {savingPw ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                Alterar senha
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" />
                <div>
                  <div className="text-sm font-semibold">Autenticação de dois fatores (2FA)</div>
                  <div className="text-xs text-muted-foreground">Adicione uma camada extra de segurança</div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-xs text-muted-foreground py-4">
                Em breve. A autenticação de dois fatores via aplicativo autenticador será habilitada em futuras atualizações.
              </div>
              <Button variant="outline" disabled>
                <Shield className="w-4 h-4 mr-1" /> Ativar 2FA (em breve)
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* INTEGRAÇÃO */}
        <TabsContent value="integration" className="mt-4 space-y-4">
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
                  <Input value={form.app_id} onChange={(e) => setForm({ ...form, app_id: e.target.value })} placeholder="1234567890" data-testid="settings-app-id-input" />
                </div>
                <div className="space-y-1.5">
                  <Label>App Secret</Label>
                  <Input type="password" value={form.app_secret} onChange={(e) => setForm({ ...form, app_secret: e.target.value })} placeholder="***" data-testid="settings-app-secret-input" />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Access Token</Label>
                  <Input type="password" value={form.access_token} onChange={(e) => setForm({ ...form, access_token: e.target.value })} placeholder="EAAG…" data-testid="settings-access-token-input" />
                  <div className="text-[10px] text-muted-foreground">
                    Escopos: <span className="font-mono">ads_read</span>, <span className="font-mono">ads_management</span>.
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Ad Account ID</Label>
                  <Input value={form.ad_account_id} onChange={(e) => setForm({ ...form, ad_account_id: e.target.value })} placeholder="act_123…" data-testid="settings-ad-account-input" />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={saveMeta} disabled={saving || !form.app_id || !form.app_secret || !form.access_token || !form.ad_account_id} data-testid="settings-save-btn">
                  {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                  Conectar & validar
                </Button>
                {settings?.connected && (
                  <Button variant="outline" onClick={disconnect} data-testid="settings-disconnect-btn">
                    <Unplug className="w-4 h-4 mr-1" /> Desconectar
                  </Button>
                )}
                <Button variant="ghost" asChild>
                  <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer" data-testid="settings-open-meta-devs">
                    Abrir Meta for Developers <ExternalLink className="w-3.5 h-3.5 ml-1" />
                  </a>
                </Button>
              </div>
              <Separator />
              <div className="text-xs text-muted-foreground leading-relaxed">
                <b>Onde encontrar:</b> App ID e App Secret em <b>My Apps → Settings → Basic</b>. Access Token no <b>Graph API Explorer</b> ou como System User Token.
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
