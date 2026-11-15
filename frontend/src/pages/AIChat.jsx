import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Send, Sparkles, Loader2, Bot, User, Plus, MessageSquare, Trash2 } from "lucide-react";

import api, { formatApiError, API_BASE } from "@/lib/api";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

const SUGGESTIONS = [
  "Quais campanhas estão performando abaixo do CTR médio da conta?",
  "Sugira 3 otimizações de orçamento com base nos últimos 30 dias.",
  "Quais criativos merecem escala e quais devo pausar agora?",
  "Meu ROAS está abaixo do esperado. Onde investigar primeiro?",
];

function stripMarkdown(t) {
  if (!t) return t;
  return t
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/^-{3,}$/gm, "")
    .replace(/^_{3,}$/gm, "")
    .replace(/_(.+?)_/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export default function AIChat() {
  const { lang } = useLanguage();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [sending, setSending] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [sessions, setSessions] = useState([]);
  const bottomRef = useRef(null);

  const loadSessions = async () => {
    try {
      const { data } = await api.get("/ai/chat/sessions");
      setSessions(data || []);
      return data || [];
    } catch { return []; }
  };

  const loadHistory = async (sid) => {
    try {
      const { data } = await api.get("/ai/chat/history", { params: { session_id: sid } });
      setMessages((data || []).map((h) => ({ role: h.role, content: h.content })));
      setSessionId(sid);
    } catch (err) { /* ignore */ }
  };

  useEffect(() => {
    (async () => {
      const list = await loadSessions();
      if (list.length) await loadHistory(list[0].session_id);
    })();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async (text) => {
    const payload = (text ?? input).trim();
    if (!payload || sending) return;
    const isNewSession = !sessionId;
    setMessages((m) => [...m, { role: "user", content: payload }, { role: "assistant", content: "" }]);
    setInput("");
    setSending(true);
    try {
      const res = await fetch(`${API_BASE}/ai/chat/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("mfa_token")}`,
        },
        body: JSON.stringify({ session_id: sessionId || undefined, message: payload, lang }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(formatApiError(body?.detail) || `HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (line.startsWith("event: session")) continue;
          if (line.startsWith("event: done")) continue;
          if (line.startsWith("data:")) {
            const raw = line.slice(5).trim();
            if (!raw) continue;
            try {
              const j = JSON.parse(raw);
              if (j.session_id && !sessionId) setSessionId(j.session_id);
              if (j.delta) {
                acc += j.delta;
                setMessages((prev) => {
                  const copy = prev.slice();
                  copy[copy.length - 1] = { role: "assistant", content: acc };
                  return copy;
                });
              }
              if (j.error) {
                acc += `\n[erro: ${j.error}]`;
                setMessages((prev) => {
                  const copy = prev.slice();
                  copy[copy.length - 1] = { role: "assistant", content: acc };
                  return copy;
                });
              }
            } catch { /* keep going */ }
          }
        }
      }
      if (isNewSession) await loadSessions();
    } catch (err) {
      toast.error(err.message || "Falha ao enviar mensagem.");
    } finally {
      setSending(false);
    }
  };

  const newSession = () => {
    setSessionId(null);
    setMessages([]);
  };

  const removeSession = async (sid) => {
    if (!confirm("Excluir esta conversa?")) return;
    try {
      await api.delete(`/ai/chat/sessions/${sid}`);
      if (sid === sessionId) newSession();
      loadSessions();
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };

  return (
    <div className="flex gap-4 h-[calc(100vh-7rem)]" data-testid="chat-page">
      {/* Sessions sidebar */}
      <aside className="hidden lg:flex flex-col w-64 shrink-0 bg-card rounded-xl border border-border p-3">
        <Button onClick={newSession} className="rounded-full mb-3 justify-start" variant="outline" data-testid="chat-new-session-btn">
          <Plus className="w-4 h-4 mr-1" /> Nova conversa
        </Button>
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2 px-2">Histórico</div>
        <ScrollArea className="flex-1">
          <div className="space-y-1 pr-1">
            {sessions.length === 0 && (
              <div className="text-xs text-muted-foreground px-2 py-6 text-center">Nenhuma conversa ainda.</div>
            )}
            {sessions.map((s) => (
              <div
                key={s.session_id}
                onClick={() => loadHistory(s.session_id)}
                className={`group flex items-start gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-colors ${
                  s.session_id === sessionId ? "bg-primary/10 border border-primary/20" : "hover:bg-accent border border-transparent"
                }`}
                data-testid={`chat-session-${s.session_id}`}
              >
                <MessageSquare className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{s.preview || "Sem preview"}</div>
                  <div className="text-[10px] font-mono text-muted-foreground">
                    {s.created_at ? new Date(s.created_at).toLocaleDateString("pt-BR") : ""}
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); removeSession(s.session_id); }}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </aside>

      {/* Chat panel */}
      <Card className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-3 border-b border-border/60">
          <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Bot className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold truncate">Copiloto Meta Ads</div>
            <div className="text-[11px] text-muted-foreground">
              {sessionId ? "Continua conversa anterior" : "Nova conversa — sem contexto salvo"}
            </div>
          </div>
        </div>
        <ScrollArea className="flex-1 p-6">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-6 text-center py-10">
              <div className="w-12 h-12 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Bot className="w-6 h-6 text-primary" />
              </div>
              <div>
                <div className="text-sm font-semibold">Comece com uma pergunta</div>
                <div className="text-xs text-muted-foreground mt-1 max-w-md">
                  Ou selecione uma sugestão abaixo. O agente lembra desta conversa até você começar uma nova.
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-2xl">
                {SUGGESTIONS.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => send(s)}
                    className="text-left text-xs p-3 rounded-md border border-border hover:border-primary/40 hover:bg-accent transition-colors"
                    data-testid={`chat-suggestion-${i}`}
                  >
                    <Sparkles className="w-3.5 h-3.5 text-primary inline mr-1.5 -mt-0.5" />
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4 max-w-3xl mx-auto">
              {messages.map((m, i) => (
                <div key={i} className={`flex gap-3 ${m.role === "user" ? "justify-end" : ""}`}>
                  {m.role === "assistant" && (
                    <div className="w-7 h-7 shrink-0 rounded-md border border-primary/20 bg-primary/10 flex items-center justify-center">
                      <Bot className="w-3.5 h-3.5 text-primary" />
                    </div>
                  )}
                  <div
                    className={`text-sm rounded-lg px-3.5 py-2.5 max-w-[80%] whitespace-pre-wrap leading-relaxed ${
                      m.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-secondary-foreground border border-border"
                    }`}
                    data-testid={`chat-msg-${m.role}-${i}`}
                  >
                    {m.content ? (
                      m.role === "assistant" ? stripMarkdown(m.content) : m.content
                    ) : (
                      <span className="inline-flex items-center gap-1 text-muted-foreground text-xs">
                        <Loader2 className="w-3 h-3 animate-spin" /> pensando…
                      </span>
                    )}
                  </div>
                  {m.role === "user" && (
                    <div className="w-7 h-7 shrink-0 rounded-md border border-border bg-card flex items-center justify-center">
                      <User className="w-3.5 h-3.5" />
                    </div>
                  )}
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          )}
        </ScrollArea>
        <div className="border-t border-border/60 p-4 bg-card">
          <div className="max-w-3xl mx-auto flex items-end gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Pergunte algo sobre suas campanhas…"
              className="min-h-[52px] max-h-[160px] resize-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              data-testid="chat-input"
            />
            <Button onClick={() => send()} disabled={sending || !input.trim()} data-testid="chat-send-btn">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
