"""
Planejador de Ações Executáveis + Central de Aprovações
(Camada 2 · itens 11 e 8 do roadmap).

Toda recomendação vira um ActionPlan estruturado (o quê, onde, por quê,
com quais limites) que passa pelo Control Plane. Aqui ficam os endpoints
de proposta, fila de aprovação, aprovação/rejeição e verificação.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from services.db import get_db
from services.security import get_current_user
from services.meta_client import MetaAPIError
from services import control_plane
from services.activity import log_activity
from routes.autonomy import load_autonomy
from routes.meta import get_meta_client

router = APIRouter(prefix="/api/actions", tags=["actions"])


class RollbackCondition(BaseModel):
    metric: str = "cpa"            # métrica vigiada na pós-verificação
    direction: str = "increase"    # increase = piora se subir | decrease = piora se cair
    threshold_pct: float = 30.0


class ProposeIn(BaseModel):
    action_type: str               # pause | activate | change_budget
    target_type: str               # campaign | adset | ad
    target_id: str
    target_name: str = ""
    proposed_state: dict = Field(default_factory=dict)
    change_pct: float = 0.0
    reason: str
    evidence_metrics: dict = Field(default_factory=dict)
    expected_impact: str = ""
    observation_hours: Optional[int] = None
    rollback_condition: Optional[RollbackCondition] = None
    source: str = "user"           # user | ai
    source_ref: str = ""


class RejectIn(BaseModel):
    justification: str = Field(min_length=5, description="Justificativa obrigatória")


@router.post("/propose")
async def propose(
    body: ProposeIn,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    if not body.reason.strip():
        raise HTTPException(status_code=400, detail="Motivo é obrigatório — planos ambíguos são rejeitados")
    autonomy = await load_autonomy(db, user["id"])
    plan = await control_plane.propose(
        db, user["id"], autonomy,
        source=body.source if body.source in ("user", "ai") else "user",
        source_ref=body.source_ref,
        action_type=body.action_type,
        target_type=body.target_type,
        target_id=body.target_id,
        target_name=body.target_name,
        proposed_state=body.proposed_state,
        change_pct=body.change_pct,
        reason=body.reason,
        evidence_metrics=body.evidence_metrics,
        expected_impact=body.expected_impact,
        observation_hours=body.observation_hours,
        rollback_condition=body.rollback_condition.model_dump() if body.rollback_condition else None,
    )

    await log_activity(db, user["id"], "action_proposed",
                       f"Propôs {body.action_type} em {body.target_name or body.target_id}",
                       {"plan_id": plan.get("id"), "action_type": body.action_type,
                        "status": plan.get("status")})

    # Ação autorizada pelo comitê em modo auto → executa imediatamente
    if plan.get("status") == control_plane.AUTHORIZED:
        client = await get_meta_client(user, db)
        result = await control_plane.execute(db, user["id"], plan, client, actor=plan.get("source", "user"))
        plan["execution"] = result
        plan["status"] = control_plane.EXECUTED if result.get("ok") else control_plane.FAILED
    return plan


@router.get("")
async def list_plans(
    status: Optional[str] = None,
    limit: int = 100,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    q = {"user_id": user["id"]}
    if status:
        q["status"] = status
    cur = db.action_plans.find(q, {"_id": 0, "user_id": 0}).sort("created_at", -1).limit(limit)
    return [d async for d in cur]


@router.get("/pending")
async def pending(user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    cur = db.action_plans.find(
        {"user_id": user["id"], "status": control_plane.PENDING},
        {"_id": 0, "user_id": 0},
    ).sort("created_at", -1).limit(100)
    return [d async for d in cur]


@router.get("/summary")
async def summary(user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    counts = {}
    async for d in db.action_plans.aggregate([
        {"$match": {"user_id": user["id"]}},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
    ]):
        counts[d["_id"] or "unknown"] = d["count"]
    return {
        "pending": counts.get(control_plane.PENDING, 0),
        "executed": counts.get(control_plane.EXECUTED, 0),
        "verified_kept": counts.get(control_plane.VERIFIED_KEPT, 0),
        "rolled_back": counts.get(control_plane.ROLLED_BACK, 0),
        "blocked": counts.get(control_plane.BLOCKED, 0),
        "rejected": counts.get(control_plane.REJECTED, 0),
        "failed": counts.get(control_plane.FAILED, 0),
        "by_status": counts,
    }


@router.get("/{plan_id}")
async def get_plan(plan_id: str, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    d = await db.action_plans.find_one({"id": plan_id, "user_id": user["id"]}, {"_id": 0, "user_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Plano não encontrado")
    return d


@router.post("/{plan_id}/approve")
async def approve(plan_id: str, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    client = await get_meta_client(user, db)
    try:
        result = await control_plane.approve_and_execute(db, user["id"], plan_id, client)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except MetaAPIError as e:
        raise HTTPException(status_code=400, detail=e.detail)
    await log_activity(db, user["id"], "action_approved",
                       f"Aprovou o plano {plan_id}", {"plan_id": plan_id, "ok": result.get("ok")})
    return result


@router.post("/{plan_id}/reject")
async def reject_plan(
    plan_id: str,
    body: RejectIn,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    try:
        result = await control_plane.reject(db, user["id"], plan_id, body.justification)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    await log_activity(db, user["id"], "action_rejected",
                       f"Rejeitou o plano {plan_id}: {body.justification[:120]}",
                       {"plan_id": plan_id, "justification": body.justification})
    return result


@router.post("/verify-now")
async def verify_now(user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    """Roda manualmente as pós-verificações vencidas."""
    client = await get_meta_client(user, db)
    results = await control_plane.run_due_verifications(db, user["id"], client)
    return {"verified": len(results), "results": results}
