import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Users, CreditCard, Coins, Link2, Settings2, ScrollText,
  Bell, RefreshCw, Cpu, Building2, Bot, Sparkles,
} from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const ADMIN_SECTIONS = [
  { to: "/app/admin/users", icon: Users, label: "Usuários" },
  { to: "/app/admin/tenants", icon: Building2, label: "Agências" },
  { to: "/app/admin/plans", icon: CreditCard, label: "Planos" },
  { to: "/app/admin/resources", icon: Coins, label: "Recursos" },
  { to: "/app/admin/referrals", icon: Link2, label: "Indicações" },
  { to: "/app/admin/payments", icon: Settings2, label: "Pagamentos" },
  { to: "/app/admin/notifications", icon: Bell, label: "Notificações" },
  { to: "/app/admin/audit", icon: ScrollText, label: "Auditoria" },
  { to: "/app/admin/llm", icon: Sparkles, label: "Modelos IA" },
  { to: "/app/admin/llm-usage", icon: Cpu, label: "Consumo IA" },
  { to: "/app/admin/page-agent", icon: Bot, label: "Agente da Página" },
  { to: "/app/agency", icon: Building2, label: "Agência" },
];

export default function Admin() {
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();
  const isRoot = location.pathname === "/app/admin" || location.pathname === "/app/admin/";

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/admin/overview");
        setOverview(data);
      } catch (err) {
        toast.error(formatApiError(err.response?.data?.detail));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (isRoot) navigate("/app/admin/users", { replace: true });
  }, [isRoot, navigate]);

  return (
    <div className="space-y-6" data-testid="admin-page">
      <Card className="p-6 rounded-2xl">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Users className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <div className="text-lg font-semibold">Painel Administrativo</div>
            <div className="text-sm text-muted-foreground mt-1">
              {overview ? `${overview.total_users} usuários · ${overview.active_users} ativos · ${overview.meta_connected} Meta conectados` : "Carregando..."}
            </div>
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap gap-2">
        {ADMIN_SECTIONS.map((s) => {
          const Icon = s.icon;
          return (
            <NavLink key={s.to} to={s.to}>
              {({ isActive }) => (
                <Button variant={isActive ? "default" : "outline"} size="sm" className="rounded-full">
                  <Icon className="w-3.5 h-3.5 mr-1" /> {s.label}
                </Button>
              )}
            </NavLink>
          );
        })}
      </div>

      <Outlet />
    </div>
  );
}
