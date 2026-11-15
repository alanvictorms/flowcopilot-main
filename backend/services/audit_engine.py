"""
Weighted audit engine for Meta Ads accounts.
Inspired by claude-ads (AgriciDaniel/claude-ads) methodology:
- Category-based checks (targeting, budget, creative, structure, tracking, delivery, bidding, policy)
- Each check has a weight and produces a status: pass | fail | warning | unknown | not_applicable
- Overall score = weighted average of applicable checks; coverage tracks unknowns.
"""
from datetime import datetime, timezone
from typing import Any


SEVERITY_WEIGHTS = {"critical": 5, "high": 4, "medium": 3, "low": 2, "info": 1}

CATEGORIES = [
    "structure",
    "budget",
    "targeting",
    "creative",
    "delivery",
    "bidding",
    "tracking",
    "policy",
]


def _pct(numer: float, denom: float) -> float:
    return (numer / denom * 100.0) if denom else 0.0


def _finding(check_id: str, category: str, title: str, severity: str, status: str,
             message: str, evidence: dict | None = None,
             recommendation: str = "") -> dict:
    return {
        "id": check_id,
        "category": category,
        "title": title,
        "severity": severity,
        "status": status,  # pass | fail | warning | unknown | not_applicable
        "message": message,
        "evidence": evidence or {},
        "recommendation": recommendation,
        "weight": SEVERITY_WEIGHTS.get(severity, 1),
    }


def _sum_metric(insights: list[dict], key: str) -> float:
    return sum(float(row.get(key, 0) or 0) for row in insights)


def _extract_purchases(insights_row: dict) -> float:
    actions = insights_row.get("actions") or []
    for a in actions:
        if a.get("action_type") in ("purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"):
            try:
                return float(a.get("value") or 0)
            except Exception:
                return 0.0
    return 0.0


def _extract_roas(insights_row: dict) -> float:
    roas_list = insights_row.get("purchase_roas") or []
    for r in roas_list:
        try:
            return float(r.get("value") or 0)
        except Exception:
            return 0.0
    return 0.0


def run_audit(
    account: dict,
    campaigns: list,
    adsets: list,
    ads: list,
    insights_campaign: list,
    insights_ad: list,
) -> dict:
    """Return {overall_score, coverage, categories, findings, summary_kpis}"""
    findings: list[dict] = []

    # ---- Structure ----------------------------------------------------
    findings.append(_finding(
        "STR-001", "structure", "Active campaign count is reasonable",
        "medium", "pass" if 1 <= len(campaigns) <= 25 else ("warning" if len(campaigns) == 0 else "fail"),
        f"Account has {len(campaigns)} campaigns.",
        {"count": len(campaigns)},
        "Meta recommends fewer, better-fed campaigns; consolidate similar objectives to help the algorithm."
    ))

    active_campaigns = [c for c in campaigns if c.get("effective_status") == "ACTIVE"]
    findings.append(_finding(
        "STR-002", "structure", "At least one active campaign",
        "high", "pass" if active_campaigns else "fail",
        f"{len(active_campaigns)} active campaigns.",
        recommendation="Activate at least one campaign to start delivering ads."
    ))

    campaigns_by_id = {c["id"]: c for c in campaigns}
    adsets_per_campaign = {}
    for a in adsets:
        adsets_per_campaign.setdefault(a.get("campaign_id"), []).append(a)

    lonely_adsets = [c for c in campaigns if len(adsets_per_campaign.get(c["id"], [])) == 0]
    findings.append(_finding(
        "STR-003", "structure", "Every campaign has at least one ad set",
        "high", "pass" if not lonely_adsets else "warning",
        f"{len(lonely_adsets)} campaign(s) without ad sets.",
        {"campaign_ids": [c["id"] for c in lonely_adsets[:10]]},
        "Add ad sets to empty campaigns or archive them."
    ))

    ads_per_adset = {}
    for ad in ads:
        ads_per_adset.setdefault(ad.get("adset_id"), []).append(ad)

    empty_adsets = [a for a in adsets if len(ads_per_adset.get(a["id"], [])) == 0]
    findings.append(_finding(
        "STR-004", "structure", "Every ad set has at least one ad",
        "high", "pass" if not empty_adsets else "warning",
        f"{len(empty_adsets)} ad set(s) without ads.",
        {"adset_ids": [a["id"] for a in empty_adsets[:10]]},
        "Create ads or archive empty ad sets to avoid wasted budget."
    ))

    # Recommended 3-6 ads per adset for testing
    over_saturated = [a for a in adsets if len(ads_per_adset.get(a["id"], [])) > 8]
    findings.append(_finding(
        "STR-005", "structure", "Ad sets have a testable number of ads (≤ 8)",
        "medium", "pass" if not over_saturated else "warning",
        f"{len(over_saturated)} ad set(s) have more than 8 ads.",
        recommendation="Meta suggests keeping 3–6 ads per ad set; too many prevents learning."
    ))

    # ---- Budget ---------------------------------------------------------
    total_budget_cents = 0
    zero_budget_adsets = []
    for a in adsets:
        db = int(a.get("daily_budget") or 0)
        lb = int(a.get("lifetime_budget") or 0)
        total_budget_cents += db
        if db == 0 and lb == 0 and a.get("effective_status") == "ACTIVE":
            zero_budget_adsets.append(a)

    findings.append(_finding(
        "BUD-001", "budget", "Active ad sets have a defined budget",
        "critical", "pass" if not zero_budget_adsets else "fail",
        f"{len(zero_budget_adsets)} active ad set(s) with no daily/lifetime budget.",
        {"adset_ids": [a["id"] for a in zero_budget_adsets[:10]]},
        "Set a daily or lifetime budget on every active ad set to control spend."
    ))

    # Compute spend vs budget from insights
    total_spend = _sum_metric(insights_campaign, "spend")
    findings.append(_finding(
        "BUD-002", "budget", "Account is spending in the analysis window",
        "medium", "pass" if total_spend > 0 else "warning",
        f"Total spend: {total_spend:.2f} {account.get('currency', 'USD')}.",
        {"total_spend": total_spend},
        "If spend is zero, verify billing, budgets, and ad delivery state."
    ))

    # ---- Targeting ------------------------------------------------------
    broad_targeting = 0
    narrow_targeting = 0
    missing_geo = 0
    for a in adsets:
        t = a.get("targeting") or {}
        if not t.get("geo_locations"):
            missing_geo += 1
        age_span = (t.get("age_max", 65) - t.get("age_min", 18))
        interests = (t.get("interests") or []) + (t.get("flexible_spec") or [])
        if age_span >= 40 and not interests:
            broad_targeting += 1
        if age_span <= 5 and len(interests) > 5:
            narrow_targeting += 1

    findings.append(_finding(
        "TAR-001", "targeting", "Every ad set specifies geographic targeting",
        "high", "pass" if missing_geo == 0 else "warning",
        f"{missing_geo} ad set(s) without geo_locations set.",
        recommendation="Explicitly define geo targeting to avoid untargeted delivery."
    ))
    findings.append(_finding(
        "TAR-002", "targeting", "Not overly narrow targeting",
        "medium", "pass" if narrow_targeting == 0 else "warning",
        f"{narrow_targeting} ad set(s) with tight age + many interests (learning limitation risk).",
        recommendation="Widen age range and reduce interest stacking to unlock learning."
    ))
    findings.append(_finding(
        "TAR-003", "targeting", "Broad targeting is intentional",
        "low", "pass" if broad_targeting == 0 else "info",
        f"{broad_targeting} ad set(s) look very broad. Ensure this is by design.",
        recommendation="Broad targeting works with strong creative + pixel; verify signals are firing."
    ))

    # ---- Creative -------------------------------------------------------
    ads_without_creative = [ad for ad in ads if not ad.get("creative")]
    findings.append(_finding(
        "CRE-001", "creative", "All ads have creative assets attached",
        "critical", "pass" if not ads_without_creative else "fail",
        f"{len(ads_without_creative)} ad(s) missing creative.",
        recommendation="Rebuild ad creatives; ads without creative will not deliver."
    ))

    ads_missing_copy = 0
    for ad in ads:
        c = ad.get("creative") or {}
        body = c.get("body") or (c.get("object_story_spec", {}).get("link_data") or {}).get("message")
        if not body:
            ads_missing_copy += 1
    findings.append(_finding(
        "CRE-002", "creative", "Ads include primary text / body copy",
        "high", "pass" if ads_missing_copy == 0 else "warning",
        f"{ads_missing_copy} ad(s) without body copy.",
        recommendation="Add descriptive primary text to boost relevance and CTR."
    ))

    # ---- Delivery (from insights) --------------------------------------
    total_impr = _sum_metric(insights_campaign, "impressions")
    total_clicks = _sum_metric(insights_campaign, "clicks")
    ctr = _pct(total_clicks, total_impr)
    findings.append(_finding(
        "DEL-001", "delivery", "Account CTR is above 0.8% benchmark",
        "medium", "pass" if ctr >= 0.8 else ("warning" if ctr > 0 else "unknown"),
        f"CTR = {ctr:.2f}% over analysis window.",
        {"impressions": total_impr, "clicks": total_clicks},
        "Refresh creative or targeting if CTR is below benchmark."
    ))

    freq_rows = [float(r.get("frequency") or 0) for r in insights_campaign if r.get("frequency")]
    avg_freq = sum(freq_rows) / len(freq_rows) if freq_rows else 0
    findings.append(_finding(
        "DEL-002", "delivery", "Frequency is under 3.5 (creative fatigue guard)",
        "medium", "pass" if avg_freq < 3.5 else "warning",
        f"Average frequency = {avg_freq:.2f}.",
        recommendation="Rotate creatives or widen audience when frequency exceeds 3.5."
    ))

    learning_limited = [a for a in adsets if str(a.get("effective_status", "")).startswith("LEARNING_LIMITED")]
    findings.append(_finding(
        "DEL-003", "delivery", "No ad sets stuck in LEARNING_LIMITED",
        "high", "pass" if not learning_limited else "warning",
        f"{len(learning_limited)} ad set(s) in learning-limited state.",
        recommendation="Increase budget, broaden audience, or consolidate ad sets to exit learning."
    ))

    # ---- Bidding --------------------------------------------------------
    invalid_bid = [a for a in adsets if not a.get("bid_strategy") and not a.get("bid_amount")]
    findings.append(_finding(
        "BID-001", "bidding", "Every ad set has a bid strategy configured",
        "high", "pass" if not invalid_bid else "warning",
        f"{len(invalid_bid)} ad set(s) without explicit bid strategy.",
        recommendation="Confirm a bid strategy (LOWEST_COST_WITHOUT_CAP is the default) is intentional."
    ))

    # ---- Tracking / Conversions ----------------------------------------
    purchases = sum(_extract_purchases(r) for r in insights_campaign)
    roas_values = [_extract_roas(r) for r in insights_campaign]
    roas_values = [r for r in roas_values if r > 0]
    avg_roas = sum(roas_values) / len(roas_values) if roas_values else 0

    findings.append(_finding(
        "TRK-001", "tracking", "Purchase events are being recorded",
        "critical", "pass" if purchases > 0 else "warning",
        f"{int(purchases)} purchase events tracked in analysis window.",
        recommendation="If zero purchases, verify Pixel/CAPI setup and event mapping."
    ))
    findings.append(_finding(
        "TRK-002", "tracking", "Purchase ROAS is available",
        "high", "pass" if avg_roas > 0 else "warning",
        f"Avg purchase ROAS = {avg_roas:.2f}.",
        recommendation="Configure value optimization + CAPI to see ROAS."
    ))

    # ---- Policy / Account -----------------------------------------------
    disable_reason = account.get("disable_reason")
    account_status = account.get("account_status")
    findings.append(_finding(
        "POL-001", "policy", "Ad account is in good standing (status=1)",
        "critical", "pass" if account_status in (1, "1") else "fail",
        f"Account status = {account_status}, disable_reason = {disable_reason}.",
        recommendation="Contact Meta Business Support if the account is disabled or restricted."
    ))

    # ---- Aggregate scoring ---------------------------------------------
    categories_out: dict[str, dict] = {c: {"pass": 0, "fail": 0, "warning": 0, "unknown": 0, "total": 0, "score": 0.0} for c in CATEGORIES}
    total_weight_all = 0
    total_weight_passed = 0
    total_weight_applicable = 0
    unknown_weight = 0

    for f in findings:
        c = f["category"]
        s = f["status"]
        w = f["weight"]
        categories_out.setdefault(c, {"pass": 0, "fail": 0, "warning": 0, "unknown": 0, "total": 0, "score": 0.0})
        categories_out[c][s] = categories_out[c].get(s, 0) + 1
        categories_out[c]["total"] += 1
        total_weight_all += w
        if s == "unknown":
            unknown_weight += w
            continue
        if s == "not_applicable":
            continue
        total_weight_applicable += w
        if s == "pass":
            total_weight_passed += w
        elif s == "warning":
            total_weight_passed += w * 0.5

    # per-category score
    for c, agg in categories_out.items():
        cat_findings = [f for f in findings if f["category"] == c and f["status"] not in ("unknown", "not_applicable")]
        cat_w_total = sum(f["weight"] for f in cat_findings)
        cat_w_passed = sum(
            f["weight"] if f["status"] == "pass" else (f["weight"] * 0.5 if f["status"] == "warning" else 0)
            for f in cat_findings
        )
        agg["score"] = round((cat_w_passed / cat_w_total * 100.0), 1) if cat_w_total else 0.0

    overall_score = round((total_weight_passed / total_weight_applicable * 100.0), 1) if total_weight_applicable else 0.0
    coverage = round(((total_weight_all - unknown_weight) / total_weight_all * 100.0), 1) if total_weight_all else 0.0

    if coverage >= 80:
        grade = "graded"
    elif coverage >= 60:
        grade = "provisional"
    else:
        grade = "insufficient"

    summary_kpis = {
        "campaigns_total": len(campaigns),
        "campaigns_active": len(active_campaigns),
        "adsets_total": len(adsets),
        "ads_total": len(ads),
        "spend": round(total_spend, 2),
        "purchases": int(purchases),
        "avg_roas": round(avg_roas, 2),
        "ctr_pct": round(ctr, 2),
        "avg_frequency": round(avg_freq, 2),
        "currency": account.get("currency", "USD"),
    }

    return {
        "overall_score": overall_score,
        "coverage_pct": coverage,
        "grade": grade,
        "categories": categories_out,
        "findings": findings,
        "summary_kpis": summary_kpis,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
