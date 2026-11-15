import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Brain, Plus, Trash2, Loader2 } from "lucide-react";

import api, { formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import BrainNetwork from "@/components/BrainNetwork";

const KINDS = [
  { value: "winner", label: "🏆 Ganhador", color: "bg-green-500/10 text-green-600 dark:text-green-400", dot: "#22c55e" },
  { value: "loser", label: "📉 Perdedor", color: "bg-red-500/10 text-red-600 dark:text-red-400", dot: "#ef4444" },
  { value: "learning", label: "💡 Aprendizado", color: "bg-primary/10 text-primary", dot: "#a3e635" },
  { value: "audience", label: "👥 Público", color: "bg-blue-500/10 text-blue-600 dark:text-blue-400", dot: "#3b82f6" },
  { value: "creative", label: "🎨 Criativo", color: "bg-purple-500/10 text-purple-600 dark:text-purple-400", dot: "#a855f7" },
  { value: "offer", label: "💰 Oferta", color: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400", dot: "#eab308" },
  { value: "test_result", label: "🧪 Resultado de teste", color: "bg-orange-500/10 text-orange-600 dark:text-orange-400", dot: "#f97316" },
];

const KIND_MAP = KINDS.reduce((acc, k) => {
  acc[k.value] = { label: k.label, color: k.dot };
  return acc;
}, {});

export default function Memory() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [draft, setDraft] = useState({ kind: "learning", title: "", detail: "", tags: "" });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/memory", { params: filter ? { kind: filter } : {} });
      setItems(data || []);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filter]);

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        kind: draft.kind,
        title: draft.title,
        detail: draft.detail,
        tags: draft.tags.split(",").map((t) => t.trim()).filter(Boolean),
        metrics: {},
      };
      await api.post("/memory", payload);
      toast.success("Aprendizado salvo.");
      setOpen(false);
      setDraft({ kind: "learning", title: "", detail: "", tags: "" });
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setSaving(false);
    }
  };

  const del = async (id) => {
    if (!confirm("Excluir esse aprendizado?")) return;
    await api.delete(`/memory/${id}`);
    load();
  };

  return (
    <div className="space-y-6" data-testid="memory-page">
      <Card className="p-6 rounded-2xl">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Brain className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <div className="text-lg font-semibold">Strategy Memory</div>
            <div className="text-sm text-muted-foreground mt-1">
              Registre padrões, testes e insights. A IA usará isso como contexto em decisões futuras.
            </div>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-full" data-testid="memory-add-btn"><Plus className="w-4 h-4 mr-1" /> Adicionar</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Novo aprendizado</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Tipo</Label>
                  <Select value={draft.kind} onValueChange={(v) => setDraft({ ...draft, kind: v })}>
                    <SelectTrigger className="rounded-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{KINDS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Título *</Label>
                  <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} data-testid="memory-title" />
                </div>
                <div className="space-y-1.5">
                  <Label>Detalhe</Label>
                  <Textarea rows={4} value={draft.detail} onChange={(e) => setDraft({ ...draft, detail: e.target.value })} data-testid="memory-detail" />
                </div>
                <div className="space-y-1.5">
                  <Label>Tags (separadas por vírgula)</Label>
                  <Input value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} placeholder="ex: black-friday, criativo-video" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={save} disabled={saving || !draft.title} className="rounded-full" data-testid="memory-save-btn">
                  {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                  Salvar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </Card>

      <Card className="p-0 rounded-2xl overflow-hidden border-0">
        <BrainNetwork itemCount={items.length} height={460} />
      </Card>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilter("")}
          className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${!filter ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:bg-accent"}`}
        >Todos</button>
        {KINDS.map((k) => (
          <button
            key={k.value}
            onClick={() => setFilter(k.value)}
            className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${filter === k.value ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:bg-accent"}`}
          >{k.label}</button>
        ))}
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Carregando…</div>
      ) : items.length === 0 ? (
        <Card className="p-10 rounded-2xl text-center text-xs text-muted-foreground">
          Nenhum aprendizado ainda. Comece registrando o que já sabe sobre sua conta.
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((m) => {
            return (
              <Card key={m.id} className="p-5 rounded-2xl hover:shadow-sm transition-shadow" data-testid={`memory-item-${m.id}`}>
                <div className="flex items-start justify-between mb-2">
                  <Badge className={`rounded-full text-[10px] font-mono uppercase border-0 text-white`} style={{ backgroundColor: KIND_MAP[m.kind]?.color || "#a3e635" }}>
                    {KIND_MAP[m.kind]?.label || m.kind}
                  </Badge>
                  <button onClick={() => del(m.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
                <div className="text-sm font-semibold">{m.title}</div>
                {m.detail && <div className="text-xs text-muted-foreground mt-1 line-clamp-3">{m.detail}</div>}
                {m.tags?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {m.tags.map((t) => (
                      <span key={t} className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">#{t}</span>
                    ))}
                  </div>
                )}
                <div className="text-[10px] text-muted-foreground mt-3">
                  {new Date(m.created_at).toLocaleDateString()}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
