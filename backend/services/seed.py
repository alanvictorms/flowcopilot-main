"""
Seed de recursos da aplicação.

Roda no startup para garantir que TODOS os recursos que consomem IA/créditos
já estejam cadastrados no banco. O admin só precisa definir o custo em créditos
por uso (credits_per_use) — nome, descrição e categoria já vêm prontos em pt-BR.

Regra importante: o valor de crédito definido pelo admin NUNCA é sobrescrito.
Usamos $setOnInsert para credits_per_use, então só o primeiro cadastro define o
default; edições feitas no painel permanecem intactas a cada reinício.
"""
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorDatabase


# resource_key, nome (pt-BR), categoria, descrição, default de créditos por uso
DEFAULT_RESOURCES = [
    ("ai_chat", "Chat com o copiloto IA", "IA",
     "Cada mensagem enviada ao copiloto (assistente de tráfego).", 1),
    ("creative_score", "Avaliação de criativo", "Criativo",
     "Nota e recomendações geradas pela IA para um criativo.", 1),
    ("optimization_suggest", "Sugestões de otimização", "Otimização",
     "Lista de otimizações recomendadas pela IA para a conta.", 2),
    ("audit_analysis", "Análise de auditoria", "Auditoria",
     "Síntese executiva e plano de ação a partir da auditoria da conta.", 2),
    ("creative_generation", "Geração de criativos", "Criativo",
     "Geração de textos/variações de criativo pela IA.", 2),
    ("strategy_plan", "Plano de estratégia de campanha", "Estratégia",
     "Plano de mídia/estratégia gerado a partir do negócio e dos dados.", 3),
    ("funnel_analysis", "Análise de funil", "Funil",
     "Diagnóstico do funil (etapas, gargalos e recomendações).", 2),
    ("policy_review", "Revisão de política", "Conformidade",
     "Checagem de conformidade do criativo/anúncio antes de publicar.", 1),
    ("audience_intel", "Inteligência de públicos", "Público",
     "Sugestões de públicos e segmentação geradas pela IA.", 2),
    ("objection_creative", "Objeções em criativo", "Criativo",
     "Transforma objeções de venda em ângulos de criativo.", 1),
    ("brand_guard", "Brand & Originality Guard", "Marca",
     "Verificação de aderência à marca e originalidade do criativo.", 1),
    ("autopilot_run", "Execução do Autopilot", "Autonomia",
     "Ciclo autônomo do agente (análise + ações propostas/executadas).", 3),
]


async def seed_resources(db: AsyncIOMotorDatabase) -> int:
    """Garante que todos os recursos padrão existam. Retorna quantos foram inseridos."""
    now = datetime.now(timezone.utc).isoformat()
    inserted = 0
    for key, name, category, description, default_credits in DEFAULT_RESOURCES:
        res = await db.resource_pricing.update_one(
            {"resource_key": key},
            {
                # Metadados sempre atualizados (nome/descrição/categoria podem evoluir)
                "$set": {
                    "resource_key": key,
                    "name": name,
                    "category": category,
                    "description": description,
                    "active": True,
                    "updated_at": now,
                },
                # Custo em créditos: só define no primeiro cadastro; edições do admin ficam.
                "$setOnInsert": {
                    "credits_per_use": default_credits,
                    "created_at": now,
                },
            },
            upsert=True,
        )
        if res.upserted_id is not None:
            inserted += 1
    return inserted


# Planos padrão. Estratégia: NÃO travar recursos por plano — todos têm acesso
# total ao agente e às ferramentas. Os planos diferem pela QUANTIDADE de créditos
# incluídos e pelo custo por crédito (desconto em planos maiores). Valores são
# exemplos; o admin edita tudo no painel. Só semeamos se ainda não houver planos.
DEFAULT_PLANS = [
    {
        "name": "Starter",
        "description": "Para começar e validar — negócios pequenos e testes.",
        "price": 97.0,
        "credits": 1000,
        "duration_days": 30,
        "features": [
            "Acesso total ao agente e às ferramentas",
            "1.000 créditos por mês",
            "Autonomia: recomendação e aprovação",
            "Suporte por e-mail",
        ],
        "highlight": False,
        "order": 1,
    },
    {
        "name": "Pro",
        "description": "Para quem roda tráfego de verdade — mais volume, melhor custo por crédito.",
        "price": 297.0,
        "credits": 4000,
        "duration_days": 30,
        "features": [
            "Tudo do Starter",
            "4.000 créditos por mês (melhor custo/crédito)",
            "Autonomia automática com limites de segurança",
            "Ciclos do agente mais frequentes",
            "Suporte prioritário",
        ],
        "highlight": True,
        "order": 2,
    },
    {
        "name": "Scale",
        "description": "Para operações e agências — alto volume e autonomia máxima.",
        "price": 697.0,
        "credits": 12000,
        "duration_days": 30,
        "features": [
            "Tudo do Pro",
            "12.000 créditos por mês (menor custo/crédito)",
            "Autonomia máxima e ciclos mais frequentes",
            "Múltiplas contas de anúncio",
            "Suporte dedicado",
        ],
        "highlight": False,
        "order": 3,
    },
]


async def seed_plans(db: AsyncIOMotorDatabase) -> int:
    """Cria planos padrão só se a coleção estiver vazia (não sobrescreve o admin)."""
    import uuid
    existing = await db.subscription_plans.count_documents({})
    if existing:
        return 0
    now = datetime.now(timezone.utc).isoformat()
    docs = []
    for p in DEFAULT_PLANS:
        docs.append({"id": str(uuid.uuid4()), **p, "active": True, "created_at": now})
    if docs:
        await db.subscription_plans.insert_many(docs)
    return len(docs)
