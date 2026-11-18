"""MongoDB helpers: dependency injection, index initialization."""
import os
from fastapi import Request
from motor.motor_asyncio import AsyncIOMotorDatabase


def get_db(request: Request) -> AsyncIOMotorDatabase:
    return request.app.state.db


async def init_db_indexes(db: AsyncIOMotorDatabase):
    await db.users.create_index("email", unique=True)
    await db.meta_settings.create_index("user_id", unique=True)
    await db.journeys.create_index("landing_slug", sparse=True)
    await db.leads.create_index([("user_id", 1), ("created_at", -1)])
    await db.campaigns_cache.create_index([("user_id", 1), ("id", 1)], unique=True)
    await db.audits.create_index([("user_id", 1), ("created_at", -1)])
    await db.chat_messages.create_index([("session_id", 1), ("created_at", 1)])
    await db.automation_rules.create_index([("user_id", 1), ("created_at", -1)])
    await db.optimization_events.create_index([("user_id", 1), ("created_at", -1)])
    await db.autonomy_settings.create_index("user_id", unique=True)
    await db.automation_runs.create_index([("user_id", 1), ("created_at", -1)])
    await db.campaign_drafts.create_index([("user_id", 1), ("created_at", -1)])
    await db.optimization_events.create_index("id")
    await db.safety_scans.create_index([("user_id", 1), ("scanned_at", -1)])
    await db.strategy_memory.create_index([("user_id", 1), ("created_at", -1)])
    await db.experiments.create_index([("user_id", 1), ("created_at", -1)])
    await db.creative_packs.create_index([("user_id", 1), ("created_at", -1)])
    await db.market_reports.create_index([("user_id", 1), ("created_at", -1)])
    await db.crm_events.create_index([("user_id", 1), ("received_at", -1)])
    await db.webhook_tokens.create_index("token", unique=True)
    await db.webhook_tokens.create_index("user_id", unique=True)
    await db.funnel_diagnostics.create_index([("user_id", 1), ("created_at", -1)])
    await db.agency_clients.create_index([("user_id", 1), ("created_at", -1)])
    # Hub de dados histórico
    await db.metrics_daily.create_index(
        [("user_id", 1), ("level", 1), ("object_id", 1), ("date", 1)], unique=True
    )
    await db.metrics_daily.create_index([("user_id", 1), ("date", -1)])
    await db.datahub_state.create_index("user_id", unique=True)
    await db.entity_snapshots.create_index([("user_id", 1), ("fetched_at", -1)])
    # Control Plane / Planejador de ações
    await db.action_plans.create_index([("user_id", 1), ("created_at", -1)])
    await db.action_plans.create_index([("user_id", 1), ("status", 1)])
    await db.action_plans.create_index("id", unique=True)
    # Decision Ledger (append-only)
    await db.decision_ledger.create_index([("user_id", 1), ("created_at", -1)])
    await db.decision_ledger.create_index("id", unique=True)
    # Business Intelligence Core
    await db.business_products.create_index([("user_id", 1), ("created_at", -1)])
    await db.business_profile.create_index("user_id", unique=True)
    # Memória de atividade + perfil consolidado do agente
    await db.user_activity.create_index([("user_id", 1), ("created_at", -1)])
    await db.agent_profile.create_index("user_id", unique=True)
    # Policy Guardian e Monitor de Tracking
    await db.policy_reviews.create_index([("user_id", 1), ("created_at", -1)])
    await db.tracking_incidents.create_index([("user_id", 1), ("created_at", -1)])
