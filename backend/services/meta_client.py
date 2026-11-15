"""
Meta / Facebook Marketing API client via REST (httpx).
Handles retries, rate limiting, and normalization of common calls.
"""
import asyncio
import json
import os
import random
from typing import Any, Optional

import httpx
from fastapi import HTTPException


META_GRAPH_VERSION = os.environ.get("META_GRAPH_VERSION", "v25.0")
BASE_URL = f"https://graph.facebook.com/{META_GRAPH_VERSION}"


class MetaAPIError(Exception):
    def __init__(self, status: int, detail: Any):
        self.status = status
        self.detail = detail
        super().__init__(f"Meta API error {status}: {detail}")


class MetaClient:
    def __init__(self, access_token: str, ad_account_id: str):
        self.access_token = access_token
        # Normalize ad account id to `act_<numeric>`
        self.ad_account_id = ad_account_id if ad_account_id.startswith("act_") else f"act_{ad_account_id}"

    async def _request(
        self,
        method: str,
        path: str,
        params: Optional[dict] = None,
        data: Optional[dict] = None,
    ) -> dict:
        params = dict(params or {})
        data = dict(data or {})
        params["access_token"] = self.access_token

        url = f"{BASE_URL}{path}"
        last_error = None
        for attempt in range(4):
            try:
                async with httpx.AsyncClient(timeout=45.0) as client:
                    resp = await client.request(method, url, params=params, data=data)
            except httpx.HTTPError as e:
                last_error = str(e)
                await asyncio.sleep((2 ** attempt) + random.random())
                continue

            if resp.status_code < 400:
                if resp.headers.get("content-type", "").startswith("application/json"):
                    return resp.json()
                return {"raw": resp.text}

            try:
                body = resp.json()
            except Exception:
                body = {"error": {"message": resp.text}}
            code = (body.get("error") or {}).get("code")
            # Retry on rate limit or transient errors
            if resp.status_code in (429, 500, 502, 503, 504) or code in {4, 17, 613, 80004}:
                await asyncio.sleep((2 ** attempt) + random.random())
                last_error = body
                continue

            raise MetaAPIError(resp.status_code, body)

        # After exhausting retries — if last error is a Meta rate-limit (17/4/613), surface a
        # friendly, translated message so the UI can react.
        err_obj = last_error if isinstance(last_error, dict) else {"error": {"message": str(last_error)}}
        err_code = (err_obj.get("error") or {}).get("code") if isinstance(err_obj, dict) else None
        if err_code in {4, 17, 613, 80004}:
            raise MetaAPIError(429, {
                "error": {
                    "code": err_code,
                    "message": "rate_limit",
                    "friendly_pt": "O Meta atingiu o limite de chamadas para esta conta de anúncios. Aguarde alguns minutos e tente novamente.",
                    "original": err_obj.get("error"),
                }
            })
        raise MetaAPIError(429, err_obj or "Meta API request failed")

    # --- Objetos genéricos ----------------------------------------------
    async def get_object(self, object_id: str, fields: str = "id,name,status,effective_status,daily_budget,lifetime_budget") -> dict:
        """Estado atual de campanha/conjunto/anúncio — usado para snapshots do Control Plane."""
        return await self._request("GET", f"/{object_id}", params={"fields": fields})

    # --- Ad Account -----------------------------------------------------
    async def get_ad_account(self) -> dict:
        return await self._request(
            "GET",
            f"/{self.ad_account_id}",
            params={"fields": "id,name,account_status,currency,timezone_name,amount_spent,balance,age,business_country_code,disable_reason"},
        )

    async def validate_credentials(self) -> dict:
        acc = await self.get_ad_account()
        return {"valid": True, "account": acc}

    # --- Campaigns ------------------------------------------------------
    async def list_campaigns(self, limit: int = 100) -> list:
        fields = (
            "id,name,status,effective_status,objective,daily_budget,lifetime_budget,"
            "buying_type,special_ad_categories,created_time,updated_time,start_time,stop_time"
        )
        out = []
        params = {"fields": fields, "limit": limit}
        path = f"/{self.ad_account_id}/campaigns"
        while path:
            data = await self._request("GET", path, params=params)
            out.extend(data.get("data", []))
            paging = data.get("paging", {}).get("next")
            if not paging or len(out) > 500:
                break
            # Use the next URL directly (drop base)
            path = paging.replace(BASE_URL, "")
            params = None
        return out

    async def update_campaign(self, campaign_id: str, patch: dict) -> dict:
        return await self._request("POST", f"/{campaign_id}", data=patch)

    async def create_campaign(self, payload: dict) -> dict:
        return await self._request("POST", f"/{self.ad_account_id}/campaigns", data=payload)

    # --- Ad Sets --------------------------------------------------------
    async def list_adsets(self, campaign_id: Optional[str] = None, limit: int = 100) -> list:
        fields = (
            "id,name,status,effective_status,campaign_id,daily_budget,lifetime_budget,"
            "bid_amount,bid_strategy,optimization_goal,billing_event,targeting,"
            "start_time,end_time,created_time,updated_time"
        )
        params = {"fields": fields, "limit": limit}
        path = f"/{campaign_id}/adsets" if campaign_id else f"/{self.ad_account_id}/adsets"
        out = []
        while path:
            data = await self._request("GET", path, params=params)
            out.extend(data.get("data", []))
            paging = data.get("paging", {}).get("next")
            if not paging or len(out) > 500:
                break
            path = paging.replace(BASE_URL, "")
            params = None
        return out

    async def update_adset(self, adset_id: str, patch: dict) -> dict:
        return await self._request("POST", f"/{adset_id}", data=patch)

    # --- Ads ------------------------------------------------------------
    async def list_ads(self, campaign_id: Optional[str] = None, limit: int = 200) -> list:
        fields = (
            "id,name,status,effective_status,campaign_id,adset_id,"
            "creative{id,name,object_story_spec,image_url,thumbnail_url,body,title},"
            "created_time,updated_time"
        )
        params = {"fields": fields, "limit": limit}
        path = f"/{campaign_id}/ads" if campaign_id else f"/{self.ad_account_id}/ads"
        out = []
        while path:
            data = await self._request("GET", path, params=params)
            out.extend(data.get("data", []))
            paging = data.get("paging", {}).get("next")
            if not paging or len(out) > 800:
                break
            path = paging.replace(BASE_URL, "")
            params = None
        return out

    async def update_ad(self, ad_id: str, patch: dict) -> dict:
        return await self._request("POST", f"/{ad_id}", data=patch)

    # --- Insights -------------------------------------------------------
    async def insights(
        self,
        level: str = "campaign",
        since: Optional[str] = None,
        until: Optional[str] = None,
        date_preset: Optional[str] = None,
        breakdowns: Optional[str] = None,
        ids: Optional[list] = None,
        time_increment: Optional[int] = None,
    ) -> list:
        fields = (
            "campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,"
            "impressions,clicks,spend,ctr,cpc,cpm,reach,frequency,"
            "actions,action_values,purchase_roas,cost_per_action_type,date_start,date_stop"
        )
        params: dict[str, Any] = {"level": level, "fields": fields, "limit": 500}
        if since and until:
            params["time_range"] = json.dumps({"since": since, "until": until})
        elif date_preset:
            params["date_preset"] = date_preset
        else:
            params["date_preset"] = "last_30d"
        if breakdowns:
            params["breakdowns"] = breakdowns
        if time_increment:
            params["time_increment"] = time_increment
        path = f"/{self.ad_account_id}/insights"
        if ids:
            params["ids"] = ",".join(ids)
        out = []
        while path:
            data = await self._request("GET", path, params=params)
            if not isinstance(data, dict):
                break
            out.extend(data.get("data", []))
            paging = data.get("paging", {}).get("next")
            if not paging or len(out) > 5000:
                break
            path = paging.replace(BASE_URL, "")
            params = None
        return out
