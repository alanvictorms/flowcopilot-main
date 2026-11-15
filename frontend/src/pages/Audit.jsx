import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PlayCircle, RefreshCw, TrendingUp, ShieldCheck, AlertOctagon, CheckCircle2, XCircle, AlertTriangle, Info } from "lucide-react";

import api, { formatApiError } from "@/lib/api";
import { useLanguage } from "@/contexts/LanguageContext";
import EmptyMetaState from "@/components/EmptyMetaState";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const T = {
  pt: {
    audit: "Auditoria da conta", last: "Última auditoria", noAudit: "Ainda sem auditoria",
    run: "Rodar auditoria", aiBtn: "Análise IA", cats: "Categorias", weighted: "Pontuação por área",
    findings: "Achados detalhados", checks: "verificações", grouped: "por categoria",
    coverage: "Cobertura", grade: "Grade", gen: "gerada em", runFirst: "Rode a auditoria para descobrir issues.",
    score: "score", insight: "Insights IA", exec: "Análise executiva", clickAi: "Clique em \"Análise IA\" para gerar.",
    rec: "Recomendação",
    sev: { critical: "Crítico", high: "Alto", medium: "Médio", low: "Baixo", info: "Info" },
    stat: { pass: "Aprovado", warning: "Alerta", fail: "Falha", unknown: "—", not_applicable: "N/A" },
    cat: { structure: "Estrutura", budget: "Orçamento", targeting: "Segmentação", creative: "Criativos", bidding: "Lances", tracking: "Rastreamento", compliance: "Conformidade", performance: "Desempenho" },
  },
  en: {
    audit: "Account Audit", last: "Last audit", noAudit: "No audit yet",
    run: "Run audit", aiBtn: "AI Analysis", cats: "Categories", weighted: "Score by area",
    findings: "Detailed Findings", checks: "checks", grouped: "by category",
    coverage: "Coverage", grade: "Grade", gen: "generated at", runFirst: "Run the first audit to discover issues.",
    score: "score", insight: "AI Insights", exec: "Executive analysis", clickAi: "Click \"AI Analysis\" to generate.",
    rec: "Recommendation",
    sev: { critical: "Critical", high: "High", medium: "Medium", low: "Low", info: "Info" },
    stat: { pass: "Pass", warning: "Warning", fail: "Fail", unknown: "—", not_applicable: "N/A" },
    cat: { structure: "Structure", budget: "Budget", targeting: "Targeting", creative: "Creative", bidding: "Bidding", tracking: "Tracking", compliance: "Compliance", performance: "Performance" },
  },
  es: {
    audit: "Auditoría", last: "Última auditoría", noAudit: "Sin auditoría",
    run: "Ejecutar", aiBtn: "Análisis IA", cats: "Categorías", weighted: "Puntuación por área",
    findings: "Hallazgos", checks: "verificaciones", grouped: "por categoría",
    coverage: "Cobertura", grade: "Grado", gen: "generada en", runFirst: "Ejecute la auditoría.",
    score: "puntuación", insight: "Insights IA", exec: "Análisis ejecutivo", clickAi: "Clic en \"Análisis IA\".",
    rec: "Recomendación",
    sev: { critical: "Crítico", high: "Alto", medium: "Medio", low: "Bajo", info: "Info" },
    stat: { pass: "Aprobado", warning: "Alerta", fail: "Falla", unknown: "—", not_applicable: "N/A" },
    cat: { structure: "Estructura", budget: "Presupuesto", targeting: "Segmentación", creative: "Creativos", bidding: "Pujas", tracking: "Seguimiento", compliance: "Cumplimiento", performance: "Rendimiento" },
  },
  fr: {
    audit: "Audit du compte", last: "Dernier audit", noAudit: "Pas d'audit",
    run: "Lancer", aiBtn: "Analyse IA", cats: "Catégories", weighted: "Score par domaine",
    findings: "Résultats", checks: "vérifications", grouped: "par catégorie",
    coverage: "Couverture", grade: "Note", gen: "généré le", runFirst: "Lancez le premier audit.",
    score: "score", insight: "Insights IA", exec: "Analyse exécutive", clickAi: "Cliquez sur \"Analyse IA\".",
    rec: "Recommandation",
    sev: { critical: "Critique", high: "Élevé", medium: "Moyen", low: "Faible", info: "Info" },
    stat: { pass: "Réussi", warning: "Alerte", fail: "Échec", unknown: "—", not_applicable: "N/A" },
    cat: { structure: "Structure", budget: "Budget", targeting: "Ciblage", creative: "Créatifs", bidding: "Enchères", tracking: "Suivi", compliance: "Conformité", performance: "Performance" },
  },
  ru: {
    audit: "Аудит аккаунта", last: "Последний аудит", noAudit: "Нет аудита",
    run: "Запустить", aiBtn: "Анализ ИИ", cats: "Категории", weighted: "Баллы по области",
    findings: "Результаты", checks: "проверок", grouped: "по категории",
    coverage: "Покрытие", grade: "Оценка", gen: "создано", runFirst: "Запустите аудит.",
    score: "балл", insight: "Выводы ИИ", exec: "Анализ отчёта", clickAi: "Нажмите «Анализ ИИ».",
    rec: "Рекомендация",
    sev: { critical: "Критич.", high: "Высок.", medium: "Средн.", low: "Низк.", info: "Инфо" },
    stat: { pass: "Ок", warning: "Внимание", fail: "Провал", unknown: "—", not_applicable: "Н/Д" },
    cat: { structure: "Структура", budget: "Бюджет", targeting: "Таргетинг", creative: "Креативы", bidding: "Ставки", tracking: "Отслеживание", compliance: "Соответствие", performance: "Показатели" },
  },
};

const SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
const SEV_COLORS = { critical: "text-red-600 bg-red-500/10 border-red-500/20", high: "text-orange-600 bg-orange-500/10 border-orange-500/20", medium: "text-yellow-600 bg-yellow-500/10 border-yellow-500/20", low: "text-blue-600 bg-blue-500/10 border-blue-500/20", info: "text-muted-foreground bg-muted border-border" };
const STAT_ICON = { pass: CheckCircle2, warning: AlertTriangle, fail: XCircle, unknown: Info, not_applicable: Info };
const STAT_COLOR = { pass: "text-green-600", warning: "text-yellow-600", fail: "text-red-600", unknown: "text-muted-foreground", not_applicable: "text-muted-foreground" };

export default function Audit() {
  const { lang } = useLanguage();
  const t = T[lang] || T.pt;
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [notConnected, setNotConnected] = useState(false);
  const [report, setReport] = useState(null);
  const [aiInsight, setAiInsight] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const loadLatest = async () => {
    setLoading(true); setNotConnected(false);
    try { const { data } = await api.get("/audit/latest"); setReport(data); }
    catch (err) { if (err.response?.status === 428) setNotConnected(true); else if (err.response?.status !== 404) toast.error(formatApiError(err.response?.data?.detail)); }
    finally { setLoading(false); }
  };
  useEffect(() => { loadLatest(); }, []);

  const runAudit = async () => {
    setRunning(true);
    try { const { data } = await api.post("/audit/run"); setReport(data); toast.success(`Auditoria concluída · score ${data.overall_score}`); setAiInsight(""); }
    catch (err) { if (err.response?.status === 428) setNotConnected(true); else toast.error(formatApiError(err.response?.data?.detail)); }
    finally { setRunning(false); }
  };

  const runAi = async () => {
    if (!report) return;
    setAiLoading(true);
    const langMap = { pt: "português do Brasil", en: "English", es: "español", fr: "français", ru: "русский" };
    try {
      const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/ai/chat/stream`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("mfa_token")}` },
        body: JSON.stringify({ message: `Analise a última auditoria e dê um sumário executivo com 5 ações priorizadas. Responda em ${langMap[lang] || "português"}.` }),
      });
      const reader = res.body.getReader(); const decoder = new TextDecoder(); let txt = ""; setAiInsight("");
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        for (const line of decoder.decode(value, { stream: true }).split("\n")) {
          if (line.startsWith("data:")) { try { const j = JSON.parse(line.slice(5).trim()); if (j.delta) { txt += j.delta; setAiInsight(txt); } } catch {} }
        }
      }
    } catch { toast.error("Erro ao gerar insights."); }
    finally { setAiLoading(false); }
  };

  if (notConnected) return <EmptyMetaState />;

  const cats = report?.categories || {};
  const findings = (report?.findings || []).slice().sort((a, b) => (SEV_ORDER[a.severity] - SEV_ORDER[b.severity]));
  const byCat = findings.reduce((acc, f) => { acc[f.category] = acc[f.category] || []; acc[f.category].push(f); return acc; }, {});

  return (
    <div className="space-y-6" data-testid="audit-page">
      {/* Header card */}
      <Card className="relative overflow-hidden">
        <div className="absolute inset-0 subtle-grid-bg opacity-20 pointer-events-none" />
        <CardContent className="relative p-6 flex flex-wrap items-center gap-6">
          <div className="w-20 h-20 rounded-full border-2 border-border flex items-center justify-center bg-card">
            <div className="text-center"><div className="text-2xl font-bold">{report ? report.overall_score : "—"}</div><div className="text-[9px] font-mono uppercase text-muted-foreground">{t.score}</div></div>
          </div>
          <div className="flex-1 min-w-[200px]">
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{t.audit}</div>
            <h2 className="text-xl font-semibold">{report ? t.last : t.noAudit}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {report ? `${t.coverage} ${report.coverage_pct}% · ${t.grade} ${report.grade} · ${t.gen} ${new Date(report.generated_at).toLocaleString()}` : t.runFirst}
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={runAudit} disabled={running} data-testid="audit-run-btn" size="sm">
              {running ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <PlayCircle className="w-4 h-4 mr-1" />} {t.run}
            </Button>
            <Button variant="outline" disabled={!report || aiLoading} onClick={runAi} data-testid="audit-ai-insight-btn" size="sm">
              <TrendingUp className="w-4 h-4 mr-1" /> {t.aiBtn}
            </Button>
          </div>
        </CardContent>
      </Card>

      {report && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Categories */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2"><div className="text-sm font-semibold">{t.cats}</div><div className="text-xs text-muted-foreground">{t.weighted}</div></CardHeader>
            <CardContent className="space-y-3">
              {Object.entries(cats).map(([name, agg]) => (
                <div key={name}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2 text-sm"><ShieldCheck className="w-3.5 h-3.5 text-primary" />{t.cat[name] || name}</div>
                    <div className="text-xs font-mono"><span className="text-foreground">{agg.score}</span> <span className="text-muted-foreground">· {agg.pass} / {agg.warning} / {agg.fail}</span></div>
                  </div>
                  <Progress value={agg.score} className="h-1.5" />
                </div>
              ))}
            </CardContent>
          </Card>

          {/* AI Insight */}
          <Card>
            <CardHeader className="pb-2"><div className="text-sm font-semibold flex items-center gap-2"><TrendingUp className="w-4 h-4 text-primary" />{t.insight}</div></CardHeader>
            <CardContent>
              {aiLoading && !aiInsight && <div className="space-y-2"><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-4/5" /><Skeleton className="h-3 w-3/5" /></div>}
              {aiInsight ? <div className="text-sm leading-relaxed whitespace-pre-wrap max-h-[300px] overflow-y-auto scrollbar-thin">{aiInsight}</div>
               : !aiLoading && <div className="text-xs text-muted-foreground py-6 text-center">{t.clickAi}</div>}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Findings */}
      {report && (
        <Card>
          <CardHeader className="pb-2">
            <div className="text-sm font-semibold flex items-center gap-2"><AlertOctagon className="w-4 h-4 text-primary" />{t.findings}</div>
            <div className="text-xs text-muted-foreground">{findings.length} {t.checks} · {t.grouped}</div>
          </CardHeader>
          <CardContent>
            <Accordion type="multiple" className="w-full">
              {Object.entries(byCat).map(([cat, items]) => (
                <AccordionItem key={cat} value={cat}>
                  <AccordionTrigger data-testid={`audit-cat-${cat}`}>
                    <div className="flex items-center gap-3 text-sm">{t.cat[cat] || cat} <Badge variant="outline" className="text-[10px] font-mono">{items.length}</Badge></div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-2">
                      {items.map((f) => {
                        const StatIcon = STAT_ICON[f.status] || Info;
                        return (
                          <div key={f.id} className="rounded-xl border border-border p-4 flex gap-3" data-testid={`audit-finding-${f.id}`}>
                            <StatIcon className={`w-5 h-5 shrink-0 mt-0.5 ${STAT_COLOR[f.status] || ""}`} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <span className="text-sm font-medium">{f.title}</span>
                                <span className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded-full border ${SEV_COLORS[f.severity] || ""}`}>{t.sev[f.severity] || f.severity}</span>
                              </div>
                              <div className="text-xs text-muted-foreground">{f.message}</div>
                              {f.recommendation && (
                                <div className="text-xs mt-2 p-2 rounded-lg bg-primary/5 border border-primary/10">
                                  <span className="text-primary font-semibold text-[10px] uppercase">{t.rec}:</span> {f.recommendation}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      )}

      {loading && !report && <div className="grid grid-cols-1 lg:grid-cols-3 gap-4"><Skeleton className="h-40 lg:col-span-2" /><Skeleton className="h-40" /></div>}
    </div>
  );
}
