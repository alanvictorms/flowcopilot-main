/**
 * i18n do FlowPilot.
 *
 * NOTA (recuperação): o arquivo original tinha ~450 chaves de conteúdo de página
 * (dash.*, wallet.*, plans.*, profile.*, settings.*) em 5 idiomas, criadas numa
 * sessão cujo transcript foi perdido. Essas chaves não puderam ser recuperadas.
 * As chaves de MENU/estrutura foram recuperadas. Para qualquer chave ausente,
 * getTranslation devolve um rótulo legível (em vez da chave crua). As páginas
 * continuam funcionando; os textos específicos podem ser repreenchidos depois.
 */

const nav_pt = {
  "nav.dashboard": "Visão Geral", "nav.copilot": "Copiloto", "nav.leads": "Leads", "nav.results": "Resultados", "nav.white-label": "Minha agência", "group.agency": "Agência", "nav.campaigns": "Campanhas", "nav.audit": "Auditoria",
  "nav.creatives": "Criativos IA", "nav.autopilot": "Piloto de Criativos",
  "nav.intelligence": "Inteligência de Mercado", "nav.creative-factory": "Creative Factory",
  "nav.fatigue": "Fadiga Criativa", "nav.objections": "Objeções → Criativos",
  "nav.brand-guard": "Brand Guard", "nav.experiments": "Experimentos A/B",
  "nav.audiences": "Inteligência de Públicos", "nav.strategy": "Motor de Estratégia",
  "nav.optimizations": "Otimizações", "nav.budget": "Gestor de Orçamento",
  "nav.twin": "Gêmeo Digital", "nav.lifecycle": "Ciclo de Vida", "nav.builder": "Criador de Campanhas",
  "nav.business": "BI do Negócio", "nav.profit": "Lucro & Leads", "nav.lead-quality": "Qualidade de Leads",
  "nav.funnel": "Doutor de Funil", "nav.approvals": "Aprovações", "nav.rules": "Regras",
  "nav.automation": "Motor Contínuo", "nav.autonomy": "Autonomia", "nav.policy": "Policy Guardian",
  "nav.tracking": "Monitor de Tracking", "nav.capacity": "Demand-Capacity", "nav.seasonality": "Sazonalidade",
  "nav.notifications": "Central de Alertas", "nav.safety": "Guardião de Segurança", "nav.rollback": "Reverter",
  "nav.ledger": "Registro de Decisões", "nav.memory": "Memória Estratégica", "nav.chat": "Chat IA",
  "nav.profile": "Perfil", "nav.plans": "Planos", "nav.wallet": "Carteira",
  "nav.admin": "Painel Admin", "nav.agency": "Central de Agência", "nav.brain": "Cérebro do Negócio",
  "group.main": "Menu Principal", "group.revenue": "Receita", "group.automation": "Automação",
  "group.settings": "Configurações", "group.admin": "Administrativo", "group.home": "Início",
  "group.ops": "Operação", "group.agent": "Agente", "group.account": "Conta", "group.advanced": "Avançado",
  "header.hello": "Olá,", "header.overview": "Visão geral da sua conta", "header.search": "Buscar…",
  "common.save": "Salvar", "common.cancel": "Cancelar", "common.loading": "Carregando…",
  "common.refresh": "Atualizar", "common.active": "Ativo", "common.disabled": "Desativado",
  "common.yes": "Sim", "common.no": "Não",
  "auth.myAccount": "Minha conta", "auth.profile": "Perfil", "auth.signout": "Sair",
};

const nav_en = {
  "nav.dashboard": "Overview", "nav.copilot": "Copilot", "nav.leads": "Leads", "nav.results": "Results", "nav.white-label": "My agency", "group.agency": "Agency", "nav.campaigns": "Campaigns", "nav.audit": "Audit",
  "nav.creatives": "AI Creatives", "nav.approvals": "Approvals", "nav.rules": "Rules",
  "nav.autonomy": "Autonomy", "nav.profile": "Profile", "nav.plans": "Plans", "nav.wallet": "Wallet",
  "nav.admin": "Admin Panel", "nav.agency": "Agency Center", "nav.brain": "Business Brain",
  "nav.chat": "AI Chat",
  "group.main": "Main Menu", "group.revenue": "Revenue", "group.automation": "Automation",
  "group.settings": "Settings", "group.admin": "Administration", "group.home": "Home",
  "group.ops": "Operations", "group.agent": "Agent", "group.account": "Account", "group.advanced": "Advanced",
  "header.hello": "Hello,", "header.overview": "Your account overview", "header.search": "Search…",
  "common.save": "Save", "common.cancel": "Cancel", "common.loading": "Loading…", "common.refresh": "Refresh",
  "auth.myAccount": "My account", "auth.profile": "Profile", "auth.signout": "Sign out",
};

const nav_es = {
  "nav.dashboard": "Resumen", "nav.copilot": "Copiloto", "nav.leads": "Leads", "nav.results": "Resultados", "nav.white-label": "Mi agencia", "group.agency": "Agencia", "nav.campaigns": "Campañas", "nav.approvals": "Aprobaciones",
  "nav.rules": "Reglas", "nav.autonomy": "Autonomía", "nav.profile": "Perfil",
  "nav.plans": "Planes", "nav.wallet": "Billetera", "nav.admin": "Panel Admin",
  "nav.agency": "Central de Agencia", "nav.brain": "Cerebro del Negocio", "nav.chat": "Chat IA",
  "group.main": "Menú Principal", "group.revenue": "Ingresos", "group.automation": "Automatización",
  "group.settings": "Configuración", "group.admin": "Administrativo", "group.home": "Inicio",
  "group.ops": "Operación", "group.agent": "Agente", "group.account": "Cuenta", "group.advanced": "Avanzado",
  "header.hello": "Hola,", "header.search": "Buscar…", "common.refresh": "Actualizar",
};

const translations = {
  pt: { ...nav_pt },
  en: { ...nav_en },
  es: { ...nav_es },
  fr: { "nav.admin": "Panneau Admin" },
  ru: { "nav.admin": "Панель админа" },
};

function prettify(key) {
  const last = String(key).split(".").pop() || key;
  return last
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

export function getTranslation(lang, key) {
  const v = translations[lang]?.[key] ?? translations.pt?.[key];
  if (v != null) return v;
  return prettify(key); // chave de conteúdo perdida — rótulo legível de fallback
}

export default translations;
