import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Radar, Plus, Trash2, Loader2 } from "lucide-react";

import api, { formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

const emptyComp = { name: "", urls: "", ad_examples: "", notes: "" };

function Chips({ items, tone = "bg-muted text-muted-foreground" }) {
  if (!items?.length) return <div className="text-xs text-muted-foreground">—</div>;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((t, i) => (
        <span key={i} className={`text-[11px] px-2 py-1 rounded-full ${tone}`}>{t}</span>
      ))}
    </div>
  );
}

export default function Intelligence() {
  const [niche, setNiche] = useState("");
  const [positioning, setPositioning] = useState("");
  const [comps, setComps] = useState([{ ...emptyComp }]);
  const [reports, setReports] = useState([]);
  const [running, setRunning] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get("/intelligence/reports");
      setReports(data || []);
    } catch (err) { /* ignore */ }
  };
  useEffect(() => { load(); }, []);

  const analyze = async () => {
    if (!niche || comps.some((c) => !c.name)) return toast.error("Preencha nicho e o nome de cada concorrente.");
    setRunning(true);
    try {
      await api.post("/intelligence/analyze", {
        niche,
        my_positioning: positioning,
        competitors: comps.map((c) => ({
          name: c.name,
          urls: (c.urls || "").split("\n").map((s) => s.trim()).filter(Boolean),
          ad_examples: (c.ad_examples || "").split("\n").map((s) => s.trim()).filter(Boolean),
          notes: c.notes,
        })),
      });
      toast.success("Análise concluída.");
      load();
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
    finally { setRunning(false); }
  };

  const del = async (id) => { await api.delete(`/intelligence/reports/${id}`); load(); };

  return (
    <div className="space-y-6" data-testid="intelligence-page">
      <Card className="p-6 rounded-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center"><Radar className="w-5 h-5 text-primary" /></div>
          <div>
            <div className="text-lg font-semibold">Creative Market Intelligence</div>
            <div className="text-xs text-muted-foreground">Mapeie concorrentes, extraia padrões e ganhe conceitos originais.</div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="space-y-1.5">
            <Label>Nicho *</Label>
            <Input value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="Ex: educação financeira" data-testid="intel-niche" />
          </div>
          <div className="space-y-1.5">
            <Label>Seu posicionamento</Label>
            <Input value={positioning} onChange={(e) => setPositioning(e.target.value)} />
          </div>
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Concorrentes</Label>
            <Button size="sm" variant="ghost" onClick={() => setComps([...comps, { ...emptyComp }])}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar
            </Button>
          </div>
          {comps.map((c, i) => (
            <div key={i} className="border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Input value={c.name} onChange={(e) => { const arr = [...comps]; arr[i] = { ...c, name: e.target.value }; setComps(arr); }} placeholder="Nome do concorrente" />
                <Button size="icon" variant="ghost" onClick={() => setComps(comps.filter((_, k) => k !== i))}><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
              <Textarea rows={2} value={c.urls} onChange={(e) => { const arr = [...comps]; arr[i] = { ...c, urls: e.target.value }; setComps(arr); }} placeholder="URLs (uma por linha)" />
              <Textarea rows={3} value={c.ad_examples} onChange={(e) => { const arr = [...comps]; arr[i] = { ...c, ad_examples: e.target.value }; setComps(arr); }} placeholder="Exemplos de anúncios / copies (um por linha)" />
              <Input value={c.notes} onChange={(e) => { const arr = [...comps]; arr[i] = { ...c, notes: e.target.value }; setComps(arr); }} placeholder="Notas rápidas (opcional)" />
            </div>
          ))}
        </div>
        <div className="mt-6 flex justify-end">
          <Button onClick={analyze} disabled={running} className="rounded-full" data-testid="intel-analyze-btn">
            {running ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Radar className="w-4 h-4 mr-1" />}
            Analisar mercado
          </Button>
        </div>
      </Card>

      {reports.map((r) => {
        const rep = r.report || {};
        return (
          <Card key={r.id} className="p-6 rounded-2xl" data-testid={`intel-report-${r.id}`}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-sm font-semibold">{r.input?.niche}</div>
                <div className="text-[11px] text-muted-foreground">{new Date(r.created_at).toLocaleString()}</div>
              </div>
              <Button size="icon" variant="ghost" onClick={() => del(r.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
            </div>

            {rep.competitors?.length > 0 && (
              <div className="mb-6">
                <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-3">Concorrentes</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {rep.competitors.map((c, i) => (
                    <div key={i} className="border border-border rounded-xl p-4">
                      <div className="text-sm font-semibold mb-2">{c.name}</div>
                      <div className="space-y-2 text-xs">
                        <div><span className="text-muted-foreground">Hooks:</span> <Chips items={c.hooks} tone="bg-primary/10 text-primary" /></div>
                        <div><span className="text-muted-foreground">Ângulos:</span> <Chips items={c.angles} tone="bg-blue-500/10 text-blue-600" /></div>
                        <div><span className="text-muted-foreground">Formatos:</span> <Chips items={c.formats} /></div>
                        <div><span className="text-muted-foreground">CTAs:</span> <Chips items={c.ctas} /></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {rep.market_patterns?.length > 0 && (
              <div className="mb-4">
                <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">Padrões do mercado</div>
                <ul className="text-sm space-y-1">
                  {rep.market_patterns.map((p, i) => <li key={i}>• {p}</li>)}
                </ul>
              </div>
            )}

            {rep.underexplored_opportunities?.length > 0 && (
              <div className="mb-4">
                <div className="text-[10px] font-mono uppercase tracking-widest text-primary mb-2">Oportunidades pouco exploradas</div>
                <ul className="text-sm space-y-1">
                  {rep.underexplored_opportunities.map((p, i) => <li key={i}>→ {p}</li>)}
                </ul>
              </div>
            )}

            {rep.original_concepts?.length > 0 && (
              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">Conceitos originais</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {rep.original_concepts.map((c, i) => (
                    <div key={i} className="p-4 rounded-xl bg-primary/5 border border-primary/20">
                      <div className="text-sm font-semibold">{c.title}</div>
                      <div className="text-xs mt-1"><b>Ângulo:</b> {c.angle}</div>
                      <div className="text-xs"><b>Hook:</b> {c.hook}</div>
                      <div className="text-[11px] text-muted-foreground mt-2">{c.why_it_works}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
