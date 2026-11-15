import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Building2, Plus, Loader2, RefreshCw, AlertTriangle, Sparkles, Trash2,
} from "lucide-react";

import api, { formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

const emptyClient = {
  name: "", notes: "", brand_color: "#a3e635",
  app_id: "", app_secret: "", access_token: "", ad_account_id: "",
  monthly_target_spend: 0, monthly_target_roas: 2,
};

export default function Agency() {
  const [clients, setClients] = useState([]);
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(emptyClient);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [c, o] = await Promise.all([
        api.get("/agency/clients"),
        api.get("/agency/overview"),
      ]);
      setClients(c.data || []);
      setOverview(o.data);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const scan = async () => {
    setScanning(true);
    try {
      const { data } = await api.get("/agency/overview");
      setOverview(data);
      toast.success("Snapshot atualizado.");
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
    finally { setScanning(false); }
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.post("/agency/clients", { ...draft, monthly_target_spend: Number(draft.monthly_target_spend), monthly_target_roas: Number(draft.monthly_target_roas) });
      toast.success("Cliente conectado.");
      setOpen(false);
      setDraft(emptyClient);
      load();
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
    finally { setSaving(false); }
  };

  const del = async (id) => {
    if (!confirm("Remover este cliente? As credenciais serão apagadas.")) return;
    await api.delete(`/agency/clients/${id}`);
    load();
  };

  const t = overview?.totals;

  return (
    <div className="space-y-6" data-testid="agency-page">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">Agency</div>
          <h2 className="text-2xl font-semibold tracking-tight">Command Center</h2>
          <p className="text-xs text-muted-foreground mt-1">Gerencie múltiplos clientes e Ad Accounts em uma central única.</p>
        </div>
        <Button variant="outline" size="icon" className="rounded-full" onClick={scan} disabled={scanning}>
          <RefreshCw className={`w-4 h-4 ${scanning ? "animate-spin" : ""}`} />
        </Button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="rounded-full" data-testid="agency-add-btn"><Plus className="w-4 h-4 mr-1" /> Novo cliente</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>Conectar cliente</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5 md:col-span-2"><Label>Nome do cliente *</Label>
                  <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} data-testid="agency-client-name" />
                </div>
                <div className="space-y-1.5 md:col-span-2"><Label>Notas</Label>
                  <Textarea rows={2} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
                </div>
                <div className="space-y-1.5"><Label>Cor da marca</Label>
                  <Input type="color" value={draft.brand_color} onChange={(e) => setDraft({ ...draft, brand_color: e.target.value })} />
                </div>
                <div className="space-y-1.5"><Label>Meta App ID</Label>
                  <Input value={draft.app_id} onChange={(e) => setDraft({ ...draft, app_id: e.target.value })} />
                </div>
                <div className="space-y-1.5"><Label>Meta App Secret</Label>
                  <Input type="password" value={draft.app_secret} onChange={(e) => setDraft({ ...draft, app_secret: e.target.value })} />
                </div>
                <div className="space-y-1.5"><Label>Access Token</Label>
                  <Input type="password" value={draft.access_token} onChange={(e) => setDraft({ ...draft, access_token: e.target.value })} />
                </div>
                <div className="space-y-1.5 md:col-span-2"><Label>Ad Account ID</Label>
                  <Input value={draft.ad_account_id} onChange={(e) => setDraft({ ...draft, ad_account_id: e.target.value })} placeholder="act_XXXXXXXXX" />
                </div>
                <div className="space-y-1.5"><Label>Meta mensal de spend</Label>
                  <Input type="number" value={draft.monthly_target_spend} onChange={(e) => setDraft({ ...draft, monthly_target_spend: e.target.value })} />
                </div>
                <div className="space-y-1.5"><Label>Meta de ROAS</Label>
                  <Input type="number" step="0.1" value={draft.monthly_target_roas} onChange={(e) => setDraft({ ...draft, monthly_target_roas: e.target.value })} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={save} disabled={saving || !draft.name || !draft.access_token || !draft.ad_account_id} className="rounded-full" data-testid="agency-client-save">
                {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                Conectar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {t && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-6 rounded-2xl">
            <div className="text-xs text-muted-foreground mb-2">Clientes</div>
            <div className="text-3xl font-semibold tracking-tighter">{t.count}</div>
            <div className="text-[11px] text-muted-foreground mt-2">{t.connected} conectados</div>
          </Card>
          <Card className="p-6 rounded-2xl">
            <div className="text-xs text-muted-foreground mb-2">Spend 30d agregado</div>
            <div className="text-3xl font-semibold tracking-tighter">{t.total_spend_30d?.toLocaleString?.()}</div>
          </Card>
          <Card className="p-6 rounded-2xl">
            <div className="text-xs text-muted-foreground mb-2">Compras totais</div>
            <div className="text-3xl font-semibold tracking-tighter">{t.total_purchases}</div>
          </Card>
          <Card className="p-6 rounded-2xl">
            <div className="text-xs text-muted-foreground mb-2">ROAS médio</div>
            <div className="text-3xl font-semibold tracking-tighter">{t.avg_roas}x</div>
          </Card>
        </div>
      )}

      {clients.length === 0 ? (
        <Card className="p-10 rounded-2xl text-center">
          <Building2 className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <div className="text-sm font-semibold">Nenhum cliente ainda</div>
          <div className="text-xs text-muted-foreground mt-1">Conecte seu primeiro Ad Account para começar a gerenciar como agência.</div>
        </Card>
      ) : (
        <>
          <Card className="p-6 rounded-2xl">
            <div className="text-lg font-semibold mb-4">Comparativo de contas</div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="text-right">Spend 30d</TableHead>
                    <TableHead className="text-right">Compras</TableHead>
                    <TableHead className="text-right">CTR</TableHead>
                    <TableHead className="text-right">CPA</TableHead>
                    <TableHead className="text-right">ROAS</TableHead>
                    <TableHead className="text-right">Pace</TableHead>
                    <TableHead className="text-right">Risco</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(overview?.clients || []).map((c) => (
                    <TableRow key={c.id} data-testid={`agency-row-${c.id}`}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.brand_color || "#a3e635" }} />
                          <div>
                            <div className="text-sm font-medium">{c.name}</div>
                            <div className="text-[10px] text-muted-foreground font-mono">{c.ad_account_name || "—"}</div>
                          </div>
                        </div>
                      </TableCell>
                      {c.error ? (
                        <TableCell colSpan={7} className="text-xs text-red-600">
                          <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />
                          Erro: {c.error}
                        </TableCell>
                      ) : (
                        <>
                          <TableCell className="text-right font-mono text-sm">{c.spend_30d?.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{c.purchases}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{c.ctr_pct}%</TableCell>
                          <TableCell className="text-right font-mono text-sm">{c.cpa}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{c.avg_roas}x</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center gap-2 justify-end">
                              <span className="text-xs font-mono">{c.pace_pct}%</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge className={`rounded-full text-[10px] font-mono ${
                              c.risk_score >= 60 ? "bg-red-500/10 text-red-600 border border-red-500/30" :
                              c.risk_score >= 30 ? "bg-yellow-500/10 text-yellow-600 border border-yellow-500/30" :
                              "bg-green-500/10 text-green-600 border border-green-500/30"
                            }`}>{c.risk_score}</Badge>
                          </TableCell>
                        </>
                      )}
                      <TableCell className="text-right">
                        <Button size="icon" variant="ghost" onClick={() => del(c.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="p-6 rounded-2xl">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                <div className="text-lg font-semibold">Contas em risco</div>
              </div>
              {(overview?.risk_ranking || []).length === 0 ? (
                <div className="text-xs text-muted-foreground text-center py-6">Nenhuma conta em risco.</div>
              ) : (
                <ul className="space-y-2">
                  {(overview?.risk_ranking || []).map((c) => (
                    <li key={c.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{c.name}</div>
                        <div className="text-[11px] text-muted-foreground">ROAS {c.avg_roas}x · pace {c.pace_pct}%</div>
                      </div>
                      <div className="w-24">
                        <Progress value={c.risk_score} className="h-1.5" />
                      </div>
                      <div className="text-xs font-mono w-10 text-right">{c.risk_score}</div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="p-6 rounded-2xl">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="w-4 h-4 text-primary" />
                <div className="text-lg font-semibold">Oportunidades</div>
              </div>
              {(overview?.opportunity_ranking || []).length === 0 ? (
                <div className="text-xs text-muted-foreground text-center py-6">Sem oportunidades destacadas.</div>
              ) : (
                <ul className="space-y-2">
                  {(overview?.opportunity_ranking || []).map((c) => (
                    <li key={c.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{c.name}</div>
                        <div className="text-[11px] text-muted-foreground">ROAS {c.avg_roas}x · CTR {c.ctr_pct}%</div>
                      </div>
                      <div className="w-24">
                        <Progress value={c.opportunity_score} className="h-1.5" />
                      </div>
                      <div className="text-xs font-mono w-10 text-right">{c.opportunity_score}</div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
