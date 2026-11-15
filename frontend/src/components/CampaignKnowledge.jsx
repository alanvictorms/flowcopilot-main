import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { FileText, Link2, ImageIcon, Paperclip, Trash2, Plus, Loader2, Brain } from "lucide-react";
import api, { formatApiError, API_BASE } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

const KINDS = [
  { key: "text", label: "Texto", icon: FileText },
  { key: "link", label: "Link", icon: Link2 },
  { key: "file", label: "Arquivo/Imagem", icon: Paperclip },
];

const token = () => localStorage.getItem("mfa_token") || "";

export default function CampaignKnowledge({ campaignId }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState("text");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/campaign-knowledge/${campaignId}`);
      setItems(data || []);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [campaignId]);

  const addText = async () => {
    if (!content.trim() && !title.trim()) return toast.error("Escreva algo.");
    setSaving(true);
    try {
      await api.post(`/campaign-knowledge/${campaignId}`, { kind, title, content });
      setTitle(""); setContent("");
      toast.success("Conhecimento adicionado.");
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally { setSaving(false); }
  };

  const addFile = async (file) => {
    if (!file) return;
    setSaving(true);
    try {
      const reader = new FileReader();
      const b64 = await new Promise((res, rej) => { reader.onload = () => res(reader.result); reader.onerror = rej; reader.readAsDataURL(file); });
      await api.post(`/campaign-knowledge/${campaignId}`, {
        kind: file.type.startsWith("image/") ? "image" : "file",
        title: file.name,
        filename: file.name,
        mime: file.type || "application/octet-stream",
        data_base64: b64,
      });
      toast.success("Arquivo anexado.");
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally { setSaving(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const del = async (id) => {
    try { await api.delete(`/campaign-knowledge/${campaignId}/${id}`); load(); }
    catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };

  const fileUrl = (it) => `${API_BASE}/campaign-knowledge/${campaignId}/${it.id}/file?t=${encodeURIComponent(token())}`;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0"><Brain className="w-4 h-4 text-primary" /></div>
        <div>
          <div className="text-sm font-semibold">Base de conhecimento da campanha</div>
          <div className="text-xs text-muted-foreground">
            Contexto só desta campanha (texto, links, arquivos, imagens). O agente usa isso para estudar e gerar conteúdo sem misturar com outras campanhas.
          </div>
        </div>
      </div>

      <Card className="p-5 rounded-2xl space-y-3">
        <div className="flex gap-2">
          {KINDS.map((k) => (
            <Button key={k.key} size="sm" variant={kind === k.key ? "default" : "outline"} className="rounded-full" onClick={() => setKind(k.key)}>
              <k.icon className="w-3.5 h-3.5 mr-1" /> {k.label}
            </Button>
          ))}
        </div>

        {kind === "file" ? (
          <div>
            <input ref={fileRef} type="file" className="hidden" onChange={(e) => addFile(e.target.files?.[0])} accept="image/*,.pdf,.txt,.csv,.doc,.docx" />
            <Button variant="outline" className="rounded-full" onClick={() => fileRef.current?.click()} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Paperclip className="w-4 h-4 mr-1" />} Escolher arquivo (máx 6 MB)
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label>Título</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "link" ? "Ex: Página de vendas" : "Ex: Persona / diferencial / oferta"} />
            </div>
            <div className="space-y-1.5">
              <Label>{kind === "link" ? "URL" : "Conteúdo"}</Label>
              {kind === "link" ? (
                <Input value={content} onChange={(e) => setContent(e.target.value)} placeholder="https://…" />
              ) : (
                <Textarea rows={4} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Cole informações sobre o produto, público, provas sociais, objeções, tom de voz…" />
              )}
            </div>
            <div className="flex justify-end">
              <Button className="rounded-full" onClick={addText} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />} Adicionar
              </Button>
            </div>
          </>
        )}
      </Card>

      {loading ? (
        <Card className="p-8 rounded-2xl text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></Card>
      ) : items.length === 0 ? (
        <Card className="p-8 rounded-2xl text-center text-sm text-muted-foreground">Nenhum conhecimento adicionado ainda.</Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {items.map((it) => (
            <Card key={it.id} className="p-4 rounded-2xl flex gap-3">
              {it.kind === "image" ? (
                <img src={fileUrl(it)} alt="" className="w-14 h-14 rounded-lg object-cover border border-border shrink-0" />
              ) : (
                <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  {it.kind === "link" ? <Link2 className="w-5 h-5 text-muted-foreground" /> : it.kind === "file" ? <Paperclip className="w-5 h-5 text-muted-foreground" /> : <FileText className="w-5 h-5 text-muted-foreground" />}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{it.title || "(sem título)"}</div>
                {it.kind === "link" ? (
                  <a href={it.content} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline break-all line-clamp-2">{it.content}</a>
                ) : it.kind === "text" ? (
                  <div className="text-xs text-muted-foreground line-clamp-3 mt-0.5">{it.content}</div>
                ) : (
                  <a href={fileUrl(it)} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">{it.kind === "image" ? "Ver imagem" : "Baixar arquivo"}</a>
                )}
              </div>
              <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full shrink-0 text-muted-foreground hover:text-destructive" onClick={() => del(it.id)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
