"""Threads Graph API：發文、在自己貼文下留言、抓成效。

只對「自己帳號的貼文」留言。自動到別人貼文底下留連結屬於垃圾訊息，
違反 Threads 社群規範且很快會被限流/停權，本專案刻意不做。
"""
from __future__ import annotations

import random
import time

import requests

BASE = "https://graph.threads.net/v1.0"
METRICS = "views,likes,replies,reposts,quotes"


class Threads:
    def __init__(self, token: str, user_id: str = "me", dry_run: bool = False):
        self.token, self.user_id, self.dry_run = token, user_id or "me", dry_run

    def _post(self, path: str, **params) -> dict:
        r = requests.post(f"{BASE}/{path}", params={**params, "access_token": self.token}, timeout=30)
        r.raise_for_status()
        return r.json()

    def publish_text(self, text: str, reply_to: str | None = None) -> str:
        if self.dry_run:
            fake = f"dry-{int(time.time()*1000)}{random.randint(0, 99)}"
            print(f"[threads:dry-run] {'↳ reply' if reply_to else 'post'} {fake}\n{text}\n")
            return fake
        params = {"media_type": "TEXT", "text": text}
        if reply_to:
            params["reply_to_id"] = reply_to
        container = self._post(f"{self.user_id}/threads", **params)["id"]
        time.sleep(3)  # 官方建議建立容器後稍等再發布
        return self._post(f"{self.user_id}/threads_publish", creation_id=container)["id"]

    def permalink(self, media_id: str) -> str:
        if self.dry_run:
            return ""
        r = requests.get(f"{BASE}/{media_id}", params={"fields": "permalink", "access_token": self.token}, timeout=30)
        return r.json().get("permalink", "") if r.ok else ""

    def insights(self, media_id: str) -> dict:
        if self.dry_run:
            rnd = random.Random(media_id)
            v = rnd.randint(300, 6000)
            return {"views": v, "likes": v // rnd.randint(25, 60), "replies": rnd.randint(0, 15),
                    "reposts": rnd.randint(0, 6), "quotes": rnd.randint(0, 3)}
        r = requests.get(f"{BASE}/{media_id}/insights",
                         params={"metric": METRICS, "access_token": self.token}, timeout=30)
        r.raise_for_status()
        return {m["name"]: (m.get("values") or [{}])[0].get("value", 0) for m in r.json().get("data", [])}

    def refresh_token(self) -> str | None:
        """長效 token 60 天到期；每次執行順手延長。回傳新 token（需手動更新 Secret）。"""
        if self.dry_run:
            return None
        r = requests.get(f"{BASE.rsplit('/', 1)[0]}/refresh_access_token",
                         params={"grant_type": "th_refresh_token", "access_token": self.token}, timeout=30)
        return r.json().get("access_token") if r.ok else None
