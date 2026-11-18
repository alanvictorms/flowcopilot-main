"""
AI service — análise, scoring, geração e chat.

O provedor/modelo é definido pelo admin via services.llm (Gemini, OpenAI ou
credenciais próprias compatíveis com OpenAI). Este módulo só monta os prompts e
interpreta as respostas.
"""
import json
from typing import AsyncIterator

from services import llm


# Idioma de saída da IA. O conteúdo é gerado direto no idioma do usuário —
# assim NÃO dependemos de mapa de tradução para o texto que a IA produz.
LANG_NAMES = {
    "pt": "português do Brasil",
    "en": "English",
    "es": "español",
    "fr": "français",
    "ru": "русском языке (Russian)",
}


def _lang_rule(lang: str) -> str:
    name = LANG_NAMES.get((lang or "pt").lower(), LANG_NAMES["pt"])
    return f"SEMPRE responda em {name}, mesmo se o usuário escrever em outra língua."


CHAT_SYS = (
    "Você é o Meta Ads Autonomy — copiloto do gestor de tráfego, especialista em Meta Ads. "
    "Você tem acesso ao contexto da conta (fornecido no início da conversa) e mantém memória da conversa. "
    "REGRAS OBRIGATÓRIAS — VIOLAR QUALQUER UMA É ERRO GRAVE: "
    "1) O idioma da resposta é o definido na primeira linha deste prompt — obedeça-o rigorosamente, mesmo se o usuário escrever em outra língua. "
    "2) NUNCA use markdown em NENHUMA circunstância. É PROIBIDO usar: # ## ### #### asteriscos (* ou **) hífens em sequência (---) underscores em sequência (___) crases (`) ou blocos de código (```). "
    "3) NUNCA use asteriscos, hífens ou pontos como marcadores de lista (não use * item, - item, • item, ou 1. item). "
    "4) Se precisar listar coisas, use frases separadas por vírgula ou por quebra de linha simples, sem símbolos na frente. "
    "5) Escreva em parágrafos curtos, texto corrido e natural, como conversando com um amigo. "
    "6) Seja objetivo: no máximo 100 palavras por resposta, exceto se o usuário pedir aprofundamento. "
    "7) Ao criar campanha via chat: faça UMA pergunta objetiva e curta por vez, no final da resposta. Pergunte APENAS o essencial (produto, público, orçamento, oferta). Não pergunte detalhes técnicos que a IA pode inferir. "
    "8) Lembre-se de tudo o que foi conversado antes na mesma sessão. Consolide aprendizados. Não repita perguntas já respondidas. "
    "9) Seja pragmático e concreto. Ao propor otimização diga: o quê mudar, por quê, impacto esperado e risco — em uma ou duas frases."
)

CREATIVE_SYS = (
    "Você é um diretor criativo sênior avaliando criativos de Meta Ads. "
    "Sempre responda EM PORTUGUÊS DO BRASIL. "
    "Retorne JSON estrito com as chaves: score (0-100), pros (lista de strings em pt-BR), "
    "cons (lista em pt-BR), recommendations (lista em pt-BR), predicted_ctr_band (low/medium/high). "
    "Baseie o score em: força do hook, clareza, oferta, prova social, CTA e adequação à plataforma."
)

AUDIT_SYS = (
    "Você é o Meta Ads Autonomy — estrategista sênior de mídia paga. "
    "Sempre responda EM PORTUGUÊS DO BRASIL, texto corrido, sem markdown (#, *, ---, etc). "
    "Analise relatórios de auditoria de Meta Ads e produza insights priorizados. "
    "Foque em otimizações acionáveis, causas-raiz e impacto quantitativo. "
    "Nunca invente números; baseie cada afirmação nas evidências fornecidas."
)

CREATIVE_GEN_SYS = (
    "Você é copywriter e diretor criativo sênior de Meta Ads, especialista em criativos de ALTA CONVERSÃO. "
    "Sempre responda EM PORTUGUÊS DO BRASIL. "
    "Gere criativos prontos para subir, usando o contexto (produto, público, base de conhecimento da campanha). "
    "Retorne JSON ESTRITO: um ARRAY de objetos, cada um com as chaves: "
    "headline (título, máx 40 caracteres, pt-BR), "
    "primary_text (texto principal, 100 a 125 caracteres, pt-BR, com hook forte), "
    "description (máx 30 caracteres, pt-BR), "
    "cta (UM de: LEARN_MORE, SHOP_NOW, SIGN_UP, SUBSCRIBE, DOWNLOAD, BUY_NOW, GET_OFFER, CONTACT_US, ORDER_NOW), "
    "angle (ângulo/estratégia em pt-BR, ex: 'prova social', 'urgência', 'dor'), "
    "image_prompt (descrição rica EM INGLÊS para gerador de imagem). "
    "Varie os ângulos entre os criativos. Não invente dados; baseie-se no contexto. Retorne APENAS o array JSON."
)


async def analyze_audit(audit_report: dict) -> str:
    """Síntese não-streaming do relatório de auditoria."""
    prompt = (
        "Analyze this Meta Ads audit report JSON and produce:\n"
        "1) A one-paragraph executive summary in plain language.\n"
        "2) The top 5 prioritized actions (title + why + expected impact).\n"
        "3) Any red flags a media buyer must address today.\n"
        "Report:\n" + json.dumps(audit_report, ensure_ascii=False)[:15000]
    )
    return await llm.complete_text(f"audit-{audit_report.get('generated_at')}", AUDIT_SYS, prompt)


async def stream_chat(session_id: str, context_summary: str, user_text: str, lang: str = "pt") -> AsyncIterator[str]:
    """Streaming chat usado pelo endpoint SSE /api/ai/chat."""
    system = _lang_rule(lang) + "\n\n" + CHAT_SYS + "\n\nCONTEXT (account snapshot):\n" + context_summary[:6000]
    async for chunk in llm.stream_text(session_id, system, user_text):
        yield chunk


async def score_creative(payload: dict) -> dict:
    """Avalia um criativo. Retorna JSON com score e recomendações."""
    prompt = (
        "Score this Meta ad creative. Return ONLY valid JSON, no prose. "
        "Ad data:\n" + json.dumps(payload, ensure_ascii=False)
    )
    text = await llm.complete_text(f"creative-{payload.get('ad_name', 'x')}", CREATIVE_SYS, prompt)
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end != -1:
        try:
            return json.loads(text[start:end + 1])
        except Exception:
            pass
    return {"score": 0, "pros": [], "cons": [], "recommendations": [], "predicted_ctr_band": "unknown", "raw": text}


async def generate_creatives(context: dict, n: int = 3) -> list[dict]:
    """Gera N variações de criativo a partir do contexto da campanha/negócio."""
    prompt = (
        f"Gere {n} criativos DISTINTOS e de alta conversão para esta campanha. "
        "Cada um com um ângulo diferente. Contexto:\n" + json.dumps(context, ensure_ascii=False)[:12000]
    )
    text = await llm.complete_text(f"gencreative-{context.get('campaign_id', 'x')}", CREATIVE_GEN_SYS, prompt)
    start, end = text.find("["), text.rfind("]")
    if start != -1 and end != -1:
        try:
            arr = json.loads(text[start:end + 1])
            return arr if isinstance(arr, list) else []
        except Exception:
            pass
    return []


async def suggest_optimizations(context: dict) -> list[dict]:
    """Lista priorizada de otimizações a partir do contexto da conta."""
    prompt = (
        "Given this Meta Ads account context, return a JSON array of the top 6 optimizations. "
        "Each item MUST have: title, category (structure|budget|targeting|creative|bidding|tracking), "
        "target_type (campaign|adset|ad), target_id, change (short imperative), "
        "expected_impact (short), risk (low|medium|high), confidence (0-1). "
        "Return ONLY the JSON array. Context:\n" + json.dumps(context, ensure_ascii=False)[:12000]
    )
    text = await llm.complete_text(f"opt-{context.get('account_id', 'x')}", AUDIT_SYS, prompt)
    start, end = text.find("["), text.rfind("]")
    if start != -1 and end != -1:
        try:
            return json.loads(text[start:end + 1])
        except Exception:
            pass
    return []
