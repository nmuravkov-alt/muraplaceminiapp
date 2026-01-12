import asyncio, json, logging, os, os.path as op, sqlite3
from typing import Optional

from aiogram import Bot, Dispatcher, F
from aiogram.filters import Command
from aiogram.types import (
    Message,
    InlineKeyboardMarkup,
    InlineKeyboardButton,
    WebAppInfo,
    User,
)
from aiogram.client.default import DefaultBotProperties
from aiohttp import web, ClientSession
from dotenv import load_dotenv

from db import get_categories, get_subcategories, get_products, get_product, create_order

# ✅ попробуем импортировать функцию импорта (как в PLACE-shop)
try:
    from seed_from_csv import seed_from_csv  # expected: seed_from_csv(csv_file: str, clear: bool=False)
except Exception:
    seed_from_csv = None

load_dotenv()

BOT_TOKEN   = os.getenv("BOT_TOKEN", "").strip()

# ✅ Railway обычно даёт PORT, дефолт лучше 8080, но можно оставить 8000 если привык
PORT        = int(os.getenv("PORT", "8080"))

STORE_TITLE = (os.getenv("STORE_TITLE", "LAYOUTPLACE Shop").strip() or "LAYOUTPLACE Shop")

# ✅ используем именно DB_PATH (и подключай Volume /data/..)
DB_PATH     = os.getenv("DB_PATH", "data.sqlite")

# ✅ Google Sheets CSV URL (именно export?format=csv&gid=0)
GOOGLE_SHEET_CSV_URL = os.getenv("GOOGLE_SHEET_CSV_URL", "").strip()

def _parse_ids(s: str):
    out = []
    for part in (s or "").split(","):
        part = part.strip()
        if not part:
            continue
        try:
            out.append(int(part))
        except Exception:
            logging.warning("Skip bad ADMIN_CHAT_IDS item: %r", part)
    return out

ADMIN_CHAT_IDS = _parse_ids(os.getenv("ADMIN_CHAT_IDS", "6773668793"))

# ✅ WebApp URL: не всегда надо +"/web/" слепо — приводим аккуратно
WEBAPP_URL = (os.getenv("WEBAPP_URL", "").strip() or "").rstrip("/")
if WEBAPP_URL and not WEBAPP_URL.startswith(("http://", "https://")):
    WEBAPP_URL = "https://" + WEBAPP_URL.lstrip("/")
# хотим чтобы открывался именно /web/
if WEBAPP_URL and not WEBAPP_URL.endswith("/web"):
    if not WEBAPP_URL.endswith("/web/"):
        WEBAPP_URL = WEBAPP_URL + "/web/"
else:
    if WEBAPP_URL.endswith("/web"):
        WEBAPP_URL = WEBAPP_URL + "/"

THANKYOU_TEXT = "Спасибо за заказ! В скором времени с Вами свяжется менеджер и пришлет реквизиты для оплаты!"

logging.basicConfig(level=logging.INFO)
bot = Bot(BOT_TOKEN, default=DefaultBotProperties(parse_mode="HTML"))
dp  = Dispatcher()

# ---- helpers ----
def _get_setting(key: str, default: Optional[str] = None) -> Optional[str]:
    """Читает settings.value по ключу; если таблицы/ключа нет — вернёт default."""
    try:
        with sqlite3.connect(DB_PATH) as conn:
            cur = conn.execute("SELECT value FROM settings WHERE key=?", (key,))
            row = cur.fetchone()
            return row[0] if row and row[0] is not None else default
    except Exception:
        return default

def _is_admin(user_id: int) -> bool:
    return (user_id in set(ADMIN_CHAT_IDS))

async def _download_csv(url: str, dest_path: str) -> None:
    async with ClientSession() as sess:
        async with sess.get(url) as resp:
            if resp.status != 200:
                text = await resp.text()
                raise RuntimeError(f"CSV fetch failed: HTTP {resp.status}: {text[:200]}")
            data = await resp.read()
    os.makedirs(op.dirname(dest_path), exist_ok=True)
    with open(dest_path, "wb") as f:
        f.write(data)

async def sync_from_google(clear_products: bool = False) -> str:
    """
    Скачивает CSV из Google Sheets и импортирует товары в БД.
    clear_products=False — НЕ трогает заказы/настройки, обновляет только товары (как в PLACE-shop).
    """
    if not GOOGLE_SHEET_CSV_URL:
        raise RuntimeError("GOOGLE_SHEET_CSV_URL не задан в Railway Variables")

    tmp_csv = "/tmp/products_sheet.csv"
    await _download_csv(GOOGLE_SHEET_CSV_URL, tmp_csv)

    if seed_from_csv is None:
        # fallback: запустить как скрипт (если импорт функции не сработал)
        import sys, subprocess
        cmd = [sys.executable, "seed_from_csv.py", "--csv", tmp_csv]
        if clear_products:
            cmd.append("--clear")
        p = subprocess.run(cmd, capture_output=True, text=True)
        if p.returncode != 0:
            raise RuntimeError((p.stderr or p.stdout or "").strip()[:4000])
        return f"✅ Синк выполнен (script). { (p.stdout or '').strip() }"
    else:
        # основной путь — импорт функции
        seed_from_csv(tmp_csv, clear=clear_products)
        return "✅ Товары обновлены из Google Sheets."

# ---------- Web ----------
async def index_handler(request):
    return web.FileResponse(op.join("web", "index.html"))

async def file_handler(request):
    path = request.match_info.get("path", "")
    if not path:
        return web.FileResponse(op.join("web", "index.html"))
    p = op.join("web", path)
    if not op.isfile(p):
        return web.Response(status=404, text="Not found")
    return web.FileResponse(p)

async def api_config(request):
    logo_url   = _get_setting("logo_url", "")
    video_url  = _get_setting("hero_video_url", "")
    hero_url   = video_url or logo_url
    hero_type  = "video" if video_url else ("image" if logo_url else "")

    return web.json_response({
        "title": STORE_TITLE,
        "logo_url": logo_url,
        "video_url": video_url,
        "hero_url": hero_url,
        "hero_type": hero_type,
    })

async def api_categories(request):
    return web.json_response(get_categories())

async def api_subcategories(request):
    cat = request.rel_url.query.get("category")
    return web.json_response(get_subcategories(cat))

async def api_products(request):
    cat = request.rel_url.query.get("category")
    sub = request.rel_url.query.get("subcategory")
    return web.json_response(get_products(cat, sub))

async def api_order(request):
    data = await request.json()
    items, total = [], 0
    for it in data.get("items", []):
        p = get_product(int(it["product_id"]))
        if not p:
            continue
        qty  = int(it.get("qty", 1))
        size = (it.get("size") or "")
        items.append({"product_id": p["id"], "size": size, "qty": qty, "price": p["price"]})
        total += p["price"] * qty

    order_id = create_order(
        user_id=0, username=None,
        full_name=data.get("full_name"), phone