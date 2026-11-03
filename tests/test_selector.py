from datetime import datetime, timezone

from bot import selector
from bot.config import load_config

CFG = load_config()


def item(**kw):
    base = dict(item_id="1", name="x", price=500.0, commission_rate=0.08, commission=40.0,
                sales=2000, rating=4.9, discount=0.2, keyword="a")
    return {**base, **kw}


def test_filters():
    assert selector.passes_filters(item(), CFG["selection"])
    assert not selector.passes_filters(item(commission_rate=0.01), CFG["selection"])
    assert not selector.passes_filters(item(price=50), CFG["selection"])


def test_expected_commission():
    ec = selector.expected_commission(item(), CFG["profit"], views=1000)
    assert round(ec, 3) == round(1000 * 0.012 * 0.035 * 40, 3)


def test_pick_respects_cooldown_and_keyword_diversity():
    pool = [item(item_id="1", keyword="a"), item(item_id="2", keyword="a"), item(item_id="3", keyword="b")]
    hist = [{"item_id": "3", "posted_at": datetime.now(timezone.utc).isoformat()}]
    picked = selector.pick(pool, CFG, hist)
    ids = [p["item_id"] for p in picked]
    assert "3" not in ids and len(ids) == 1
