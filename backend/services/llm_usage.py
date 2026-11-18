"""
Registro de consumo de tokens das execuções de IA.

O provedor de LLM nem sempre devolve a contagem exata de tokens.
Quando ela devolver, usamos o valor real; caso contrário estimamos por
comprimento de texto (~4 caracteres por token) — suficiente para o admin ter
uma MÉDIA de consumo por recurso, que é o objetivo do painel.

Cada execução grava um documento em `llm_usage`. O painel admin agrega isso em
uma tabela de médias por recurso (não lista log a log).
"""
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorDatabase


def estimate_tokens(text: str) -> int:
    if not text:
        return 0
    return max(1, round(len(text) / 4))


async def record_usage(
    db: AsyncIOMotorDatabase,
    resource_key: str,
    *,
    user_id: str = None,
    input_text: str = "",
    output_text: str = "",
    input_tokens: int = None,
    output_tokens: int = None,
    model: str = None,
) -> None:
    """Grava uma execução de IA. Tokens reais quando disponíveis, senão estimados."""
    it = input_tokens if input_tokens is not None else estimate_tokens(input_text)
    ot = output_tokens if output_tokens is not None else estimate_tokens(output_text)
    try:
        await db.llm_usage.insert_one({
            "resource_key": resource_key,
            "user_id": user_id,
            "input_tokens": int(it),
            "output_tokens": int(ot),
            "total_tokens": int(it) + int(ot),
            "estimated": input_tokens is None and output_tokens is None,
            "model": model,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception:
        # Telemetria nunca deve derrubar a execução principal.
        pass


async def usage_by_resource(db: AsyncIOMotorDatabase) -> list[dict]:
    """Agrega médias de consumo por recurso para o painel admin."""
    pipeline = [
        {"$group": {
            "_id": "$resource_key",
            "executions": {"$sum": 1},
            "avg_input": {"$avg": "$input_tokens"},
            "avg_output": {"$avg": "$output_tokens"},
            "avg_total": {"$avg": "$total_tokens"},
            "sum_total": {"$sum": "$total_tokens"},
            "last_at": {"$max": "$created_at"},
        }},
        {"$sort": {"sum_total": -1}},
    ]
    out = []
    async for r in db.llm_usage.aggregate(pipeline):
        out.append({
            "resource_key": r["_id"],
            "executions": r["executions"],
            "avg_input_tokens": round(r["avg_input"] or 0, 1),
            "avg_output_tokens": round(r["avg_output"] or 0, 1),
            "avg_total_tokens": round(r["avg_total"] or 0, 1),
            "total_tokens": r["sum_total"],
            "last_at": r["last_at"],
        })
    return out
