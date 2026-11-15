import { useState, useRef, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { X, Send, Loader2, Sparkles } from "lucide-react";
import { API_BASE } from "@/lib/api";
import { useLanguage } from "@/contexts/LanguageContext";

const PAGE_CONTEXT = {
  dashboard: "Visão Geral — KPIs, desempenho e atividade recente",
  campaigns: "Campanhas — lista, status e métricas das campanhas",
  creatives: "Criativos — geração, avaliação e ciclo de vida dos criativos",
  approvals: "Aprovações — fila de ações que aguardam sua aprovação",
  chat: "Copiloto — assistente de IA",
  autonomy: "Autonomia — modos de operação e limites de segurança",
  business: "Cérebro do Negócio — produto, empresa, público e memória",
  audit: "Auditoria — análise da conta",
  optimizations: "Otimizações — sugestões da IA",
  budget: "Orçamento — gestão de verba",
  funnel: "Doutor de Funil — diagnóstico do funil",
  profit: "Lucro & Leads — conversões externas via webhook",
  "lead-quality": "Qualidade de Leads",
  rules: "Regras — automações se/então",
  automation: "Motor Contínuo",
  experiments: "Experimentos A/B",
  audiences: "Inteligência de Públicos",
  strategy: "Motor de Estratégia",
  intelligence: "Inteligência de Mercado",
  twin: "Gêmeo Digital",
  lifecycle: "Ciclo de Vida",
  builder: "Criador de Campanhas",
  fatigue: "Fadiga Criativa",
  objections: "Objeções → Criativos",
  "brand-guard": "Brand Guard",
  "creative-factory": "Creative Factory",
  autopilot: "Piloto de Criativos",
  policy: "Policy Guardian",
  tracking: "Monitor de Tracking",
  capacity: "Demand-Capacity",
  seasonality: "Sazonalidade",
  safety: "Guardião de Segurança",
  rollback: "Reverter",
  ledger: "Registro de Decisões — histórico imutável",
  memory: "Memória Estratégica — aprendizados do sistema",
  admin: "Painel Administrativo — visão geral",
  "admin/users": "Admin Usuários — gestão de usuários",
  "admin/plans": "Admin Planos — CRUD de planos",
  "admin/resources": "Admin Recursos — preços de recursos",
  "admin/referrals": "Admin Indicações — comissões e saques",
  "admin/payments": "Admin Pagamentos — configuração de créditos e gateway",
  "admin/notifications": "Admin Notificações — envio de notificações",
  "admin/audit": "Admin Auditoria — log de ações administrativas",
  agency: "Central de Agência — multi-cliente",
  profile: "Perfil — configurações da conta",
  plans: "Planos — assinatura e contratação de planos",
  wallet: "Carteira — saldo de créditos, extrato e recarga",
};

export default function FloatingChat() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [sending, setSending] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const bottomRef = useRef(null);
  const location = useLocation();
  const { lang } = useLanguage();

  const rawPath = location.pathname.replace("/app/", "");
  const currentPage = PAGE_CONTEXT[rawPath] ? rawPath
    : PAGE_CONTEXT[rawPath.split("/").slice(0, 2).join("/")] ? rawPath.split("/").slice(0, 2).join("/")
    : rawPath.split("/")[0] || "dashboard";
  const pageCtx = PAGE_CONTEXT[currentPage] || currentPage;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Abertura controlada pelo botão no header (o painel continua no canto inferior).
  useEffect(() => {
    const openChat = () => setOpen((o) => !o);
    window.addEventListener("flowpilot:open-chat", openChat);
    return () => window.removeEventListener("flowpilot:open-chat", openChat);
  }, []);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    const contextPrefix = `[O usuário está na página: ${pageCtx}]\n\n`;
    const fullMessage = contextPrefix + text;

    setMessages((m) => [...m, { role: "user", content: text }, { role: "assistant", content: "" }]);
    setInput("");
    setSending(true);

    try {
      const res = await fetch(`${API_BASE}/ai/chat/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("mfa_token")}`,
        },
        body: JSON.stringify({ session_id: sessionId || undefined, message: fullMessage, lang }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
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
            } catch {}
          }
        }
      }
    } catch {
      setMessages((prev) => {
        const copy = prev.slice();
        copy[copy.length - 1] = { role: "assistant", content: "Erro ao enviar mensagem. Tente novamente." };
        return copy;
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-[380px] h-[520px] bg-background border rounded-2xl shadow-2xl flex flex-col overflow-hidden" data-testid="floating-chat-panel">
          <div className="flex items-center gap-2 px-4 py-3 border-b bg-primary/5 shrink-0">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold flex-1">Assistente IA</span>
            <span className="text-[10px] text-muted-foreground px-2 py-0.5 rounded-full bg-muted truncate max-w-[140px]">
              {pageCtx.split("—")[0].trim()}
            </span>
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground p-1">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 scrollbar-thin">
            {messages.length === 0 && (
              <div className="text-center py-8 space-y-2">
                <Sparkles className="w-8 h-8 text-primary/30 mx-auto" />
                <div className="text-xs text-muted-foreground">
                  Pergunte qualquer coisa sobre <b>{pageCtx.split("—")[0].trim()}</b> ou suas campanhas.
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`text-xs leading-relaxed ${
                  m.role === "user"
                    ? "bg-primary text-primary-foreground rounded-2xl rounded-br-md px-3 py-2 ml-8"
                    : "bg-muted rounded-2xl rounded-bl-md px-3 py-2 mr-8"
                }`}
              >
                {m.content || (m.role === "assistant" && <Loader2 className="w-3.5 h-3.5 animate-spin" />)}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          <div className="px-3 py-2 border-t shrink-0">
            <div className="flex items-center gap-2">
              <input
                className="flex-1 text-sm border rounded-xl px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Pergunte algo..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
                disabled={sending}
                data-testid="floating-chat-input"
              />
              <button
                onClick={send}
                disabled={sending || !input.trim()}
                className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-50 shrink-0"
                data-testid="floating-chat-send"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
