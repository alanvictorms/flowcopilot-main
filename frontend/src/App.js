import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import "@/App.css";

import { Loader2 } from "lucide-react";
import api from "@/lib/api";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { Toaster } from "@/components/ui/sonner";

import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Landing from "@/pages/Landing";
import DashboardLayout from "@/components/layout/DashboardLayout";
import Dashboard from "@/pages/Dashboard";
import Campaigns from "@/pages/Campaigns";
import Audit from "@/pages/Audit";
import Creatives from "@/pages/Creatives";
import CreativesHub from "@/pages/CreativesHub";
import AIChat from "@/pages/AIChat";
import Rules from "@/pages/Rules";
import Optimizations from "@/pages/Optimizations";
import Settings from "@/pages/Settings";
import Profile from "@/pages/Profile";
import Autonomy from "@/pages/Autonomy";
import Automation from "@/pages/Automation";
import Budget from "@/pages/Budget";
import Rollback from "@/pages/Rollback";
import Builder from "@/pages/Builder";
import Ledger from "@/pages/Ledger";
import Safety from "@/pages/Safety";
import Twin from "@/pages/Twin";
import Memory from "@/pages/Memory";
import Fatigue from "@/pages/Fatigue";
import Experiments from "@/pages/Experiments";
import Autopilot from "@/pages/Autopilot";
import Intelligence from "@/pages/Intelligence";
import Profit from "@/pages/Profit";
import Funnel from "@/pages/Funnel";
import Agency from "@/pages/Agency";
import CampaignDetail from "@/pages/CampaignDetail";
import Approvals from "@/pages/Approvals";
import Business from "@/pages/Business";
import Policy from "@/pages/Policy";
import Tracking from "@/pages/Tracking";
import Lifecycle from "@/pages/Lifecycle";
import Admin from "@/pages/Admin";
import AdminUsers from "@/pages/AdminUsers";
import AdminUserDetail from "@/pages/AdminUserDetail";
import AdminPlans from "@/pages/AdminPlans";
import AdminResources from "@/pages/AdminResources";
import AdminReferrals from "@/pages/AdminReferrals";
import AdminPayments from "@/pages/AdminPayments";
import AdminNotifications from "@/pages/AdminNotifications";
import AdminAudit from "@/pages/AdminAudit";
import AdminLLMUsage from "@/pages/AdminLLMUsage";
import AdminPageAgent from "@/pages/AdminPageAgent";
import AdminLLMConfig from "@/pages/AdminLLMConfig";
import Notifications from "@/pages/Notifications";
import Strategy from "@/pages/Strategy";
import Audiences from "@/pages/Audiences";
import LeadQuality from "@/pages/LeadQuality";
import Capacity from "@/pages/Capacity";
import Seasonality from "@/pages/Seasonality";
import CreativeFactory from "@/pages/CreativeFactory";
import ObjectionLoop from "@/pages/Objections";
import BrandGuard from "@/pages/BrandGuard";
import Plans from "@/pages/Plans";
import WalletPage from "@/pages/Wallet";
import Onboarding from "@/pages/Onboarding";

function Protected({ children }) {
  const { user } = useAuth();
  if (user === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">
        <div data-testid="app-loading" className="text-sm">Carregando…</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AdminOnly({ children }) {
  const { user } = useAuth();
  if (user === undefined) return null;
  if (!user?.is_admin) return <Navigate to="/app/dashboard" replace />;
  return children;
}

function PublicOnly({ children }) {
  const { user } = useAuth();
  if (user === undefined) return null;
  if (user) return <Navigate to="/app/dashboard" replace />;
  return children;
}

// Primeiro acesso: se o onboarding ainda não foi concluído, leva ao fluxo guiado.
function OnboardingGate({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  if (user && user.onboarding_completed === false && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }
  return children;
}

function LoginAs() {
  const { signin } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  useEffect(() => {
    const t = params.get("token");
    if (!t) { navigate("/login", { replace: true }); return; }
    localStorage.setItem("mfa_token", t);
    api.get("/auth/me", { headers: { Authorization: `Bearer ${t}` } })
      .then(({ data }) => { signin(data, t); navigate("/app/dashboard", { replace: true }); })
      .catch(() => { localStorage.removeItem("mfa_token"); navigate("/login", { replace: true }); });
  }, []);
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
            <Route path="/login-as" element={<LoginAs />} />
            <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />
            <Route path="/onboarding" element={<Protected><Onboarding /></Protected>} />
            <Route
              path="/app"
              element={
                <Protected>
                  <OnboardingGate>
                    <DashboardLayout />
                  </OnboardingGate>
                </Protected>
              }
            >
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="campaigns" element={<Campaigns />} />
              <Route path="audit" element={<Audit />} />
              <Route path="creatives" element={<CreativesHub />} />
              <Route path="chat" element={<AIChat />} />
              <Route path="rules" element={<Rules />} />
              <Route path="optimizations" element={<Optimizations />} />
              <Route path="settings" element={<Settings />} />
              <Route path="profile" element={<Profile />} />
              <Route path="autonomy" element={<Autonomy />} />
              <Route path="automation" element={<Automation />} />
              <Route path="budget" element={<Budget />} />
              <Route path="rollback" element={<Rollback />} />
              <Route path="builder" element={<Builder />} />
              <Route path="ledger" element={<Ledger />} />
              <Route path="safety" element={<Safety />} />
              <Route path="twin" element={<Twin />} />
              <Route path="memory" element={<Memory />} />
              <Route path="fatigue" element={<Fatigue />} />
              <Route path="experiments" element={<Experiments />} />
              <Route path="autopilot" element={<Autopilot />} />
              <Route path="intelligence" element={<Intelligence />} />
              <Route path="profit" element={<Profit />} />
              <Route path="approvals" element={<Approvals />} />
              <Route path="business" element={<Business />} />
              <Route path="policy" element={<Policy />} />
              <Route path="tracking" element={<Tracking />} />
              <Route path="lifecycle" element={<Lifecycle />} />
              <Route path="admin" element={<AdminOnly><Admin /></AdminOnly>}>
                <Route index element={<Navigate to="users" replace />} />
                <Route path="users" element={<AdminUsers />} />
                <Route path="users/:userId" element={<AdminUserDetail />} />
                <Route path="plans" element={<AdminPlans />} />
                <Route path="resources" element={<AdminResources />} />
                <Route path="referrals" element={<AdminReferrals />} />
                <Route path="payments" element={<AdminPayments />} />
                <Route path="notifications" element={<AdminNotifications />} />
                <Route path="audit" element={<AdminAudit />} />
                <Route path="llm-usage" element={<AdminLLMUsage />} />
                <Route path="page-agent" element={<AdminPageAgent />} />
                <Route path="llm" element={<AdminLLMConfig />} />
              </Route>
              <Route path="funnel" element={<Funnel />} />
              <Route path="agency" element={<AdminOnly><Agency /></AdminOnly>} />
              <Route path="notifications" element={<Notifications />} />
              <Route path="strategy" element={<Strategy />} />
              <Route path="audiences" element={<Audiences />} />
              <Route path="lead-quality" element={<LeadQuality />} />
              <Route path="capacity" element={<Capacity />} />
              <Route path="seasonality" element={<Seasonality />} />
              <Route path="creative-factory" element={<CreativeFactory />} />
              <Route path="objections" element={<ObjectionLoop />} />
              <Route path="brand-guard" element={<BrandGuard />} />
              <Route path="plans" element={<Plans />} />
              <Route path="wallet" element={<WalletPage />} />
              <Route path="campaigns/:id" element={<CampaignDetail />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <Toaster position="top-right" richColors closeButton />
        </BrowserRouter>
      </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
