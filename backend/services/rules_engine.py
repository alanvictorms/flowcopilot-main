"""
Motor Avançado de Regras (Camada 2 · item 14 do roadmap).

Avalia regras if/then contra métricas agregadas. Evolução v2:
  - condições absolutas (como antes) E condições comparativas
    (`compare_to: previous_period`) por variação percentual;
  - métricas novas: leads, cpa, cpl, purchase_value;
  - cooldown por regra (aplicado pelo orquestrador via `last_fired_at`);
  - snapshot de evidência completo por match (para o Control Plane).

Schema da regra (retrocompatível):
{
  id, name, enabled, scope (campaign|adset|ad),
  conditions: [ { metric, operator, value, compare_to? ("previous_period") } ],
  logic: "all" | "any",
  action: { type: pause|activate|change_budget|notify, params: { change_pct? } },
  window: "today" | "last_3d" | "last_7d" | "last_14d" | "last_30d",
  cooldown_minutes?: int
}
"""
import operator
from datetime import datetime, timezone

OPS = {
    ">": operator.gt,
    ">=": operator.ge,
    "<": operator.lt,
    "<=": operator.le,
    "==": operator.eq,
    "!=": operator.ne,
}

WINDOW_DAYS = {
    "today": 1,
    "yesterday": 1,
    "last_3d": 3,
    "last_7d": 7,
    "last_14d": 14,
    "last_30d": 30,
}

EVIDENCE_KEYS = ("spend", "impressions", "clicks", "purchases", "leads",
                 "ctr", "cpc", "cpm", "cpa", "cpl", "roas", "frequency")


def window_to_days(window: str) -> int:
    return WINDOW_DAYS.get(window or "last_7d", 7)


def _get_metric(row: dict, metric: str) -> float:
    if metric in row:
        try:
            return float(row.get(metric) or 0)
        except Exception:
            return 0.0
    # Compatibilidade com linhas cruas da API da Meta
    if metric == "purchases":
        for a in row.get("actions", []) or []:
            if a.get("action_type") == "purchase":
                try:
                    return float(a.get("value") or 0)
                except Exception:
                    return 0.0
    if metric == "leads":
        for a in row.get("actions", []) or []:
            if a.get("action_type") == "lead":
                try:
                    return float(a.get("value") or 0)
                except Exception:
                    return 0.0
    if metric == "roas":
        for r in row.get("purchase_roas", []) or []:
            try:
                return float(r.get("value") or 0)
            except Exception:
                return 0.0
    return 0.0


def _pct_change(current: float, previous: float) -> float:
    if previous == 0:
        return 100.0 if current > 0 else 0.0
    return (current - previous) / abs(previous) * 100.0


def evaluate_rule(
    rule: dict,
    insights_rows: list[dict],
    previous_rows: list[dict] | None = None,
) -> list[dict]:
    """
    Retorna lista de objetos que casaram com as condições.
    `previous_rows` habilita condições `compare_to: previous_period`
    (o operador é aplicado à variação percentual da métrica).
    """
    matches = []
    scope = rule.get("scope", "campaign")
    id_key = {"campaign": "campaign_id", "adset": "adset_id", "ad": "ad_id"}.get(scope, "campaign_id")
    name_key = {"campaign": "campaign_name", "adset": "adset_name", "ad": "ad_name"}.get(scope, "campaign_name")
    conds = rule.get("conditions", [])
    logic = rule.get("logic", "all")
    prev_by_id = {}
    for r in previous_rows or []:
        rid = r.get(id_key) or r.get("object_id")
        if rid:
            prev_by_id[rid] = r

    for row in insights_rows:
        target_id = row.get(id_key) or row.get("object_id")
        if not target_id:
            continue
        results = []
        detail = {}
        for c in conds:
            op_fn = OPS.get(c.get("operator", ">"))
            metric = c.get("metric", "")
            metric_val = _get_metric(row, metric)
            try:
                threshold = float(c.get("value", 0))
            except Exception:
                threshold = 0.0

            if c.get("compare_to") == "previous_period":
                prev = prev_by_id.get(target_id)
                prev_val = _get_metric(prev, metric) if prev else 0.0
                change = _pct_change(metric_val, prev_val)
                ok = op_fn(change, threshold) if op_fn else False
                detail[f"{metric}_change_pct"] = round(change, 2)
                detail[f"{metric}_previous"] = round(prev_val, 4)
            else:
                ok = op_fn(metric_val, threshold) if op_fn else False
            detail[metric] = round(metric_val, 4)
            results.append(ok)

        matched = all(results) if logic == "all" else any(results)
        if matched:
            evidence = {k: _get_metric(row, k) for k in EVIDENCE_KEYS}
            matches.append({
                "target_id": target_id,
                "target_name": row.get(name_key) or row.get("object_name"),
                "metrics_snapshot": detail,
                "evidence_metrics": evidence,
                "evaluated_at": datetime.now(timezone.utc).isoformat(),
            })
    return matches


def rule_in_cooldown(rule: dict, cooldown_default_minutes: int = 0) -> bool:
    """True se a regra disparou há menos tempo que seu cooldown."""
    cooldown = int(rule.get("cooldown_minutes") or cooldown_default_minutes or 0)
    if not cooldown:
        return False
    last = rule.get("last_fired_at")
    if not last:
        return False
    try:
        last_dt = datetime.fromisoformat(str(last).replace("Z", "+00:00"))
    except Exception:
        return False
    elapsed_min = (datetime.now(timezone.utc) - last_dt).total_seconds() / 60.0
    return elapsed_min < cooldown
