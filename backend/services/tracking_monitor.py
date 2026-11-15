"""
Monitor de Rastreamento e Integridade dos Dados (Camada 2 · item 19).

Compara o histórico próprio (Hub de Dados) com os eventos do CRM para
detectar quando Pixel/CAPI/CRM param de registrar corretamente:
  - conversões zeradas com gasto rodando (crítico → congela otimizações);
  - queda abrupta de eventos vs baseline;
  - divergência relevante entre vendas do CRM e purchases da Meta.

Incidente crítico grava um safety_scan com should_freeze_automation=True,
que o orquestrador já respeita (só permite pausar durante o congelamento).
"""
import uuid
from datetime import datetime, timezone, timedelta

from motor.motor_asyncio import AsyncIOMotorDatabase


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _f(x) -> float:
    try:
        return float(x or 0)
    except Exception:
        return 0.0


async def daily_account_series(db: AsyncIOMotorDatabase, user_id: str, days: int = 14) -> list[dict]:
    """Série diária agregada da conta (nível campanha somado) a partir do hub."""
    since = (datetime.now(timezone.utc).date() - timedelta(days=days)).isoformat()
    pipeline = [
        {"$match": {"user_id": user_id, "level": "campaign", "date": {"$gte": since}}},
        {"$group": {
            "_id": "$date",
            "spend": {"$sum": "$spend"},
            "purchases": {"$sum": "$purchases"},
            "leads": {"$sum": "$leads"},
            "impressions": {"$sum": "$impressions"},
        }},
        {"$sort": {"_id": 1}},
    ]
    out = []
    async for d in db.metrics_daily.aggregate(pipeline):
        out.append({"date": d["_id"], "spend": round(_f(d.get("spend")), 2),
                    "purchases": _f(d.get("purchases")), "leads": _f(d.get("leads")),
                    "impressions": _f(d.get("impressions"))})
    return out


async def crm_daily_series(db: AsyncIOMotorDatabase, user_id: str, days: int = 14) -> dict:
    """Contagem diária de eventos do CRM: {date: {leads, sales}}."""
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    out: dict = {}
    async for e in db.crm_events.find(
        {"user_id": user_id, "received_at": {"$gte": since}},
        {"_id": 0, "event": 1, "received_at": 1},
    ):
        date = (e.get("received_at") or "")[:10]
        g = out.setdefault(date, {"leads": 0, "sales": 0})
        if e.get("event") == "lead":
            g["leads"] += 1
        elif e.get("event") == "sale":
            g["sales"] += 1
    return out


async def _open_incident_exists(db, user_id: str, kind: str) -> bool:
    doc = await db.tracking_incidents.find_one({"user_id": user_id, "kind": kind, "status": "open"})
    return doc is not None


async def _create_incident(db, user_id: str, kind: str, severity: str, title: str, detail: str, data: dict) -> dict:
    incident = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "kind": kind,
        "severity": severity,
        "title": title,
        "detail": detail,
        "data": data,
        "status": "open",
        "created_at": _now(),
    }
    await db.tracking_incidents.insert_one({**incident})
    incident.pop("user_id", None)
    return incident


async def run_scan(db: AsyncIOMotorDatabase, user_id: str) -> dict:
    """Executa a varredura de integridade. Retorna incidentes novos + estado."""
    series = await daily_account_series(db, user_id, days=14)
    crm = await crm_daily_series(db, user_id, days=14)
    new_incidents = []

    if len(series) >= 5:
        recent = series[-2:]                    # 2 dias mais recentes fechando
        baseline_days = series[:-2][-10:]       # até 10 dias anteriores
        base_purch = sum(d["purchases"] for d in baseline_days) / max(len(baseline_days), 1)
        base_leads = sum(d["leads"] for d in baseline_days) / max(len(baseline_days), 1)
        rec_purch = sum(d["purchases"] for d in recent) / max(len(recent), 1)
        rec_leads = sum(d["leads"] for d in recent) / max(len(recent), 1)
        rec_spend = sum(d["spend"] for d in recent) / max(len(recent), 1)

        # 1) Conversões zeradas com gasto rodando — crítico
        if base_purch >= 1 and rec_purch == 0 and rec_spend > 10:
            if not await _open_incident_exists(db, user_id, "conversions_zeroed"):
                inc = await _create_incident(
                    db, user_id, "conversions_zeroed", "critical",
                    "Conversões zeradas com investimento ativo",
                    (f"Média histórica de {base_purch:.1f} compras/dia caiu para ZERO nos últimos 2 dias "
                     f"com gasto médio de R${rec_spend:.2f}/dia. Provável falha de Pixel/CAPI."),
                    {"baseline_daily_purchases": round(base_purch, 2), "recent_spend_daily": round(rec_spend, 2)},
                )
                new_incidents.append(inc)
                # Congela otimizações não essenciais via mecanismo já existente
                await db.safety_scans.insert_one({
                    "user_id": user_id,
                    "incidents": [{"severity": "critical", "category": "tracking",
                                   "title": inc["title"], "detail": inc["detail"]}],
                    "should_freeze_automation": True,
                    "source": "tracking_monitor",
                    "scanned_at": _now(),
                })

        # 2) Queda abrupta (>60%) de compras — alto
        elif base_purch >= 2 and rec_purch < base_purch * 0.4:
            if not await _open_incident_exists(db, user_id, "purchases_drop"):
                drop_pct = (1 - rec_purch / base_purch) * 100
                new_incidents.append(await _create_incident(
                    db, user_id, "purchases_drop", "high",
                    f"Queda de {drop_pct:.0f}% nas compras",
                    (f"Compras/dia caíram de {base_purch:.1f} para {rec_purch:.1f}. "
                     "Verifique tracking, entrega e concorrência antes de otimizar."),
                    {"baseline": round(base_purch, 2), "recent": round(rec_purch, 2)},
                ))

        # 3) Queda abrupta de leads — alto
        if base_leads >= 2 and rec_leads < base_leads * 0.4:
            if not await _open_incident_exists(db, user_id, "leads_drop"):
                drop_pct = (1 - rec_leads / base_leads) * 100
                new_incidents.append(await _create_incident(
                    db, user_id, "leads_drop", "high",
                    f"Queda de {drop_pct:.0f}% nos leads",
                    f"Leads/dia caíram de {base_leads:.1f} para {rec_leads:.1f}.",
                    {"baseline": round(base_leads, 2), "recent": round(rec_leads, 2)},
                ))

    # 4) Divergência CRM × Meta (últimos 7 dias fechados)
    last7 = [d for d in series[-8:-1]]
    meta_purchases_7d = sum(d["purchases"] for d in last7)
    crm_sales_7d = sum(v["sales"] for k, v in crm.items()
                       if any(d["date"] == k for d in last7))
    divergence_pct = None
    if crm_sales_7d >= 5 or meta_purchases_7d >= 5:
        bigger = max(crm_sales_7d, meta_purchases_7d)
        if bigger > 0:
            divergence_pct = abs(crm_sales_7d - meta_purchases_7d) / bigger * 100
            if divergence_pct > 40:
                if not await _open_incident_exists(db, user_id, "crm_meta_divergence"):
                    new_incidents.append(await _create_incident(
                        db, user_id, "crm_meta_divergence", "medium",
                        f"Divergência de {divergence_pct:.0f}% entre CRM e Meta",
                        (f"Últimos 7 dias: CRM registrou {crm_sales_7d} venda(s), Meta registrou "
                         f"{meta_purchases_7d:.0f} compra(s). Confira deduplicação e envio de eventos."),
                        {"crm_sales_7d": crm_sales_7d, "meta_purchases_7d": meta_purchases_7d},
                    ))

    open_count = await db.tracking_incidents.count_documents({"user_id": user_id, "status": "open"})
    return {
        "new_incidents": new_incidents,
        "open_incidents": open_count,
        "series": series,
        "crm_daily": crm,
        "divergence_pct": round(divergence_pct, 1) if divergence_pct is not None else None,
        "scanned_at": _now(),
    }
