import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2, CheckCircle2 } from "lucide-react";
import api, { formatApiError } from "@/lib/api";

export default function PublicLanding() {
  const { slug } = useParams();
  const [page, setPage] = useState(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", email: "", phone: "", answers: {} });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    api.get(`/public/lp/${slug}`).then(({ data }) => {
      setPage(data);
      document.title = data.landing?.headline || data.name || "";
      if (/^\d+$/.test(data.pixel_id || "") && !window.fbq) {
        /* eslint-disable */
        !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
        /* eslint-enable */
        window.fbq("init", data.pixel_id);
        window.fbq("track", "PageView");
      }
    }).catch(() => setError("Página não encontrada."));
  }, [slug]);

  const submit = async (e) => {
    e.preventDefault();
    setSending(true);
    try { await api.post(`/public/lp/${slug}/lead`, form); setSent(true); window.fbq?.("track", "Lead"); }
    catch (err) { setError(formatApiError(err.response?.data?.detail)); }
    finally { setSending(false); }
  };

  if (error && !page) return <div className="min-h-screen grid place-items-center bg-white text-slate-600">{error}</div>;
  if (!page) return <div className="min-h-screen grid place-items-center bg-white"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>;

  const lp = page.landing || {};
  const color = /^#[0-9a-f]{3,8}$/i.test(lp.cor || "") ? lp.cor : "#2563eb";
  const input = "w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 focus:outline-none focus:ring-2";

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <section className="px-4 py-16 sm:py-24 text-center text-white" style={{ background: `linear-gradient(135deg, ${color}, #0f172a)` }}>
        <div className="max-w-3xl mx-auto space-y-5">
          <h1 className="text-3xl sm:text-5xl font-bold leading-tight">{lp.headline}</h1>
          {lp.subheadline && <p className="text-lg sm:text-xl text-white/85">{lp.subheadline}</p>}
          <a href="#aplicar" className="inline-block rounded-full bg-white px-8 py-3 font-semibold" style={{ color }}>{lp.cta || "Quero aplicar"}</a>
        </div>
      </section>

      <div className="max-w-3xl mx-auto px-4 py-12 space-y-12">
        {lp.beneficios?.length > 0 && (
          <section className="grid sm:grid-cols-3 gap-4">
            {lp.beneficios.map((b, i) => (
              <div key={i} className="rounded-2xl border border-slate-200 p-5 text-sm"><CheckCircle2 className="w-5 h-5 mb-2" style={{ color }} />{b}</div>
            ))}
          </section>
        )}
        {lp.para_quem?.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-2xl font-bold">Para quem é</h2>
            <ul className="space-y-2">{lp.para_quem.map((p, i) => <li key={i} className="flex gap-2"><span style={{ color }}>✓</span>{p}</li>)}</ul>
          </section>
        )}
        {lp.prova && <section className="rounded-2xl bg-slate-50 p-6 text-slate-700 italic">{lp.prova}</section>}

        <section id="aplicar" className="rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm">
          {sent ? (
            <div className="text-center space-y-2 py-6">
              <CheckCircle2 className="w-10 h-10 mx-auto" style={{ color }} />
              <div className="text-xl font-semibold">Aplicação recebida!</div>
              <div className="text-slate-600">Em breve entraremos em contato.</div>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              <h2 className="text-2xl font-bold mb-2">Faça sua aplicação</h2>
              <input required placeholder="Seu nome" className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <input required type="email" placeholder="Seu e-mail" className={input} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <input placeholder="WhatsApp" className={input} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              {(lp.perguntas_aplicacao || []).map((q, i) => (
                <textarea key={i} placeholder={q} rows={2} className={input}
                  value={form.answers[q] || ""} onChange={(e) => setForm({ ...form, answers: { ...form.answers, [q]: e.target.value } })} />
              ))}
              {error && <div className="text-sm text-red-600">{error}</div>}
              <button disabled={sending} className="w-full rounded-full py-3 font-semibold text-white disabled:opacity-60" style={{ background: color }}>
                {sending ? "Enviando..." : lp.cta || "Enviar aplicação"}
              </button>
            </form>
          )}
        </section>

        {lp.faq?.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-2xl font-bold">Perguntas frequentes</h2>
            {lp.faq.map((f, i) => (
              <details key={i} className="rounded-xl border border-slate-200 p-4">
                <summary className="font-medium cursor-pointer">{f.q}</summary>
                <p className="mt-2 text-slate-600">{f.a}</p>
              </details>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
