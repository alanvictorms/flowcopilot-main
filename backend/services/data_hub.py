"""
Hub Unificado de Dados (Camada 1 · item 3 do roadmap).

Constrói a base histórica própria: métricas diárias por campanha/conjunto/anúncio
persistidas em `metrics_daily`, snapshots de entidades em `entity_snapshots` e
estado de sincronização em `datahub_state`.

É a fonte de baseline/séries para o Motor Estatístico, o Control Plane e o
Orquestrador — a IA deixa de depender só do resumo de 30 dias da Meta.
"""
import logging
from datetime import datetime, timezone, timedelta

from motor.motor_asyncio import AsyncIOMotorDatabase

from services.meta_client import MetaClient, MetaAPIError

logger = logging.getLogger(__name__)

LEVELS = ["campaign", "adset", "ad"]
FIRST_SYNC_DAYS = 30       # profundidade da primeira sincronização
RECONCILE_DAYS = 3         # re-busca dias recentes p/ capturar atribuição atrasada


def _f(x) -> float:
    try:
        return float(x or 0)
    except Exception:
        return 0.0


def normalize_row(row: dict, level: str) -> dict:
    """Extrai métricas planas de uma linha de insights da Meta."""
    purchases = 0.0
    leads = 0.0
    for a in row.get("actions") or []:
        at = a.get("action_type")
        if at == "purchase":
            purchases += _f(a.get("value"))
        elif at == "lead":
            leads += _f(a.get("value"))
    purchase_value = 0.0
    for a in row.get("action_values") or []:
        if a.get("action_type") == "purchase":
            purchase_value += _f(a.get("value"))
    roas = 0.0
    for r in row.get("purchase_roas") or []:
        v = _f(r.get("value"))
        if v > roas:
            roas = v
    id_key = {"campaign": "campaign_id", "adset": "adset_id", "ad": "ad_id"}[level]
    name_key = {"campaign": "campaign_name", "adset": "adset_name", "ad": "ad_name"}[level]
    spend = _f(row.get("spend"))
    return {
        "object_id": row.get(id_key),
        "object_name": row.get(name_key),
        "campaign_id": row.get("campaign_id"),
        "adset_id": row.get("adset_id"),
        "date": row.get("date_start"),
        "spend": round(spend, 2),
        "impressions": _f(row.get("impressions")),
        "clicks": _f(row.get("clicks")),
        "ctr": _f(row.get("ctr")),
        "cpc": _f(row.get("cpc")),
        "cpm": _f(row.get("cpm")),
        "reach": _f(row.get("reach")),
        "frequency": _f(row.get("frequency")),
        "purchases": purchases,
        "leads": leads,
        "purchase_value": round(purchase_value, 2),
        "roas": round(roas, 4),
        "cpa": round(spend / purchases, 2) if purchases else 0.0,
        "cpl": round(spend / leads, 2) if leads else 0.0,
    }


async def sync_user(db: AsyncIOMotorDatabase, user_id: str, client: MetaClient) -> dict:
    """Sincronização incremental de métricas diárias + snapshot de entidades."""
    state = await db.datahub_state.find_one({"user_id": user_id}) or {}
    today = datetime.now(timezone.utc).date()
    last = state.get("last_synced_date")
    if last:
        since_date = datetime.fromisoformat(last).date() - timedelta(days=RECONCILE_DAYS)
    else:
        since_date = today - timedelta(days=FIRST_SYNC_DAYS)
    since, until = since_date.isoformat(), today.isoformat()

    upserted = {lvl: 0 for lvl in LEVELS}
    errors = []
    for level in LEVELS:
        try:
            rows = await client.insights(level=level, since=since, until=until, time_increment=1)
        except MetaAPIError as e:
            errors.append({"level": level, "error": str(e.detail)[:300]})
            continue
        for raw in rows:
            doc = normalize_row(raw, level)
            if not doc["object_id"] or not doc["date"]:
                continue
            doc["user_id"] = user_id
            doc["level"] = level
            doc["synced_at"] = datetime.now(timezone.utc).isoformat()
            await db.metrics_daily.update_one(
                {"user_id": user_id, "level": level, "object_id": doc["object_id"], "date": doc["date"]},
                {"$set": doc},
                upsert=True,
            )
            upserted[level] += 1

    # Snapshot de entidades (estrutura/estado/orçamentos) — histórico mesmo pós-exclusão
    entities = {}
    try:
        entities["campaigns"] = await client.list_campaigns()
        entities["adsets"] = await client.list_adsets()
    except MetaAPIError as e:
        errors.append({"level": "entities", "error": str(e.detail)[:300]})
        entities = {}
    if entities:
        await db.entity_snapshots.insert_one({
            "user_id": user_id,
            "campaigns": entities.get("campaigns", []),
            "adsets": entities.get("adsets", []),
            "fetched_at": datetime.now(timezone.utc).isoformat(),
        })

    now_iso = datetime.now(timezone.utc).isoformat()
    await db.datahub_state.update_one(
        {"user_id": user_id},
        {"$set": {
            "user_id": user_id,
            "last_synced_date": until,
            "last_sync_at": now_iso,
            "last_window": {"since": since, "until": until},
            "last_upserted": upserted,
            "last_errors": errors,
        }},
        upsert=True,
    )
    return {"since": since, "until": until, "upserted": upserted, "errors": errors, "at": now_iso}


# ------------------------------------------------------------- consultas ---

async def get_series(
    db: AsyncIOMotorDatabase,
    user_id: str,
    object_id: str,
    metric: str = "spend",
    days: int = 30,
    level: str = "campaign",
) -> list[dict]:
    """Série diária de uma métrica para um objeto: [{date, value}]."""
    since = (datetime.now(timezone.utc).date() - timedelta(days=days)).isoformat()
    cur = db.metrics_daily.find(
        {"user_id": user_id, "level": level, "object_id": object_id, "date": {"$gte": since}},
        {"_id": 0, "date": 1, metric: 1},
    ).sort("date", 1)
    return [{"date": d["date"], "value": _f(d.get(metric))} async for d in cur]


async def get_baseline(
    db: AsyncIOMotorDatabase,
    user_id: str,
    object_id: str,
    metric: str = "cpa",
    days: int = 28,
    exclude_recent_days: int = 3,
    level: str = "campaign",
) -> float:
    """Média histórica da métrica excluindo dias recentes (atribuição atrasada)."""
    today = datetime.now(timezone.utc).date()
    since = (today - timedelta(days=days + exclude_recent_days)).isoformat()
    until = (today - timedelta(days=exclude_recent_days)).isoformat()
    cur = db.metrics_daily.find(
        {"user_id": user_id, "level": level, "object_id": object_id,
         "date": {"$gte": since, "$lte": until}},
        {"_id": 0, metric: 1, "spend": 1},
    )
    values = []
    async for d in cur:
        v = _f(d.get(metric))
        # ignora dias sem entrega para não puxar a média pra zero
        if v or _f(d.get("spend")):
            values.append(v)
    return round(sum(values) / len(values), 4) if values else 0.0


async def aggregate_period(
    db: AsyncIOMotorDatabase,
    user_id: str,
    object_id: str,
    days: int,
    offset_days: int = 0,
    level: str = "campaign",
) -> dict:
    """Agrega métricas de um período (para comparação atual vs anterior)."""
    today = datetime.now(timezone.utc).date()
    until = today - timedelta(days=offset_days)
    since = until - timedelta(days=days)
    pipeline = [
        {"$match": {"user_id": user_id, "level": level, "object_id": object_id,
                    "date": {"$gte": since.isoformat(), "$lt": until.isoformat()}}},
        {"$group": {
            "_id": None,
            "spend": {"$sum": "$spend"},
            "impressions": {"$sum": "$impressions"},
            "clicks": {"$sum": "$clicks"},
            "purchases": {"$sum": "$purchases"},
            "leads": {"$sum": "$leads"},
            "purchase_value": {"$sum": "$purchase_value"},
            "days": {"$sum": 1},
        }},
    ]
    agg = None
    async for d in db.metrics_daily.aggregate(pipeline):
        agg = d
    if not agg:
        return {"spend": 0, "impressions": 0, "clicks": 0, "purchases": 0, "leads": 0,
                "purchase_value": 0, "days": 0, "cpa": 0, "roas": 0, "ctr": 0, "cpl": 0}
    spend = _f(agg.get("spend"))
    purchases = _f(agg.get("purchases"))
    leads = _f(agg.get("leads"))
    clicks = _f(agg.get("clicks"))
    impressions = _f(agg.get("impressions"))
    value = _f(agg.get("purchase_value"))
    return {
        "spend": round(spend, 2),
        "impressions": int(impressions),
        "clicks": int(clicks),
        "purchases": int(purchases),
        "leads": int(leads),
        "purchase_value": round(value, 2),
        "days": agg.get("days", 0),
        "cpa": round(spend / purchases, 2) if purchases else 0.0,
        "cpl": round(spend / leads, 2) if leads else 0.0,
        "roas": round(value / spend, 3) if spend else 0.0,
        "ctr": round(clicks / impressions * 100, 3) if impressions else 0.0,
    }


async def window_rows(
    db: AsyncIOMotorDatabase,
    user_id: str,
    level: str = "campaign",
    days: int = 7,
    offset_days: int = 0,
) -> list[dict]:
    """
    Linhas agregadas por objeto numa janela — substitui chamadas live à Meta
    na avaliação de regras. Formato plano compatível com o motor de regras.
    """
    today = datetime.now(timezone.utc).date()
    until = today - timedelta(days=offset_days)
    since = until - timedelta(days=days)
    id_field = {"campaign": "campaign_id", "adset": "adset_id", "ad": "ad_id"}[level]
    pipeline = [
        {"$match": {"user_id": user_id, "level": level,
                    "date": {"$gte": since.isoformat(), "$lte": until.isoformat()}}},
        {"$sort": {"date": 1}},
        {"$group": {
            "_id": "$object_id",
            "object_name": {"$last": "$object_name"},
            "campaign_id": {"$last": "$campaign_id"},
            "adset_id": {"$last": "$adset_id"},
            "spend": {"$sum": "$spend"},
            "impressions": {"$sum": "$impressions"},
            "clicks": {"$sum": "$clicks"},
            "purchases": {"$sum": "$purchases"},
            "leads": {"$sum": "$leads"},
            "purchase_value": {"$sum": "$purchase_value"},
            "frequency": {"$avg": "$frequency"},
            "days": {"$sum": 1},
        }},
    ]
    rows = []
    name_key = {"campaign": "campaign_name", "adset": "adset_name", "ad": "ad_name"}[level]
    async for d in db.metrics_daily.aggregate(pipeline):
        spend = _f(d.get("spend"))
        clicks = _f(d.get("clicks"))
        impressions = _f(d.get("impressions"))
        purchases = _f(d.get("purchases"))
        leads = _f(d.get("leads"))
        value = _f(d.get("purchase_value"))
        rows.append({
            id_field: d["_id"],
            "object_id": d["_id"],
            name_key: d.get("object_name"),
            "object_name": d.get("object_name"),
            "campaign_id": d.get("campaign_id"),
            "adset_id": d.get("adset_id"),
            "spend": round(spend, 2),
            "impressions": impressions,
            "clicks": clicks,
            "purchases": purchases,
            "leads": leads,
            "purchase_value": round(value, 2),
            "ctr": round(clicks / impressions * 100, 3) if impressions else 0.0,
            "cpc": round(spend / clicks, 3) if clicks else 0.0,
            "cpm": round(spend / impressions * 1000, 2) if impressions else 0.0,
            "frequency": round(_f(d.get("frequency")), 2),
            "cpa": round(spend / purchases, 2) if purchases else 0.0,
            "cpl": round(spend / leads, 2) if leads else 0.0,
            "roas": round(value / spend, 3) if spend else 0.0,
            "days": d.get("days", 0),
        })
    return rows


async def data_freshness(db: AsyncIOMotorDatabase, user_id: str) -> dict:
    """Estado de frescor do hub — usado pelo Growth Loop e dashboards."""
    state = await db.datahub_state.find_one({"user_id": user_id}, {"_id": 0, "user_id": 0})
    total = await db.metrics_daily.count_documents({"user_id": user_id})
    oldest = await db.metrics_daily.find_one(
        {"user_id": user_id}, {"_id": 0, "date": 1}, sort=[("date", 1)]
    )
    stale_hours = None
    if state and state.get("last_sync_at"):
        try:
            last = datetime.fromisoformat(state["last_sync_at"].replace("Z", "+00:00"))
            stale_hours = round((datetime.now(timezone.utc) - last).total_seconds() / 3600, 1)
        except Exception:
            pass
    return {
        "state": state,
        "total_daily_rows": total,
        "history_since": (oldest or {}).get("date"),
        "hours_since_sync": stale_hours,
        "synced": state is not None,
    }
