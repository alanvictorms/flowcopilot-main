import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, Mail, Lock, User, Eye, EyeOff } from "lucide-react";

import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/lib/brand";
import { GLSLHills } from "@/components/GLSLHills";

export default function Register() {
  const brand = useBrand();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signin } = useAuth();
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post("/auth/register", { name, email, password });
      signin(data.user, data.access_token);
      toast.success("Conta criada. Vamos configurar o Meta Ads.");
      navigate("/app/settings");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  const inputCls =
    "w-full rounded-lg bg-[#17171c] border border-white/10 pl-10 pr-3.5 py-2.5 text-sm placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-white/20 transition";

  return (
    <div className="relative min-h-screen bg-[#09090b] text-white overflow-hidden">
      <div className="fixed inset-0 z-0 pointer-events-none">
        <GLSLHills width="100vw" height="100vh" />
      </div>
      <div className="fixed inset-0 z-[1] pointer-events-none bg-gradient-to-b from-transparent via-transparent to-[#09090b]/80" />

      <div className="absolute top-6 left-6 z-20 flex items-center gap-2.5">
        <img src={brand.logo} alt={brand.name} className="w-7 h-7 object-contain" />
        <span className="text-sm font-semibold tracking-tight">{brand.name}</span>
      </div>

      <div className="relative z-10 min-h-screen flex items-center justify-center p-6">
        <form
          onSubmit={submit}
          className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#101014]/90 backdrop-blur-md p-8 shadow-2xl"
          data-testid="register-form"
        >
          <h1 className="text-2xl font-bold tracking-tight">Crie sua conta</h1>
          <p className="mt-1 text-sm text-white/50">Grátis para testar. Sem cartão de crédito.</p>

          <div className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="name" className="text-sm font-medium">Nome</label>
              <div className="relative">
                <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
                <input
                  id="name" required value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Seu nome"
                  className={inputCls}
                  data-testid="register-name-input"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium">E-mail</label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
                <input
                  id="email" type="email" required autoComplete="email" value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@exemplo.com"
                  className={inputCls}
                  data-testid="register-email-input"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium">Senha</label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required minLength={6} autoComplete="new-password" value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className={`${inputCls} pr-10`}
                  data-testid="register-password-input"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition"
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-white text-black font-medium text-sm py-2.5 hover:bg-white/90 transition disabled:opacity-60 flex items-center justify-center gap-2"
              data-testid="register-submit-btn"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Criar conta
            </button>
          </div>

          <div className="mt-6 text-center text-sm text-white/50">
            Já tem uma conta?{" "}
            <Link to="/login" className="text-white hover:underline" data-testid="register-goto-login">
              Entrar
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
