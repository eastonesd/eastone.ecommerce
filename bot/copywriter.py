"""產生 Threads 貼文。優先用 Claude，失敗或沒金鑰時退回模板。"""
from __future__ import annotations

import random

import requests

from .config import env

PROMPT = """你是台灣 Threads 上的生活好物分享者。為以下商品寫一篇貼文主文。
規則：
- 繁體中文、{tone}
- 120 字以內，開頭一句要能讓人停下來滑
- 不要放網址、不要寫「點連結」，連結會放在留言
- 不誇大功效、不寫「最便宜」「保證」等無法證實的字眼
- 結尾可以丟一個問題引導留言
商品：{name}
價格：NT${price:.0f}　評分：{rating}　已售：{sales}
只輸出貼文本文。"""

TEMPLATES = [
    "最近入手的{short}，用了一陣子覺得真的有感 👀\n評分 {rating}、賣了 {sales} 件，價格 NT${price:.0f} 左右。\n你們平常會選哪種？",
    "幫大家省點踩雷時間：{short}\n看了一圈評價，{rating} 顆星、{sales} 人買過。\n有用過的來說說心得？",
    "預算 NT${price:.0f} 左右想找{short}的可以看看這款\n已售 {sales}、評分 {rating}，CP 值我覺得不錯。",
]


def _short(name: str) -> str:
    for ch in "【】[]()（）":
        name = name.replace(ch, " ")
    return name.strip()[:24]


def write_post(p: dict, cfg: dict) -> str:
    cw, post = cfg["copywriter"], cfg["posting"]
    body = None
    if cw.get("provider") == "claude" and env("ANTHROPIC_API_KEY"):
        try:
            body = _claude(p, cw)
        except Exception as e:  # 寫文案失敗不該讓整個流程掛掉
            print(f"[copywriter] Claude 失敗，改用模板：{e}")
    if not body:
        body = random.choice(TEMPLATES).format(short=_short(p["name"]), **p)

    tags = " ".join(f"#{t}" for t in post["hashtags"])
    text = f"{body}\n\n{tags}\n{post['disclosure']}"
    return text[: post["max_chars"]]


def _claude(p: dict, cw: dict) -> str:
    r = requests.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": env("ANTHROPIC_API_KEY"),
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        json={
            "model": cw["model"],
            "max_tokens": 400,
            "messages": [{"role": "user", "content": PROMPT.format(tone=cw["tone"], **p)}],
        },
        timeout=60,
    )
    r.raise_for_status()
    return "".join(b.get("text", "") for b in r.json()["content"]).strip()


def write_reply(link: str) -> str:
    return f"🔗 商品連結在這：{link}\n（價格與庫存以蝦皮頁面為準）"
