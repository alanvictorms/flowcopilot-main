import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Megaphone, ShieldCheck, Sparkles, MessageSquare, Bot,
  GitBranch, Wand2, LogOut, PanelLeftClose, PanelLeft,
  Wallet, Undo2, Bell, Search, PlusCircle, ShieldAlert, Activity,
  FlaskConical, Brain, ScrollText, Radar, TrendingUp, Stethoscope,
  TestTube2, UserCog, Moon, Sun, User, Inbox,
  Recycle, Radio, Users, Target, UserCheck, Gauge, CalendarDays,
  CreditCard, Coins, RefreshCw,
  ChevronDown, ChevronRight,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import api from "@/lib/api";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage, LANGS } from "@/contexts/LanguageContext";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import HelpTooltip from "@/components/HelpTooltip";
import FloatingChat from "@/components/FloatingChat";
import Flag from "@/components/Flag";
import PageAgentLoader from "@/components/PageAgentLoader";

// ── Navegação enxuta (8 grupos) ───────────────────────────────────
// Os módulos ainda não fundidos ficam em "Avançado" (recolhível). Nada foi
// removido: todas as rotas continuam acessíveis enquanto consolidamos.
const HOME_NAV = [
  { to: "/app/dashboard", i18nKey: "nav.dashboard", icon: LayoutDashboard, testid: "nav-dashboard" },
];

const OPS_NAV = [
  { to: "/app/campaigns", i18nKey: "nav.campaigns", icon: Megaphone, testid: "nav-campaigns" },
  { to: "/app/creatives", i18nKey: "nav.creatives", icon: Sparkles, testid: "nav-creatives" },
  { to: "/app/approvals", i18nKey: "nav.approvals", icon: Inbox, testid: "nav-approvals" },
  { to: "/app/chat", i18nKey: "nav.chat", icon: MessageSquare, testid: "nav-chat" },
];

const AGENT_NAV = [
  { to: "/app/autonomy", i18nKey: "nav.autonomy", icon: ShieldAlert, testid: "nav-autonomy" },
  { to: "/app/business", i18nKey: "nav.brain", icon: Brain, testid: "nav-business" },
];

const ACCOUNT_NAV = [
  { to: "/app/profile", i18nKey: "nav.profile", icon: User, testid: "nav-profile" },
  { to: "/app/plans", i18nKey: "nav.plans", icon: CreditCard, testid: "nav-plans" },
  { to: "/app/wallet", i18nKey: "nav.wallet", icon: Coins, testid: "nav-wallet" },
];

const ADMIN_NAV = [
  { to: "/app/admin", i18nKey: "nav.admin", icon: UserCog, testid: "nav-admin" },
];

// Tudo que será fundido em Campanhas / Criativos / Autonomia nas próximas fases.
const ADVANCED_NAV = [
  { to: "/app/audit", i18nKey: "nav.audit", icon: ShieldCheck, testid: "nav-audit" },
  { to: "/app/optimizations", i18nKey: "nav.optimizations", icon: Wand2, testid: "nav-optimizations" },
  { to: "/app/funnel", i18nKey: "nav.funnel", icon: Stethoscope, testid: "nav-funnel" },
  { to: "/app/profit", i18nKey: "nav.profit", icon: TrendingUp, testid: "nav-profit" },
  { to: "/app/lead-quality", i18nKey: "nav.lead-quality", icon: UserCheck, testid: "nav-lead-quality" },
  { to: "/app/experiments", i18nKey: "nav.experiments", icon: TestTube2, testid: "nav-experiments" },
  { to: "/app/audiences", i18nKey: "nav.audiences", icon: Users, testid: "nav-audiences" },
  { to: "/app/strategy", i18nKey: "nav.strategy", icon: Target, testid: "nav-strategy" },
  { to: "/app/budget", i18nKey: "nav.budget", icon: Wallet, testid: "nav-budget" },
  { to: "/app/rules", i18nKey: "nav.rules", icon: GitBranch, testid: "nav-rules" },
  { to: "/app/automation", i18nKey: "nav.automation", icon: Activity, testid: "nav-automation" },
  { to: "/app/policy", i18nKey: "nav.policy", icon: ShieldCheck, testid: "nav-policy" },
  { to: "/app/tracking", i18nKey: "nav.tracking", icon: Radio, testid: "nav-tracking" },
  { to: "/app/capacity", i18nKey: "nav.capacity", icon: Gauge, testid: "nav-capacity" },
  { to: "/app/seasonality", i18nKey: "nav.seasonality", icon: CalendarDays, testid: "nav-seasonality" },
  { to: "/app/twin", i18nKey: "nav.twin", icon: FlaskConical, testid: "nav-twin" },
  { to: "/app/lifecycle", i18nKey: "nav.lifecycle", icon: Recycle, testid: "nav-lifecycle" },
  { to: "/app/builder", i18nKey: "nav.builder", icon: PlusCircle, testid: "nav-builder" },
  { to: "/app/intelligence", i18nKey: "nav.intelligence", icon: Radar, testid: "nav-intelligence" },
  { to: "/app/safety", i18nKey: "nav.safety", icon: ShieldCheck, testid: "nav-safety" },
  { to: "/app/rollback", i18nKey: "nav.rollback", icon: Undo2, testid: "nav-rollback" },
  { to: "/app/ledger", i18nKey: "nav.ledger", icon: ScrollText, testid: "nav-ledger" },
  { to: "/app/memory", i18nKey: "nav.memory", icon: Brain, testid: "nav-memory" },
  { to: "/app/notifications", i18nKey: "nav.notifications", icon: Bell, testid: "nav-notifications" },
];

function getHelpKey(pathname) {
  const slug = pathname.replace("/app/", "").split("/")[0];
  return `help.${slug}`;
}

export default function DashboardLayout() {
  const { user, signout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { lang, setLang, t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [creditBalance, setCreditBalance] = useState(null);
  const [advOpen, setAdvOpen] = useState(false);
  const [pageAgentEnabled, setPageAgentEnabled] = useState(false);

  const loadBalance = useCallback(async () => {
    try {
      const { data } = await api.get("/wallet/balance");
      setCreditBalance(data?.balance ?? 0);
    } catch {}
  }, []);

  useEffect(() => { loadBalance(); }, [loadBalance]);

  useEffect(() => {
    api.get("/page-agent/config").then(({ data }) => setPageAgentEnabled(!!data?.enabled)).catch(() => {});
  }, []);

  const advActive = ADVANCED_NAV.some((n) => location.pathname.startsWith(n.to));
  useEffect(() => { if (advActive) setAdvOpen(true); }, [advActive]);

  const isDashboard = location.pathname === "/app/dashboard" || location.pathname === "/app";
  const allNav = [...HOME_NAV, ...OPS_NAV, ...AGENT_NAV, ...ACCOUNT_NAV, ...ADMIN_NAV, ...ADVANCED_NAV];
  const activeItem = allNav.find((n) => location.pathname.startsWith(n.to));
  const currentLang = LANGS.find((l) => l.code === lang) || LANGS[0];
  const initials = (user?.name || user?.email || "U").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  const helpKey = getHelpKey(location.pathname);
  const helpText = t(helpKey);

  const NavGroup = ({ titleKey, items }) => (
    <div className="mb-3">
      {!collapsed && (
        <div className="px-4 mb-1 text-[10px] font-mono uppercase tracking-widest text-white/30">{t(titleKey)}</div>
      )}
      <div className="space-y-0.5 px-2">
        {items.map((item) => (
          <NavLink key={item.to} to={item.to} onClick={() => setMobileOpen(false)} data-testid={item.testid}
            title={collapsed ? t(item.i18nKey) : undefined}
            className={({ isActive }) =>
              `group flex items-center gap-3 rounded-xl py-2 text-sm transition-colors ${
                collapsed ? "justify-center px-0" : "px-3"
              } ${
                isActive ? "bg-primary text-primary-foreground font-medium" : "text-white/60 hover:bg-white/5 hover:text-white"
              }`
            }>
            <item.icon className="w-4 h-4 shrink-0" />
            {!collapsed && <span className="truncate">{t(item.i18nKey)}</span>}
          </NavLink>
        ))}
      </div>
    </div>
  );

  const sidebarContent = (
    <>
      {collapsed ? (
        <div className="py-3 flex flex-col items-center gap-2 shrink-0">
          <img src="/flowpilot-icon.png" alt="FlowPilot" className="w-8 h-8 shrink-0" />
          <button onClick={() => setCollapsed(false)} className="text-white/40 hover:text-white/80 p-1 rounded-md" data-testid="sidebar-expand-btn">
            <PanelLeft className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="h-14 flex items-center gap-3 px-4 shrink-0 overflow-hidden">
          <img src="/flowpilot-icon.png" alt="FlowPilot" className="w-8 h-8 shrink-0" />
          <div className="flex-1 min-w-0 flex items-center justify-between">
            <div className="text-white font-semibold text-sm whitespace-nowrap">FlowPilot</div>
            <button onClick={() => setCollapsed(true)} className="text-white/40 hover:text-white/80 p-1 rounded-md shrink-0" data-testid="sidebar-collapse-btn">
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      {!collapsed && (
        <div className="px-3 mb-3 shrink-0">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
            <input placeholder={t("header.search")} className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-primary" data-testid="sidebar-search" />
          </div>
        </div>
      )}
      <nav className="flex-1 overflow-y-auto hide-scrollbar py-1">
        <NavGroup titleKey="group.home" items={HOME_NAV} />
        <NavGroup titleKey="group.ops" items={OPS_NAV} />
        <NavGroup titleKey="group.agent" items={AGENT_NAV} />
        <NavGroup titleKey="group.account" items={ACCOUNT_NAV} />
        {user?.is_admin && <NavGroup titleKey="group.admin" items={ADMIN_NAV} />}
        {collapsed ? (
          <NavGroup titleKey="group.advanced" items={ADVANCED_NAV} />
        ) : (
          <div className="mb-3">
            <button
              onClick={() => setAdvOpen((o) => !o)}
              className="w-full px-4 mb-1 flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-white/30 hover:text-white/60 transition-colors"
              data-testid="nav-advanced-toggle"
            >
              {advOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              {t("group.advanced")}
            </button>
            {advOpen && (
              <div className="space-y-0.5 px-2">
                {ADVANCED_NAV.map((item) => (
                  <NavLink key={item.to} to={item.to} onClick={() => setMobileOpen(false)} data-testid={item.testid}
                    className={({ isActive }) =>
                      `group flex items-center gap-3 rounded-xl py-2 px-3 text-sm transition-colors ${
                        isActive ? "bg-primary text-primary-foreground font-medium" : "text-white/60 hover:bg-white/5 hover:text-white"
                      }`
                    }>
                    <item.icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{t(item.i18nKey)}</span>
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        )}
      </nav>
    </>
  );

  return (
    <div className="h-screen flex overflow-hidden" style={{ backgroundColor: "hsl(var(--sidebar-bg))" }}>
      {mobileOpen && <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setMobileOpen(false)} />}

      <aside className={`hidden md:flex flex-col shrink-0 h-screen overflow-hidden transition-[width] duration-200 ${collapsed ? "w-[68px]" : "w-[300px]"}`} style={{ backgroundColor: "hsl(var(--sidebar-bg))" }} data-testid="app-sidebar">
        {sidebarContent}
      </aside>

      <aside className={`fixed inset-y-0 left-0 z-50 w-[250px] flex flex-col md:hidden transition-transform duration-200 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`} style={{ backgroundColor: "hsl(var(--sidebar-bg))" }}>
        {sidebarContent}
      </aside>

      <div className="flex-1 min-w-0 flex flex-col h-screen p-2 pl-0">
        <div className="flex-1 bg-background rounded-4xl overflow-hidden flex flex-col shadow-sm">
          <header className="h-14 flex items-center px-4 md:px-6 gap-3 shrink-0 border-b border-border/30">
            <button onClick={() => setMobileOpen(!mobileOpen)} className="md:hidden w-8 h-8 rounded-lg bg-muted hover:bg-accent flex items-center justify-center" data-testid="mobile-menu-btn">
              <PanelLeft className="w-4 h-4" />
            </button>
            {collapsed && (
              <button onClick={() => setCollapsed(false)} className="hidden md:flex w-8 h-8 rounded-lg bg-muted hover:bg-accent items-center justify-center" data-testid="header-expand-btn">
                <PanelLeft className="w-4 h-4" />
              </button>
            )}
            <div className="flex-1 min-w-0">
              {isDashboard ? (
                <>
                  <div className="flex items-center gap-2">
                    <h1 className="text-[25px] font-semibold tracking-tight truncate" data-testid="page-title">{t("header.hello")} {user?.name?.split(" ")[0] || "usuário"}!</h1>
                    <HelpTooltip text={helpText !== helpKey ? helpText : undefined} />
                  </div>
                  <p className="text-[11px] text-muted-foreground">{t("header.overview")}</p>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-semibold tracking-tight truncate" data-testid="page-title">
                    {activeItem ? t(activeItem.i18nKey) : "FlowPilot"}
                  </h1>
                  <HelpTooltip text={helpText !== helpKey ? helpText : undefined} />
                </div>
              )}
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="h-8 px-2 rounded-lg bg-muted hover:bg-accent flex items-center justify-center" data-testid="lang-btn" title={currentLang.label}>
                  <Flag code={currentLang.code} className="w-5 h-auto" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {LANGS.map((l) => (
                  <DropdownMenuItem key={l.code} onClick={() => setLang(l.code)} data-testid={`lang-${l.code}`}>
                    <Flag code={l.code} className="w-5 h-auto mr-2" /> {l.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <button onClick={toggleTheme} className="w-8 h-8 rounded-lg bg-muted hover:bg-accent flex items-center justify-center" data-testid="theme-toggle-btn">
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button onClick={() => navigate("/app/notifications")} className="w-8 h-8 rounded-lg bg-muted hover:bg-accent flex items-center justify-center relative" data-testid="notifications-btn">
              <Bell className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-primary" />
            </button>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent("flowpilot:open-chat"))}
              className="w-8 h-8 rounded-lg bg-muted hover:bg-accent flex items-center justify-center"
              data-testid="header-chat-btn"
              title={t("nav.chat")}
            >
              <MessageSquare className="w-4 h-4" />
            </button>
            {pageAgentEnabled && (
              <button
                onClick={() => window.dispatchEvent(new CustomEvent("flowpilot:page-agent-show"))}
                className="w-8 h-8 rounded-lg bg-muted hover:bg-accent flex items-center justify-center"
                data-testid="header-page-agent-btn"
                title="Agente da página"
              >
                <Bot className="w-4 h-4" />
              </button>
            )}
            <div className="hidden sm:flex items-center rounded-lg bg-muted overflow-hidden" data-testid="header-balance-group">
              <button
                onClick={() => navigate("/app/wallet")}
                className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-accent text-xs font-medium"
                data-testid="header-balance"
                title={t("nav.wallet")}
              >
                <Coins className="w-3.5 h-3.5 text-primary" />
                <span>{creditBalance != null ? creditBalance.toLocaleString() : "—"}</span>
              </button>
              <button
                onClick={loadBalance}
                className="px-2 py-1.5 border-l border-border/40 hover:bg-accent text-muted-foreground"
                title={t("common.refresh")}
                data-testid="header-balance-refresh"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-lg pl-1 pr-2 py-1 hover:bg-accent" data-testid="user-menu-trigger">
                  <Avatar className="w-7 h-7">
                    <AvatarFallback className="bg-primary text-primary-foreground text-[10px] font-semibold">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="hidden lg:block text-left">
                    <div className="text-xs font-medium">{user?.name}</div>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>{t("auth.myAccount")}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/app/wallet")} data-testid="menu-wallet">
                  <Coins className="w-4 h-4 mr-2" />
                  <span className="flex-1">{t("nav.wallet")}</span>
                  <span className="text-xs font-mono text-muted-foreground">{creditBalance != null ? creditBalance.toLocaleString() : "—"}</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/app/profile")} data-testid="menu-profile">
                  <User className="w-4 h-4 mr-2" /> {t("auth.profile")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => { signout(); navigate("/login"); }} data-testid="menu-signout">
                  <LogOut className="w-4 h-4 mr-2" /> {t("auth.signout")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </header>

          <main className="flex-1 px-4 md:px-6 pb-6 pt-4 overflow-y-auto scrollbar-thin">
            <Outlet />
          </main>
        </div>
      </div>

      <FloatingChat />
      <PageAgentLoader />
    </div>
  );
}
