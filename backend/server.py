"""
Meta Ads AI Autonomy Dashboard - Main FastAPI application.
Wires auth, meta ads integration, audit engine, AI service, automation rules.
"""
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient

from routes.auth import router as auth_router
from routes.meta import router as meta_router
from routes.audit import router as audit_router
from routes.ai import router as ai_router
from routes.rules import router as rules_router
from routes.dashboard import router as dashboard_router
from routes.autonomy import router as autonomy_router
from routes.automation import router as automation_router, automation_loop
from routes.budget import router as budget_router
from routes.rollback import router as rollback_router
from routes.builder import router as builder_router
from routes.ledger import router as ledger_router
from routes.safety import router as safety_router
from routes.twin import router as twin_router
from routes.memory import router as memory_router
from routes.fatigue import router as fatigue_router
from routes.experiments import router as experiments_router
from routes.autopilot import router as autopilot_router
from routes.intelligence import router as intelligence_router
from routes.profit import router as profit_router
from routes.funnel import router as funnel_router
from routes.agency import router as agency_router
from routes.datahub import router as datahub_router
from routes.actions import router as actions_router
from routes.business import router as business_router
from routes.growth import router as growth_router
from routes.admin import router as admin_router
from routes.policy import router as policy_router
from routes.tracking import router as tracking_router
from routes.lifecycle import router as lifecycle_router
from routes.notifications import router as notifications_router
from routes.strategy import router as strategy_router
from routes.audiences import router as audiences_router
from routes.leadquality import router as leadquality_router
from routes.capacity import router as capacity_router
from routes.seasonality import router as seasonality_router
from routes.creative_factory import router as creative_factory_router
from routes.objections import router as objections_router
from routes.brand_guard import router as brand_guard_router
from routes.plans import router as plans_router
from routes.payments import router as payments_router
from routes.referrals import router as referrals_router
from routes.wallet import router as wallet_router
from routes.page_agent import router as page_agent_router
from routes.campaign_knowledge import router as campaign_knowledge_router
from routes.journey import router as journey_router
from routes.tenants import router as tenants_router
from services.db import init_db_indexes
from services.seed import seed_resources, seed_plans
from services import llm
from services.seed import seed_resources


logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

mongo_url = os.environ['MONGO_URL']
db_name = os.environ['DB_NAME']
client = AsyncIOMotorClient(mongo_url)
db = client[db_name]


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_db_indexes(db)
    logger.info(f"Connected to MongoDB db='{db_name}' and indexes ensured")
    inserted = await seed_resources(db)
    logger.info(f"Resource catalog seeded ({inserted} new resource(s))")
    plans_inserted = await seed_plans(db)
    logger.info(f"Default plans seeded ({plans_inserted} new plan(s))")
    await llm.load_from_db(db)
    logger.info(f"LLM config loaded (mode={llm.get_config().get('mode')})")
    app.state.db = db
    import asyncio
    task = asyncio.create_task(automation_loop(db))
    yield
    # Shutdown
    task.cancel()
    client.close()


app = FastAPI(title="Meta Ads AI Autonomy", lifespan=lifespan)

app.include_router(auth_router)
app.include_router(meta_router)
app.include_router(audit_router)
app.include_router(ai_router)
app.include_router(rules_router)
app.include_router(dashboard_router)
app.include_router(autonomy_router)
app.include_router(automation_router)
app.include_router(budget_router)
app.include_router(rollback_router)
app.include_router(builder_router)
app.include_router(ledger_router)
app.include_router(safety_router)
app.include_router(twin_router)
app.include_router(memory_router)
app.include_router(fatigue_router)
app.include_router(experiments_router)
app.include_router(autopilot_router)
app.include_router(intelligence_router)
app.include_router(profit_router)
app.include_router(funnel_router)
app.include_router(agency_router)
app.include_router(datahub_router)
app.include_router(actions_router)
app.include_router(business_router)
app.include_router(growth_router)
app.include_router(admin_router)
app.include_router(policy_router)
app.include_router(tracking_router)
app.include_router(lifecycle_router)
app.include_router(notifications_router)
app.include_router(strategy_router)
app.include_router(audiences_router)
app.include_router(leadquality_router)
app.include_router(capacity_router)
app.include_router(seasonality_router)
app.include_router(creative_factory_router)
app.include_router(objections_router)
app.include_router(brand_guard_router)
app.include_router(plans_router)
app.include_router(payments_router)
app.include_router(referrals_router)
app.include_router(wallet_router)
app.include_router(page_agent_router)
app.include_router(campaign_knowledge_router)
app.include_router(journey_router)
app.include_router(tenants_router)


@app.get("/api/")
async def root():
    return {"service": "Meta Ads AI Autonomy", "version": "1.0.0"}


app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)
