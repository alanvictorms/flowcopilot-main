"""
Motor Estatístico de Decisões (Camada 2 · item 15 do roadmap).

Impede decisões precipitadas: valida amostra mínima, calcula intervalos de
confiança, compara com baseline/período anterior, detecta tendência e produz
um "gate" de decisão com explicação em linguagem simples (pt-BR).

Funções puras — sem I/O — para serem testáveis e reutilizáveis pelo
Control Plane, motor de regras, experimentos e orquestrador.
"""
import math
from typing import Optional

# Z para 95% de confiança
Z_95 = 1.959963985


def _f(x) -> float:
    try:
        return float(x or 0)
    except Exception:
        return 0.0


# ---------------------------------------------------------------- amostra ---

def sample_sufficiency(
    impressions: float = 0,
    clicks: float = 0,
    conversions: float = 0,
    min_impressions: int = 1000,
    min_clicks: int = 30,
    min_conversions: int = 5,
) -> dict:
    """Avalia se há dados suficientes para uma decisão confiável."""
    checks = {
        "impressions": {"value": int(impressions), "required": min_impressions, "ok": impressions >= min_impressions},
        "clicks": {"value": int(clicks), "required": min_clicks, "ok": clicks >= min_clicks},
        "conversions": {"value": int(conversions), "required": min_conversions, "ok": conversions >= min_conversions},
    }
    missing = [k for k, v in checks.items() if not v["ok"]]
    labels = {"impressions": "impressões", "clicks": "cliques", "conversions": "conversões"}
    return {
        "sufficient": len(missing) == 0,
        "checks": checks,
        "missing": missing,
        "explanation_pt": (
            "Amostra suficiente para decidir com confiança."
            if not missing else
            "Dados insuficientes: faltam " + ", ".join(
                f"{labels[m]} ({checks[m]['value']}/{checks[m]['required']})" for m in missing
            ) + ". Recomendado aguardar mais dados antes de agir."
        ),
    }


# ------------------------------------------------------- intervalo Wilson ---

def wilson_interval(successes: float, trials: float, z: float = Z_95) -> dict:
    """Intervalo de confiança de Wilson para uma proporção (CTR, CVR...)."""
    if trials <= 0:
        return {"rate": 0.0, "low": 0.0, "high": 0.0}
    p = min(max(successes / trials, 0.0), 1.0)
    denom = 1 + z * z / trials
    center = (p + z * z / (2 * trials)) / denom
    margin = (z / denom) * math.sqrt(p * (1 - p) / trials + z * z / (4 * trials * trials))
    return {
        "rate": round(p, 6),
        "low": round(max(center - margin, 0.0), 6),
        "high": round(min(center + margin, 1.0), 6),
    }


def proportions_z_test(s1: float, n1: float, s2: float, n2: float) -> dict:
    """Teste z de duas proporções (variante A x B). Retorna p-valor aproximado."""
    if n1 <= 0 or n2 <= 0:
        return {"z": 0.0, "p_value": 1.0, "significant": False}
    p1, p2 = s1 / n1, s2 / n2
    p_pool = (s1 + s2) / (n1 + n2)
    se = math.sqrt(max(p_pool * (1 - p_pool) * (1 / n1 + 1 / n2), 1e-12))
    z = (p1 - p2) / se
    # p-valor bicaudal via aproximação da função erro
    p_value = math.erfc(abs(z) / math.sqrt(2))
    return {
        "z": round(z, 4),
        "p_value": round(p_value, 5),
        "significant": p_value < 0.05,
    }


# ------------------------------------------------------------- comparação ---

def compare_to_baseline(current: float, baseline: float, tolerance_pct: float = 15.0) -> dict:
    """Compara valor atual com baseline; distingue oscilação normal de mudança real."""
    if baseline == 0:
        pct = 100.0 if current > 0 else 0.0
    else:
        pct = (current - baseline) / abs(baseline) * 100.0
    direction = "up" if pct > tolerance_pct else ("down" if pct < -tolerance_pct else "stable")
    return {
        "current": round(current, 4),
        "baseline": round(baseline, 4),
        "change_pct": round(pct, 2),
        "direction": direction,
        "beyond_normal_variation": abs(pct) > tolerance_pct,
        "explanation_pt": (
            f"Variação de {pct:+.1f}% em relação ao baseline — "
            + ("acima da oscilação normal, mudança relevante." if abs(pct) > tolerance_pct
               else "dentro da oscilação normal, sem mudança relevante.")
        ),
    }


def trend(series: list[float]) -> dict:
    """Tendência via regressão linear simples sobre a série diária."""
    n = len(series)
    if n < 3:
        return {"slope": 0.0, "direction": "flat", "r2": 0.0, "points": n}
    xs = list(range(n))
    mean_x = sum(xs) / n
    mean_y = sum(series) / n
    ss_xy = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, series))
    ss_xx = sum((x - mean_x) ** 2 for x in xs)
    ss_yy = sum((y - mean_y) ** 2 for y in series)
    slope = ss_xy / ss_xx if ss_xx else 0.0
    r2 = (ss_xy ** 2) / (ss_xx * ss_yy) if ss_xx and ss_yy else 0.0
    # Normaliza a inclinação pela média para dar noção percentual/dia
    slope_pct_day = (slope / abs(mean_y) * 100.0) if mean_y else 0.0
    direction = "up" if slope_pct_day > 2 else ("down" if slope_pct_day < -2 else "flat")
    return {
        "slope": round(slope, 6),
        "slope_pct_per_day": round(slope_pct_day, 2),
        "direction": direction,
        "r2": round(r2, 3),
        "points": n,
    }


# ------------------------------------------------------- gate de decisão ---

def decision_gate(
    impressions: float = 0,
    clicks: float = 0,
    conversions: float = 0,
    min_impressions: int = 1000,
    min_clicks: int = 30,
    min_conversions: int = 5,
    metric_current: Optional[float] = None,
    metric_baseline: Optional[float] = None,
    tolerance_pct: float = 15.0,
    daily_series: Optional[list[float]] = None,
    action_risk: str = "medium",  # low | medium | high
) -> dict:
    """
    Decide se uma ação pode prosseguir com base em evidência estatística.
    Retorna allowed + confidence (0-1) + explicação em pt-BR.
    """
    sample = sample_sufficiency(impressions, clicks, conversions,
                                min_impressions, min_clicks, min_conversions)
    comparison = None
    if metric_current is not None and metric_baseline is not None:
        comparison = compare_to_baseline(metric_current, metric_baseline, tolerance_pct)
    series_trend = trend(daily_series or [])

    # Confiança composta: amostra pesa 50%, sinal (comparação) 30%, tendência 20%
    conf = 0.0
    checks = sample["checks"]
    sample_score = sum(1 for v in checks.values() if v["ok"]) / len(checks)
    conf += 0.5 * sample_score
    if comparison:
        conf += 0.3 * (1.0 if comparison["beyond_normal_variation"] else 0.3)
    else:
        conf += 0.15  # sem comparação, confiança parcial
    if series_trend["points"] >= 3:
        conf += 0.2 * min(series_trend["r2"] + 0.4, 1.0)
    conf = round(min(conf, 1.0), 3)

    # Risco alto exige amostra completa; risco baixo tolera amostra parcial
    thresholds = {"low": 0.35, "medium": 0.55, "high": 0.75}
    required = thresholds.get(action_risk, 0.55)
    allowed = conf >= required and (sample["sufficient"] or action_risk == "low")

    reasons = [sample["explanation_pt"]]
    if comparison:
        reasons.append(comparison["explanation_pt"])
    if series_trend["points"] >= 3:
        dir_pt = {"up": "alta", "down": "queda", "flat": "estável"}[series_trend["direction"]]
        reasons.append(f"Tendência da série: {dir_pt} ({series_trend['slope_pct_per_day']:+.1f}%/dia, R²={series_trend['r2']}).")
    reasons.append(
        f"Confiança {conf:.0%} vs mínimo {required:.0%} para risco {action_risk}: "
        + ("liberado." if allowed else "bloqueado — aguarde mais dados ou reduza o risco da ação.")
    )

    return {
        "allowed": allowed,
        "confidence": conf,
        "required_confidence": required,
        "sample": sample,
        "comparison": comparison,
        "trend": series_trend,
        "explanation_pt": " ".join(reasons),
    }


# ---------------------------------------------------- vencedor experimento ---

def pick_winner(variants: list[dict], metric: str = "roas", min_conversions: int = 5) -> dict:
    """
    Decide vencedor entre variantes com base estatística.
    variants: [{name, target_id, impressions, clicks, conversions, spend, metric_value}]
    Para métricas de taxa (ctr/cvr) usa z-test; para roas/cpa compara com exigência
    de conversões mínimas em ambas.
    """
    eligible = [v for v in variants if _f(v.get("conversions")) >= min_conversions or metric == "ctr"]
    verdict = {"winner": None, "significant": False, "p_value": None,
               "status": "insufficient_data",
               "explanation_pt": "Nenhuma variante atingiu o mínimo de conversões — aguardando mais dados."}
    if len(eligible) < 2:
        if len(eligible) == 1 and len(variants) >= 2:
            verdict["explanation_pt"] = (
                f"Apenas '{eligible[0].get('name')}' tem dados suficientes. "
                "Aguarde as demais variantes acumularem conversões."
            )
        return verdict

    reverse = metric != "cpa"
    ranked = sorted(eligible, key=lambda v: _f(v.get("metric_value")), reverse=reverse)
    best, second = ranked[0], ranked[1]

    if metric == "ctr":
        test = proportions_z_test(
            _f(best.get("clicks")), max(_f(best.get("impressions")), 1),
            _f(second.get("clicks")), max(_f(second.get("impressions")), 1),
        )
    else:
        # Aproxima significância pela taxa de conversão por clique
        test = proportions_z_test(
            _f(best.get("conversions")), max(_f(best.get("clicks")), 1),
            _f(second.get("conversions")), max(_f(second.get("clicks")), 1),
        )

    if test["significant"]:
        return {
            "winner": best,
            "significant": True,
            "p_value": test["p_value"],
            "status": "winner_found",
            "explanation_pt": (
                f"'{best.get('name')}' vence com significância estatística "
                f"(p={test['p_value']:.3f} < 0.05) na métrica {metric}."
            ),
        }
    return {
        "winner": None,
        "leader": best,
        "significant": False,
        "p_value": test["p_value"],
        "status": "leader_not_significant",
        "explanation_pt": (
            f"'{best.get('name')}' lidera, mas a diferença ainda não é estatisticamente "
            f"significativa (p={test['p_value']:.3f}). Continue o teste."
        ),
    }
