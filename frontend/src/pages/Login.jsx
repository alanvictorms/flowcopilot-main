import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, Mail, Lock, Eye, EyeOff, Github } from "lucide-react";

import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { GLSLHills } from "@/components/GLSLHills";

function GoogleIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 11v3.6h5.1c-.2 1.3-1.5 3.9-5.1 3.9-3.1 0-5.6-2.5-5.6-5.7S8.9 7.1 12 7.1c1.8 0 2.9.7 3.6 1.4l2.5-2.4C16.5 4.6 14.5 3.7 12 3.7 6.9 3.7 2.8 7.8 2.8 12.9S6.9 22 12 22c5.3 0 8.8-3.7 8.8-9 0-.6-.1-1.1-.2-1.6H12z" />
    </svg>
  );
}

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signin } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const saved = localStorage.getItem("fp_remember_email");
    if (saved) {
      setEmail(saved);
      setRemember(true);
    }
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", { email, password });
      if (remember) localStorage.setItem("fp_remember_email", email);
      else localStorage.removeItem("fp_remember_email");
      signin(data.user, data.access_token);
      toast.success(`Bem-vindo, ${data.user.name}`);
      navigate("/app/dashboard");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  const socialSoon = (provider) => {
    toast.info(`Login com ${provider} em breve.`);
  };

  const forgotPassword = () => {
    toast.info("Recuperação de senha em breve — fale com o administrador da conta.");
  };

  return (
    <div className="relative min-h-screen bg-[#09090b] text-white overflow-hidden">
      {/* Fundo animado — colinas GLSL */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <GLSLHills width="100vw" height="100vh" />
      </div>
      <div className="fixed inset-0 z-[1] pointer-events-none bg-gradient-to-b from-transparent via-transparent to-[#09090b]/80" />

      {/* Logo no canto */}
      <div className="absolute top-6 left-6 z-20 flex items-center gap-2.5">
        <img src="/flowpilot-icon.png" alt="FlowPilot" className="w-7 h-7" />
        <span className="text-sm font-semibold tracking-tight">FlowPilot</span>
      </div>

      {/* Card central */}
      <div className="relative z-10 min-h-screen flex items-center justify-center p-6">
        <form
          onSubmit={submit}
          className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#101014]/90 backdrop-blur-md p-8 shadow-2xl"
          data-testid="login-form"
        >
          <h1 className="text-2xl font-bold tracking-tight">Bem-vindo de volta</h1>
          <p className="mt-1 text-sm text-white/50">Faça login na sua conta.</p>

          <div className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium">E-mail</label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@exemplo.com"
                  className="w-full rounded-lg bg-[#17171c] border border-white/10 pl-10 pr-3.5 py-2.5 text-sm placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-white/20 transition"
                  data-testid="login-email-input"
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
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg bg-[#17171c] border border-white/10 pl-10 pr-10 py-2.5 text-sm placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-white/20 transition"
                  data-testid="login-password-input"
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

            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 cursor-pointer select-none text-white/60 hover:text-white/80 transition">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-white/20 bg-[#17171c] accent-white"
                  data-testid="login-remember"
                />
                Lembre de mim
              </label>
              <button
                type="button"
                onClick={forgotPassword}
                className="text-white/60 hover:text-white transition"
                data-testid="login-forgot"
              >
                Esqueceu sua senha?
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-white text-black font-medium text-sm py-2.5 hover:bg-white/90 transition disabled:opacity-60 flex items-center justify-center gap-2"
              data-testid="login-submit-btn"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Continuar
            </button>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-white/10" />
              <span className="text-[10px] font-medium tracking-widest text-white/40">OU</span>
              <div className="flex-1 h-px bg-white/10" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => socialSoon("GitHub")}
                className="rounded-lg border border-white/10 bg-[#17171c] py-2.5 text-sm font-medium flex items-center justify-center gap-2 hover:bg-[#1e1e24] transition"
                data-testid="login-github"
              >
                <Github className="w-4 h-4" /> GitHub
              </button>
              <button
                type="button"
                onClick={() => socialSoon("Google")}
                className="rounded-lg border border-white/10 bg-[#17171c] py-2.5 text-sm font-medium flex items-center justify-center gap-2 hover:bg-[#1e1e24] transition"
                data-testid="login-google"
              >
                <GoogleIcon className="w-4 h-4" /> Google
              </button>
            </div>
          </div>

          <div className="mt-6 text-center text-sm text-white/50">
            Não tem uma conta?{" "}
            <Link to="/register" className="text-white hover:underline" data-testid="login-goto-register">
              Crie uma
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
