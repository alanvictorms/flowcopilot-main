import { useNavigate } from "react-router-dom";
import {
  ArrowRight, Sparkles, MessageSquare, LayoutTemplate, Image as ImageIcon, Rocket,
  Users, Activity, Building2, Check, BellRing, Palette, Globe, Wallet,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/lib/brand";

const STEPS = [
  { icon: MessageSquare, title: "Converse", body: "Conte sobre o negócio como numa conversa. O copiloto faz o briefing por você." },
  { icon: LayoutTemplate, title: "Escolha o funil", body: "Aplicação, oferta direta ou live: cada modelo vem com o passo a passo pronto." },
  { icon: Sparkles, title: "Aprove os entregáveis", body: "Copy, landing page, criativos e estrutura de campanha gerados e editáveis." },
  { icon: Rocket, title: "Publique e monitore", body: "A campanha sobe no Meta e o copiloto acompanha e avisa o que ajustar." },
];

const FEATURES = [
  { icon: MessageSquare, title: "Copiloto que conduz", body: "Uma jornada guiada em fases, do briefing à campanha no ar, sem planilha e sem retrabalho." },
  { icon: LayoutTemplate, title: "Landing page em minutos", body: "Página de alta conversão gerada pela IA, publicada no seu endereço e com formulário integrado." },
  { icon: ImageIcon, title: "Criativos prontos", body: "Roteiros de vídeo, textos e imagens estáticas criados a partir da sua oferta." },
  { icon: Rocket, title: "Publicação no Meta", body: "Campanha, conjuntos e anúncios criados direto na sua conta, pausados até você aprovar." },
  { icon: Users, title: "CRM e conversão", body: "Leads chegam num kanban com origem, respostas e taxa de conversão da página." },
  { icon: Activity, title: "Monitoramento ativo", body: "Alertas de fadiga, copy cansada e conversão baixa com a sugestão de correção pronta." },
];

const FAQ = [
  ["Preciso saber gerenciar tráfego?", "Não. O copiloto conduz cada etapa e explica as decisões. Quem já é gestor ganha velocidade."],
  ["Funciona com a minha conta de anúncios?", "Sim. Você conecta sua conta Meta e a campanha é criada nela, pausada até sua aprovação."],
  ["Quanto tempo leva para subir um funil?", "Entre 15 e 30 minutos, do briefing à campanha publicada com landing e criativos."],
  ["Tenho uma agência. Posso usar com a minha marca?", "Sim. No modelo white label a plataforma usa seu nome, logo, cores e domínio, com cobrança por conta de cliente."],
];

function Glass({ className = "", children }) {
  return (
    <div className={`rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_20px_60px_-20px_rgba(0,0,0,0.6)] ${className}`}>
      {children}
    </div>
  );
}

function JourneyMock() {
  const phases = ["Briefing", "Funil", "Copy", "Landing", "Criativos", "Campanha", "Aprovação", "Monitoramento"];
  return (
    <Glass className="p-5 sm:p-6 w-full max-w-md mx-auto lg:mx-0">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold text-white">Clínica Sorriso</div>
        <div className="text-[11px] font-mono text-sky-300/80">Fase 5 de 8</div>
      </div>
      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden mb-4">
        <div className="h-full w-[56%] rounded-full bg-gradient-to-r from-blue-500 to-cyan-400" />
      </div>
      <div className="flex flex-wrap gap-1.5 mb-5">
        {phases.map((p, i) => (
          <span key={p} className={`text-[10px] px-2 py-0.5 rounded-full ${i < 4 ? "bg-emerald-400/15 text-emerald-300" : i === 4 ? "bg-blue-500/20 text-blue-200" : "bg-white/5 text-white/40"}`}>
            {i < 4 && "✓ "}{p}
          </span>
        ))}
      </div>
      <div className="space-y-2.5">
        <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white/[0.06] px-3.5 py-2.5 text-[13px] text-white/85">
          Landing aprovada e publicada. Agora vou criar 3 criativos: 1 vídeo e 2 estáticos.
        </div>
        <div className="ml-auto max-w-[70%] rounded-2xl rounded-tr-sm bg-blue-500 px-3.5 py-2.5 text-[13px] text-white">
          Pode seguir! Foco em implante.
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {[["Criativo", "3 prontos"], ["Página", "Publicada"], ["Campanha", "Pronta"]].map(([a, b]) => (
          <div key={a} className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
            <div className="text-[10px] text-white/50">{a}</div>
            <div className="text-xs font-medium text-white">{b}</div>
          </div>
        ))}
      </div>
      <button className="mt-4 w-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 py-2.5 text-sm font-semibold text-white shadow-[0_10px_30px_-10px_rgba(59,130,246,0.8)]">
        Aprovar campanha
      </button>
    </Glass>
  );
}

export default function Landing() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const brand = useBrand();
  const start = () => navigate(user ? "/app/copilot" : "/register");

  return (
    <div className="min-h-screen bg-[#050a1a] text-white overflow-x-hidden [font-family:Manrope,ui-sans-serif,system-ui]">
      {/* fundo espacial */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -top-40 -left-32 h-[520px] w-[520px] rounded-full bg-blue-600/25 blur-[120px]" />
        <div className="absolute top-20 -right-40 h-[460px] w-[460px] rounded-full bg-cyan-500/15 blur-[120px]" />
        <div className="absolute bottom-[-200px] left-1/3 h-[520px] w-[520px] rounded-full bg-indigo-600/15 blur-[140px]" />
        <div className="absolute inset-0 opacity-[0.35] [background-image:radial-gradient(rgba(255,255,255,0.35)_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_70%)]" />
      </div>

      {/* nav */}
      <header className="relative z-20 sticky top-0 border-b border-white/5 bg-[#050a1a]/70 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto h-16 px-4 sm:px-6 flex items-center gap-6">
          <a href="/" className="flex items-center gap-2.5 flex-1 min-w-0">
            <img src={brand.logo} alt={brand.name} className="h-8 w-8 object-contain" />
            <span className="font-semibold truncate [font-family:Outfit]">{brand.name}</span>
          </a>
          <nav className="hidden md:flex items-center gap-7 text-sm text-white/60">
            <a href="#como-funciona" className="hover:text-white">Como funciona</a>
            <a href="#recursos" className="hover:text-white">Recursos</a>
            <a href="#agencias" className="hover:text-white">Agências</a>
            <a href="#faq" className="hover:text-white">Dúvidas</a>
          </nav>
          <div className="flex items-center gap-2">
            {!user && <button onClick={() => navigate("/login")} className="hidden sm:block text-sm text-white/70 hover:text-white px-3 py-2">Entrar</button>}
            <button onClick={start} className="rounded-full bg-white text-[#050a1a] text-sm font-semibold px-4 py-2 hover:bg-blue-50">
              {user ? "Abrir painel" : "Começar grátis"}
            </button>
          </div>
        </div>
      </header>

      {/* hero */}
      <section className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 pt-14 sm:pt-20 pb-16 grid lg:grid-cols-2 gap-12 items-center">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-500/10 px-3 py-1 text-xs text-blue-200">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 animate-pulse" /> Copiloto de tráfego com IA
          </div>
          <h1 className="mt-6 text-[40px] leading-[1.05] sm:text-6xl font-semibold tracking-tight [font-family:Outfit]">
            Do briefing à campanha no ar{" "}
            <span className="bg-gradient-to-r from-blue-400 via-sky-300 to-cyan-300 bg-clip-text text-transparent">em minutos.</span>
          </h1>
          <p className="mt-6 text-base sm:text-lg text-white/65 leading-relaxed max-w-xl">
            O copiloto cria o funil completo com você: copy, landing page, criativos e campanha no Meta.
            Depois acompanha os resultados e controla a conversão dos leads, tudo em um só lugar.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <button onClick={start} className="group inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 px-6 py-3.5 font-semibold shadow-[0_14px_40px_-12px_rgba(59,130,246,0.9)] hover:brightness-110">
              Montar meu primeiro funil <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </button>
            <a href="#como-funciona" className="inline-flex items-center justify-center rounded-full border border-white/15 px-6 py-3.5 font-medium text-white/85 hover:bg-white/5">
              Ver como funciona
            </a>
          </div>
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/55">
            {["15 min para subir um funil", "Publicação direta no Meta", "100 créditos para começar"].map((t) => (
              <span key={t} className="inline-flex items-center gap-1.5"><Check className="h-4 w-4 text-emerald-400" />{t}</span>
            ))}
          </div>
        </div>
        <JourneyMock />
      </section>

      {/* números */}
      <section className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 pb-8">
        <Glass className="grid grid-cols-2 md:grid-cols-4 divide-x divide-white/5">
          {[["8", "fases guiadas"], ["1", "plataforma: copiloto + CRM"], ["3", "modelos de funil"], ["24/7", "monitoramento"]].map(([n, l]) => (
            <div key={l} className="p-5 sm:p-6 text-center">
              <div className="text-2xl sm:text-3xl font-semibold [font-family:Outfit] bg-gradient-to-b from-white to-white/60 bg-clip-text text-transparent">{n}</div>
              <div className="mt-1 text-xs sm:text-sm text-white/50">{l}</div>
            </div>
          ))}
        </Glass>
      </section>

      {/* como funciona */}
      <section id="como-funciona" className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-20 scroll-mt-16">
        <div className="max-w-2xl">
          <div className="text-xs font-mono uppercase tracking-[0.2em] text-sky-300/80">Como funciona</div>
          <h2 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight [font-family:Outfit]">Quatro passos. Nenhuma planilha.</h2>
        </div>
        <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {STEPS.map(({ icon: Icon, title, body }, i) => (
            <Glass key={title} className="p-6 relative">
              <div className="absolute top-5 right-5 text-xs font-mono text-white/25">0{i + 1}</div>
              <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-blue-500/30 to-cyan-400/20 border border-white/10 flex items-center justify-center">
                <Icon className="h-5 w-5 text-sky-300" />
              </div>
              <div className="mt-5 font-semibold">{title}</div>
              <p className="mt-2 text-sm text-white/55 leading-relaxed">{body}</p>
            </Glass>
          ))}
        </div>
      </section>

      {/* recursos */}
      <section id="recursos" className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-20 scroll-mt-16">
        <div className="max-w-2xl">
          <div className="text-xs font-mono uppercase tracking-[0.2em] text-sky-300/80">Recursos</div>
          <h2 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight [font-family:Outfit]">Tudo que um gestor de tráfego faz, em um copiloto.</h2>
        </div>
        <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <Glass key={title} className="p-6 transition-transform hover:-translate-y-1">
              <Icon className="h-5 w-5 text-sky-300" />
              <div className="mt-4 font-semibold">{title}</div>
              <p className="mt-2 text-sm text-white/55 leading-relaxed">{body}</p>
            </Glass>
          ))}
        </div>
      </section>

      {/* monitoramento */}
      <section className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-20 grid lg:grid-cols-2 gap-10 items-center">
        <div>
          <div className="text-xs font-mono uppercase tracking-[0.2em] text-sky-300/80">Depois que vai ao ar</div>
          <h2 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight [font-family:Outfit]">O copiloto avisa antes do resultado cair.</h2>
          <p className="mt-4 text-white/60 leading-relaxed">
            Criativo cansado, copy sem atração, página convertendo pouco ou custo por lead acima da meta:
            você recebe o alerta junto com a correção pronta para aplicar.
          </p>
        </div>
        <div className="space-y-3">
          {[
            ["Criativo cansado: Vídeo depoimento", "Frequência 3,4 e CTR caiu 42%. Hora de trocar.", "border-rose-400/30 bg-rose-500/[0.07]", "Sugerir novos criativos"],
            ["Conversão da página baixa", "6,1% das visitas viram lead (meta ≥ 10%).", "border-amber-400/30 bg-amber-500/[0.07]", "Sugerir nova estrutura"],
            ["Campanha saudável", "CPL R$ 18,40, abaixo da meta de R$ 25.", "border-emerald-400/30 bg-emerald-500/[0.07]", null],
          ].map(([t, m, cls, action]) => (
            <div key={t} className={`rounded-2xl border backdrop-blur-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3 ${cls}`}>
              <BellRing className="h-5 w-5 text-white/70 shrink-0" />
              <div className="flex-1">
                <div className="text-sm font-medium">{t}</div>
                <div className="text-xs text-white/55">{m}</div>
              </div>
              {action && <span className="text-xs rounded-full border border-white/15 px-3 py-1.5 text-white/80 w-fit">{action}</span>}
            </div>
          ))}
        </div>
      </section>

      {/* agências */}
      <section id="agencias" className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-20 scroll-mt-16">
        <Glass className="p-8 sm:p-12 overflow-hidden relative">
          <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-blue-500/25 blur-[90px]" />
          <div className="relative grid lg:grid-cols-2 gap-10 items-center">
            <div>
              <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-[0.2em] text-sky-300/80">
                <Building2 className="h-4 w-4" /> Para agências
              </div>
              <h2 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight [font-family:Outfit]">Sua marca. Sua plataforma. Seus clientes.</h2>
              <p className="mt-4 text-white/60 leading-relaxed">
                Ofereça o copiloto com a identidade da sua agência e entregue funis completos para cada cliente
                em uma fração do tempo. Você cobra por conta e escala sem aumentar a equipe.
              </p>
              <button onClick={start} className="mt-7 inline-flex items-center gap-2 rounded-full bg-white text-[#050a1a] px-6 py-3 font-semibold hover:bg-blue-50">
                Quero ser parceiro <ArrowRight className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[[Palette, "Marca própria", "Nome, logo e cores da agência"], [Globe, "Seu domínio", "app.suaagencia.com.br"],
                [Users, "Contas de clientes", "Cada cliente com seu painel"], [Wallet, "Cobrança por conta", "Receita recorrente previsível"]].map(([Icon, t, d]) => (
                <div key={t} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <Icon className="h-5 w-5 text-sky-300" />
                  <div className="mt-3 text-sm font-semibold">{t}</div>
                  <div className="mt-1 text-xs text-white/50">{d}</div>
                </div>
              ))}
            </div>
          </div>
        </Glass>
      </section>

      {/* faq */}
      <section id="faq" className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 py-20 scroll-mt-16">
        <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-center [font-family:Outfit]">Dúvidas frequentes</h2>
        <div className="mt-10 space-y-3">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-5">
              <summary className="cursor-pointer list-none flex items-center justify-between gap-4 font-medium">
                {q}<span className="text-white/40 transition-transform group-open:rotate-45 text-xl leading-none">+</span>
              </summary>
              <p className="mt-3 text-sm text-white/60 leading-relaxed">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* cta final */}
      <section className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 pb-24">
        <div className="rounded-3xl bg-gradient-to-br from-blue-600 via-blue-500 to-cyan-500 p-10 sm:p-14 text-center shadow-[0_30px_80px_-30px_rgba(59,130,246,0.9)]">
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight [font-family:Outfit]">Seu próximo funil pode estar no ar hoje.</h2>
          <p className="mt-3 text-white/85">Comece com 100 créditos grátis. Sem cartão.</p>
          <button onClick={start} className="mt-8 inline-flex items-center gap-2 rounded-full bg-white text-blue-700 px-7 py-3.5 font-semibold hover:bg-blue-50">
            Começar agora <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </section>

      <footer className="relative z-10 border-t border-white/5">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-white/40">
          <div className="flex items-center gap-2"><img src={brand.logo} alt="" className="h-5 w-5 object-contain" /> © {new Date().getFullYear()} {brand.name}</div>
          <div className="flex gap-5">
            <a href="/login" className="hover:text-white/70">Entrar</a>
            <a href="/register" className="hover:text-white/70">Criar conta</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
