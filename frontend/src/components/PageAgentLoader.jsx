import { useEffect } from "react";
import api from "@/lib/api";

// Integração do page-agent (https://github.com/alibaba/page-agent), só quando o
// admin liga. Aprendido do fonte (packages/page-agent/src/demo.ts):
//  - o build de demo AUTO-INICIA em chinês; usamos ?autoInit=false e iniciamos nós.
//  - a UI só aparece chamando `agent.panel.show()`.
//  - `language` suporta apenas "zh-CN" e "en-US" (outros caem no padrão chinês).
//  - no modo demo, as credenciais grátis embutidas são estas abaixo.
const DEMO_SRC = "https://cdn.jsdelivr.net/npm/page-agent@1.12.2/dist/iife/page-agent.demo.js?autoInit=false";
const SCRIPT_ID = "page-agent-script";
const DEMO_CREDS = {
  model: "qwen3.5-plus",
  baseURL: "https://page-ag-testing-ohftxirgbn.cn-shanghai.fcapp.run",
  apiKey: "NA",
};

function normalizeLang(l) {
  const v = String(l || "").toLowerCase();
  if (v.startsWith("zh")) return "zh-CN";
  return "en-US"; // page-agent só suporta zh-CN e en-US
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.getElementById(SCRIPT_ID)) return resolve();
    const s = document.createElement("script");
    s.id = SCRIPT_ID;
    s.src = src;
    s.async = true;
    s.crossOrigin = "anonymous";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Falha ao carregar o page-agent"));
    document.head.appendChild(s);
  });
}

export default function PageAgentLoader() {
  useEffect(() => {
    let cancelled = false;

    // Inicia (se preciso) e mostra o painel. Reutilizado no load e no botão do header.
    async function bootAndShow(showNow) {
      try {
        const { data } = await api.get("/page-agent/config");
        if (cancelled || !data?.enabled) return;

        // Já iniciado: só mostra.
        if (window.__flowpilotPageAgent) {
          if (showNow) { try { window.__flowpilotPageAgent.panel?.show?.(); } catch {} }
          return;
        }

        await loadScript(DEMO_SRC);
        if (cancelled) return;
        const Ctor = window.PageAgent;
        if (typeof Ctor !== "function") {
          console.warn("[page-agent] construtor window.PageAgent não encontrado.");
          return;
        }

        const opts = { language: normalizeLang(data.language) };
        if (data.use_demo) {
          Object.assign(opts, DEMO_CREDS); // API grátis embutida
        } else {
          if (data.model) opts.model = data.model;
          if (data.base_url) opts.baseURL = data.base_url;
          if (data.api_key) opts.apiKey = data.api_key;
        }
        try {
          const agent = new Ctor(opts);
          window.__flowpilotPageAgent = agent;
          if (showNow) agent.panel?.show?.(); // a UI só aparece com panel.show()
          console.log("[page-agent] iniciado", { language: opts.language, demo: !!data.use_demo });
        } catch (e) {
          console.warn("[page-agent] falha ao iniciar:", e);
        }
      } catch {
        /* config indisponível ou desligado — silencioso */
      }
    }

    // No carregamento, deixa o agente pronto e visível (comportamento atual).
    bootAndShow(true);
    // Botão no header re-abre o painel a qualquer momento.
    const onShow = () => bootAndShow(true);
    window.addEventListener("flowpilot:page-agent-show", onShow);
    return () => { cancelled = true; window.removeEventListener("flowpilot:page-agent-show", onShow); };
  }, []);

  return null;
}
