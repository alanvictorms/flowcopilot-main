import { useNavigate, Link } from "react-router-dom";
import { ArrowRight, Zap, ShieldCheck, Sparkles, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { Moon, Sun } from "lucide-react";

export default function Landing() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const cta = () => (user ? navigate("/app/dashboard") : navigate("/register"));

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-hidden">
      <div className="absolute inset-0 subtle-grid-bg opacity-40 pointer-events-none" />
      <div className="absolute -top-40 -left-40 w-[420px] h-[420px] rounded-full bg-primary/10 blur-3xl" />

      <nav className="relative z-10 h-16 flex items-center px-6 lg:px-10 border-b border-border/60 glass-panel">
        <div className="flex items-center gap-3 flex-1">
          <div className="w-8 h-8 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center">
            <img src="/flowpilot-icon.png" alt="FlowPilot" className="w-7 h-7" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">FlowPilot</div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              AI Traffic OS
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={toggleTheme} data-testid="landing-theme-toggle">
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>
          {user ? (
            <Button onClick={() => navigate("/app/dashboard")} data-testid="landing-open-app">
              Abrir Painel
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => navigate("/login")} data-testid="landing-login">
                Entrar
              </Button>
              <Button onClick={() => navigate("/register")} data-testid="landing-signup">
                Começar
              </Button>
            </>
          )}
        </div>
      </nav>

      <section className="relative z-10 max-w-6xl mx-auto px-6 lg:px-10 pt-20 pb-24">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-card/60 text-xs">
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          <span className="font-mono uppercase tracking-widest text-muted-foreground">
            Powered by Claude Sonnet 4.5
          </span>
        </div>
        <h1 className="mt-6 text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tighter leading-[1.05] max-w-3xl">
          Gestão de tráfego no Meta Ads,{" "}
          <span className="text-primary">com autonomia real.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-base text-muted-foreground leading-relaxed">
          Rode, audite e otimize suas campanhas com um agente de IA que aplica 250+ verificações
          ponderadas, pontua criativos e executa ajustes sob suas regras. Zero mocks. Só o Meta
          Marketing API e a sua estratégia.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button size="lg" onClick={cta} data-testid="landing-cta-primary">
            Ativar meu agente
            <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
          <Button size="lg" variant="outline" asChild data-testid="landing-cta-secondary">
            <Link to="/login">Já tenho conta</Link>
          </Button>
        </div>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { icon: ShieldCheck, title: "Auditoria 250+ checks", body: "Estrutura, verba, targeting, criativo, entrega, bidding, tracking, política — com scoring ponderado." },
            { icon: Sparkles, title: "Scoring de criativos", body: "Claude analisa cada anúncio: gancho, oferta, clareza, CTA. Priorize o que escalar." },
            { icon: Bot, title: "Chat com contexto real", body: "Converse em linguagem natural — o agente enxerga suas campanhas dos últimos 30 dias." },
            { icon: Zap, title: "Automações if/then", body: "Regras auto-executáveis: pausar, ativar ou reajustar orçamentos com base em KPIs." },
          ].map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-lg border border-border bg-card p-5 hover:-translate-y-[2px] hover:border-primary/30 transition-all"
            >
              <Icon className="w-5 h-5 text-primary" />
              <div className="mt-3 text-sm font-semibold">{title}</div>
              <p className="mt-2 text-xs text-muted-foreground leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="relative z-10 border-t border-border/60 py-6 px-6 lg:px-10 text-xs text-muted-foreground flex items-center justify-between">
        <div>© 2026 FlowPilot</div>
        <div className="font-mono uppercase tracking-widest">Made for media buyers</div>
      </footer>
    </div>
  );
}
