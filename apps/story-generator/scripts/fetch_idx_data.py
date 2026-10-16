"""
Ambil data gratis untuk Story Generator. Dijalankan oleh GitHub Actions.

    python scripts/fetch_idx_data.py wrap       -> site/public/wrap.json
    python scripts/fetch_idx_data.py calendar   -> site/public/calendar.json (+ site/public/calendar-raw.json)
    python scripts/fetch_idx_data.py lme        -> site/public/lme.json (LME Closing Price 3-month timah & nikel)

wrap     : ringkasan penutupan resmi IDX — IHSG (close, high, low, volume, nilai),
           indeks sektoral, dan harga penutupan semua saham (untuk breadth & % kontribusi).
calendar : agenda emiten dari kalender IDX (corporate action, RUPS, public expose, IPO)
           + jadwal rilis CPI & NFP dari kalender resmi BLS (AS).

IDX dilindungi Cloudflare, jadi data diambil lewat browser sungguhan (Playwright).
Kalau IDX memblok, script berhenti dengan error dan file lama TIDAK ditimpa.
"""
import json
import re
import sys
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "site" / "public"
WIB = ZoneInfo("Asia/Jakarta")

IDX_HOME = "https://www.idx.co.id/id/data-pasar/ringkasan-perdagangan/ringkasan-saham/"
IDX_STOCK_API = "https://www.idx.co.id/primary/TradingSummary/GetStockSummary?length=9999&start=0"
IDX_INDEX_API = "https://www.idx.co.id/primary/TradingSummary/GetIndexSummary?length=9999&start=0"
# Kalender Perusahaan Tercatat IDX. Tanggal dipilih lewat ?d=YYYYMMDD.
# Isi tiap agenda: "Perihal" (berisi NAMA perusahaan, bukan kode) dan "Lokasi".
IDX_CALENDAR_URL = "https://www.idx.co.id/id/perusahaan-tercatat/kalender-perusahaan-tercatat/?d={ymd}"
CALENDAR_DAYS_AHEAD = 3   # hari ini + 3 hari ke depan
BLS_ICS = "https://www.bls.gov/schedule/news_release/bls.ics"

SECTORS = {
    "IDXENERGY": "Energi", "IDXBASIC": "Barang Baku", "IDXINDUST": "Perindustrian",
    "IDXNONCYC": "Konsumen Primer", "IDXCYCLIC": "Konsumen Non-Primer", "IDXHEALTH": "Kesehatan",
    "IDXFINANCE": "Keuangan", "IDXPROPERT": "Properti", "IDXTECHNO": "Teknologi",
    "IDXINFRA": "Infrastruktur", "IDXTRANS": "Transportasi",
}
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36")


# ---------------------------------------------------------------- helpers
def num(v):
    if v is None or v == "":
        return None
    try:
        return float(str(v).replace(",", ""))
    except ValueError:
        return None


def pick(row, *keys):
    low = {k.lower(): v for k, v in row.items()}
    for k in keys:
        if k.lower() in low:
            return low[k.lower()]
    return None


def rows_of(payload):
    rows = payload.get("Result") or payload.get("data") or payload.get("Data") or []
    if isinstance(rows, dict):
        rows = rows.get("data") or rows.get("rows") or []
    if not isinstance(rows, list) or not rows:
        raise RuntimeError("Data IDX kosong / format berubah")
    return rows


def write(name, obj):
    PUBLIC.mkdir(exist_ok=True)
    (PUBLIC / name).write_text(json.dumps(obj, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"✓ site/public/{name} ditulis")


def open_browser(p):
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(locale="id-ID", user_agent=UA, viewport={"width": 1440, "height": 1000},
                              timezone_id="Asia/Jakarta")
    return browser, ctx.new_page()


def fetch_in_page(page, url):
    """Fetch dari dalam halaman IDX supaya cookie/clearance Cloudflare ikut terpakai."""
    last = None
    for attempt in range(1, 4):
        res = page.evaluate("""async (url) => {
            const r = await fetch(url, {credentials:'include',
              headers:{'Accept':'application/json, text/plain, */*','X-Requested-With':'XMLHttpRequest'}});
            return {status:r.status, text: await r.text()};
        }""", url)
        if res["status"] == 200:
            try:
                return json.loads(res["text"])
            except json.JSONDecodeError:
                last = f"bukan JSON (kemungkinan diblok Cloudflare): {res['text'][:200]}"
        else:
            last = f"HTTP {res['status']}: {res['text'][:200]}"
        page.wait_for_timeout(4000 * attempt)
    raise RuntimeError(f"Gagal ambil {url} — {last}")


def open_idx(page, tries=3):
    """Buka halaman IDX dan tunggu sampai halaman pemeriksaan Cloudflare ("Just a moment") selesai sendiri.
    Kalau tetap tertahan, berhenti dengan pesan jelas (generator punya cadangan bookmark manual)."""
    for attempt in range(1, tries + 1):
        page.goto(IDX_HOME, wait_until="domcontentloaded", timeout=60000)
        for _ in range(20):
            page.wait_for_timeout(1500)
            if "just a moment" not in (page.title() or "").lower():
                page.wait_for_timeout(3000)
                return
        print(f"⚠ IDX masih menampilkan pemeriksaan Cloudflare (percobaan {attempt}/{tries})")
        page.wait_for_timeout(15000 * attempt)
    raise RuntimeError("IDX memblok server GitHub (pemeriksaan Cloudflare). "
                       "Pakai cadangan bookmark '📋 Wrap IDX' di tab Wrap.")


# ---------------------------------------------------------------- wrap
def wrap():
    with sync_playwright() as p:
        browser, page = open_browser(p)
        try:
            open_idx(page)
            stock_rows = rows_of(fetch_in_page(page, IDX_STOCK_API))
            index_rows = rows_of(fetch_in_page(page, IDX_INDEX_API))
        finally:
            browser.close()

    stocks, dates = {}, set()
    for r in stock_rows:
        code = str(pick(r, "StockCode", "Code", "KodeSaham") or "").strip().upper()
        if not code:
            continue
        d = str(pick(r, "Date") or "")[:10]
        if d:
            dates.add(d)
        stocks[code] = [num(pick(r, "Close")), num(pick(r, "Previous", "Prev")),
                        num(pick(r, "Change")), num(pick(r, "Volume")), num(pick(r, "Value"))]

    indices = {}
    for r in index_rows:
        code = str(pick(r, "IndexCode", "Code") or "").strip().upper()
        if not code:
            continue
        d = str(pick(r, "Date") or "")[:10]
        if d:
            dates.add(d)
        prev, close, chg = num(pick(r, "Previous", "Prev")), num(pick(r, "Close")), num(pick(r, "Change"))
        if chg is None and prev and close is not None:
            chg = close - prev
        indices[code] = {
            "close": close, "prev": prev, "change": chg,
            "pct": (chg / prev * 100) if (chg is not None and prev) else None,
            "high": num(pick(r, "Highest", "High")), "low": num(pick(r, "Lowest", "Low")),
            "volume": num(pick(r, "Volume")), "value": num(pick(r, "Value")),
            "frequency": num(pick(r, "Frequency")),
        }

    comp = indices.get("COMPOSITE")
    if not comp or comp["close"] is None:
        raise RuntimeError("Baris COMPOSITE (IHSG) tidak ditemukan di ringkasan indeks IDX")
    if not comp.get("volume"):
        comp["volume"] = sum((s[3] or 0) for s in stocks.values())
    if not comp.get("value"):
        comp["value"] = sum((s[4] or 0) for s in stocks.values())

    if len(dates) != 1:
        print("⚠ Tanggal data IDX tidak seragam:", sorted(dates))
    trade_date = max(dates) if dates else None

    sectors = [{"code": c, "name": n, "pct": indices[c]["pct"]}
               for c, n in SECTORS.items() if c in indices and indices[c]["pct"] is not None]

    write("wrap.json", {
        "ok": True, "source": "IDX (ringkasan penutupan resmi)",
        "date": trade_date, "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "ihsg": comp, "sectors": sectors,
        "stocks": {k: v[:4] for k, v in stocks.items()},   # [close, prev, change, volume]
    })


# ---------------------------------------------------------------- calendar
def find_record_lists(obj, out):
    """Cari semua list berisi dict di dalam JSON (struktur IDX bisa bersarang)."""
    if isinstance(obj, list):
        if obj and all(isinstance(x, dict) for x in obj):
            out.append(obj)
        for x in obj:
            find_record_lists(x, out)
    elif isinstance(obj, dict):
        for v in obj.values():
            find_record_lists(v, out)
    return out


DATE_RE = re.compile(r"(\d{4})-(\d{2})-(\d{2})|(\d{1,2})/(\d{1,2})/(\d{4})")


def parse_date(v):
    m = DATE_RE.search(str(v or ""))
    if not m:
        return None
    if m.group(1):
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    return f"{m.group(6)}-{int(m.group(5)):02d}-{int(m.group(4)):02d}"


SKIP_WORDS = ("kupon", "jatuh tempo", "obligasi", "sukuk", "surat berharga negara", "perbendaharaan",
              "medium term note", "efek beragun", "dinfra", "reksa dana", "etf")


def classify(text):
    t = text.lower()
    if any(k in t for k in SKIP_WORDS):
        return None          # agenda obligasi / SBN / produk lain — bukan untuk story saham
    if "public expose" in t or "paparan publik" in t:
        return "PUBEX"
    if "rups" in t or "rapat umum" in t:
        return "RUPS"
    if "ipo" in t or "pencatatan perdana" in t or "penawaran umum perdana" in t:
        return "IPO"
    if any(k in t for k in ("dividen", "cum", "ex date", "recording", "dps", "daftar pemegang", "pembayaran",
                            "distribusi", "stock split", "pemecahan", "penggabungan", "hmetd", "rights",
                            "saham bonus", "reverse", "waran", "tender offer", "pembelian kembali")):
        return "CA"
    return None


def norm_name(t):
    t = re.sub(r"\b(pt|tbk|persero)\b\.?", " ", str(t or "").lower())
    return re.sub(r"[^a-z0-9]", "", t)


NAME_INDEX = None


def code_from_text(text):
    """Cari kode saham dari NAMA perusahaan di teks (pakai site/data/stocks.js)."""
    global NAME_INDEX
    if NAME_INDEX is None:
        raw = (ROOT / "site" / "data" / "stocks.js").read_text(encoding="utf-8")
        stocks = json.loads(raw[raw.index("{"):raw.rindex("}") + 1])
        NAME_INDEX = sorted(((norm_name(n), c, n) for c, n in stocks.items() if len(norm_name(n)) >= 6),
                            key=lambda x: -len(x[0]))   # nama terpanjang dicocokkan dulu
    n = norm_name(text)
    for key, code, name in NAME_INDEX:
        if key in n:
            return code, name
    return "", ""


def short_title(title, company):
    """Buang nama perusahaan & kata pengisi supaya muat di kartu story."""
    t = title
    if company:
        t = re.sub(re.escape(company), " ", t, flags=re.I)
    t = re.sub(r"\b(PT|Tbk\.?|Pemberitahuan|tanggal|Rencana|Informasi)\b", " ", t, flags=re.I)
    t = re.sub(r"\d{2}-\d{2}-\d{4}", " ", t)
    return re.sub(r"\s+", " ", t).strip(" -·,.")[:60]


def normalize(rec, page_date=None):
    low = {k.lower(): v for k, v in rec.items()}
    date = None
    for k, v in low.items():
        if "date" in k or "tanggal" in k:
            date = parse_date(v)
            if date:
                break
    code = next((str(low[k]).strip().upper() for k in
                 ("code", "kode", "stockcode", "kodeemiten", "ticker", "kode_emiten") if low.get(k)), "")
    title = next((str(low[k]).strip() for k in
                  ("perihal", "description", "keterangan", "agenda", "title", "judul", "step", "event", "kegiatan",
                   "jenis", "type", "nama") if low.get(k)), "")
    date = date or page_date
    time = None
    for k, v in low.items():
        if any(x in k for x in ("time", "jam", "hour", "waktu")):
            m = re.search(r"(\d{1,2})[:.](\d{2})", str(v or ""))
            if m:
                time = f"{int(m.group(1)):02d}:{m.group(2)}"
                break
    cat = classify(title or " ".join(str(v) for v in rec.values() if isinstance(v, (str, int, float))))
    if not (date and cat and title):
        return None
    company = ""
    if not re.fullmatch(r"[A-Z]{4}", code or ""):
        code, company = code_from_text(title)
    if not code:
        return None          # bukan saham di daftar -> tidak ditampilkan
    return {"date": date, "code": code, "category": cat, "title": short_title(title, company), "time": time}


def bls_events():
    """CPI & NFP dari kalender resmi BLS (.ics), jam dikonversi ke WIB."""
    req = urllib.request.Request(BLS_ICS, headers={"User-Agent": UA, "Accept": "text/calendar,*/*"})
    text = urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "ignore")
    text = re.sub(r"\r?\n[ \t]", "", text)  # unfold baris .ics
    events = []
    for block in text.split("BEGIN:VEVENT")[1:]:
        summ = re.search(r"^SUMMARY[^:]*:(.*)$", block, re.M)
        dt = re.search(r"^DTSTART(;[^:]*)?:(\d{8}T\d{4,6}Z?)$", block, re.M)
        if not (summ and dt):
            continue
        s = summ.group(1).strip()
        if s.startswith("Consumer Price Index"):
            label = "Inflasi AS (CPI)"
        elif s.startswith("Employment Situation"):
            label = "Data tenaga kerja AS (Non-Farm Payrolls)"
        else:
            continue
        raw = dt.group(2)
        base = datetime.strptime(raw[:13], "%Y%m%dT%H%M")
        if raw.endswith("Z"):
            when = base.replace(tzinfo=timezone.utc)
        else:
            tz = re.search(r"TZID=([^;:]+)", dt.group(1) or "")
            try:
                zone = ZoneInfo(tz.group(1).strip('"')) if tz else ZoneInfo("America/New_York")
            except Exception:
                zone = ZoneInfo("America/New_York")  # BLS memakai Eastern Time
            when = base.replace(tzinfo=zone)
        w = when.astimezone(WIB)
        events.append({"date": w.strftime("%Y-%m-%d"), "time": w.strftime("%H:%M"),
                       "country": "US", "event": label, "source": "BLS"})
    return events


def calendar():
    """Jadwal rilis AS (BLS). Agenda emiten TIDAK diambil di sini: kalender IDX dilindungi
    verifikasi Cloudflare, jadi diambil lewat bookmark "Kalender IDX" dari browser
    pengguna lalu ditempel di generator (tab Morning)."""
    try:
        macro = bls_events()
    except Exception as e:
        print("⚠ Kalender BLS gagal:", e)
        macro = []
    print(f"Agenda AS (BLS): {len(macro)}")
    write("calendar.json", {
        "ok": True, "generatedAt": datetime.now(timezone.utc).isoformat(),
        "idx": [], "macro": macro,
        "note": "Agenda emiten ditempel dari kalender IDX lewat bookmark di generator.",
    })

# ---------------------------------------------------------------- LME
LME_PAGE = "https://www.lme.com/metals/non-ferrous/lme-{page}"
LME_API = "/api/trading-data/day-delayed?datasourceId={id}"
LME_CLOSING = {  # LME Closing Prices, kontrak 3-month
    "tin": {"id": "de878b98-626a-4a66-acba-d083a1b7a15e", "page": "tin"},
    "ni": {"id": "ccb89496-0b6e-4352-b15f-12086ff4dbc1", "page": "nickel"},
}


def lme_fetch(page, url):
    """Fetch API LME dari dalam halaman lme.com, tanpa header tambahan (sama seperti browser biasa)."""
    res = page.evaluate("""async (url) => {
        const r = await fetch(url, {credentials:'include', cache:'no-store'});
        return {status:r.status, text: await r.text()};
    }""", url)
    if res["status"] != 200:
        raise RuntimeError(f"LME HTTP {res['status']}: {res['text'][:200]}")
    return json.loads(res["text"])


def lme_3m(payload):
    """Nilai kontrak 3-month dari tabel LME (angka pertama yang valid di baris 3-month)."""
    for row in (payload or {}).get("Rows") or []:
        title = re.sub(r"[\s\-]", "", str(row.get("RowTitle", "")).lower())
        if title in ("3month", "3months", "3m"):
            for raw in reversed(row.get("Values") or []):
                try:
                    v = float(str(raw).replace(",", "").strip())
                    if v > 0:
                        return v
                except ValueError:
                    continue
    return None


def rows_brief(payload):
    return [(r.get("RowTitle"), r.get("Values")) for r in ((payload or {}).get("Rows") or [])[:4]]


def lme():
    """Harga LME Closing 3-month hari bursa terakhir + hari bursa sebelumnya. Harga sebelumnya
    dicari lewat parameter dateOfData; kalau LME tidak memberi, dipakai riwayat di site/public/lme.json."""
    old = {}
    try:
        old = json.loads((PUBLIC / "lme.json").read_text(encoding="utf-8"))
    except Exception:
        pass
    history = old.get("history") or {}
    out = {"ok": True, "generatedAt": datetime.now(timezone.utc).isoformat(), "source": "LME Closing Price 3-month"}
    errors = {}
    with sync_playwright() as p:
        browser, page = open_browser(p)
        try:
            for key, cfg in LME_CLOSING.items():
                try:
                    page.goto(LME_PAGE.format(page=cfg["page"]), wait_until="domcontentloaded", timeout=60000)
                    page.wait_for_timeout(3000)
                    api = LME_API.format(id=cfg["id"])
                    latest = lme_fetch(page, api)
                    close, date = lme_3m(latest), str(latest.get("DateOfData", ""))[:10]
                    print(f"{key} terbaru: DateOfData={date!r} 3-month={close}")
                    if not close or not date:
                        raise RuntimeError(f"closing 3-month tidak ditemukan {rows_brief(latest)}")
                    hist = history.setdefault(key, {})
                    hist[date] = close
                    prev = prev_date = None
                    d = datetime.strptime(date, "%Y-%m-%d")
                    for back in range(1, 8):
                        day = d - timedelta(days=back)
                        if day.weekday() >= 5:
                            continue                      # LME tutup Sabtu/Minggu
                        ds = day.strftime("%Y-%m-%d")
                        pj = lme_fetch(page, f"{api}&dateOfData={ds}")
                        page.wait_for_timeout(800)
                        got, val = str(pj.get("DateOfData", ""))[:10], lme_3m(pj)
                        print(f"  {key} cek {ds}: DateOfData={got!r} 3-month={val}" + ("" if val else f" rows={rows_brief(pj)}"))
                        if val and got and got < date:
                            prev, prev_date = val, got
                            hist[got] = val
                            break
                        if hist.get(ds):                  # cadangan: riwayat yang tersimpan
                            prev, prev_date = hist[ds], ds
                            print(f"  {key}: memakai riwayat tersimpan {ds} = {prev}")
                            break
                    if not prev:
                        raise RuntimeError("closing hari sebelumnya tidak ditemukan")
                    out[key] = {"close": close, "prevClose": prev, "date": date, "prevDate": prev_date,
                                "changePct": (close - prev) / prev * 100}
                    print(f"{key}: {date} {close} (prev {prev_date} {prev}) {out[key]['changePct']:+.2f}%")
                except Exception as e:
                    errors[key] = str(e)
                    print(f"⚠ LME {key} gagal: {e}")
        finally:
            browser.close()
    # simpan riwayat 40 hari terakhir per logam
    out["history"] = {k: dict(sorted(v.items())[-40:]) for k, v in history.items()}
    if errors:
        out["errors"] = errors
    if not any(k in out for k in LME_CLOSING):
        raise RuntimeError(f"LME gagal semua: {errors}")
    write("lme.json", out)


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "wrap"
    {"wrap": wrap, "calendar": calendar, "lme": lme}[mode]()
