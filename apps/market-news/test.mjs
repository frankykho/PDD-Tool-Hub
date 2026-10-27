// Cek Market News: parser sumber, klasifikasi, skor hype, AI (ditiru), terbitkan, halaman publik & pratinjau WhatsApp.
// Jalankan: node apps/market-news/test.mjs   (Node 22.15+)
import assert from "node:assert/strict";
import fs from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { parseRss, parseList, cleanTitle, classify, score, article, parseAi, marketFrom, overview, SOURCES, idOf, parseFin, finMoney } from "./news.js";

registerHooks({
  load(url, ctx, next) {
    if (url.startsWith("file:") && url.endsWith(".html")) return { format: "module", shortCircuit: true, source: "export default " + JSON.stringify(fs.readFileSync(fileURLToPath(url), "utf8")) };
    return next(url, ctx);
  },
});

/* ---------- parser ---------- */
const H = (h) => new Date(Date.now() - h * 3600e3).toUTCString();
const rss = (items) => `<rss><channel>${items.map(([t, link, d = "", extra = "", h = 2]) => `<item><title><![CDATA[${t}]]></title>${link.startsWith("guid:") ? `<guid>${link.slice(5)}</guid>` : `<link><![CDATA[${link}]]></link>`}<pubDate>${H(h)}</pubDate><description><![CDATA[${d}]]></description>${extra}</item>`).join("")}</channel></rss>`;
const cnbc = parseRss(rss([["OJK &amp; BEI: IHSG Ditutup Naik 1,2%", "guid:https://www.cnbcindonesia.com/market/1-17-1/ihsg", '<img src="https://img.test/a.png?w=1&amp;q=9"/> IHSG menguat.', '<enclosure url="https://img.test/a.png?w=1&amp;q=9" type="image/jpeg"/>']]));
assert.deepEqual([cnbc[0].url, cnbc[0].title, cnbc[0].image, cnbc[0].descr], ["https://www.cnbcindonesia.com/market/1-17-1/ihsg", "OJK & BEI: IHSG Ditutup Naik 1,2%", "https://img.test/a.png?w=1&q=9", "IHSG menguat."], "link dari guid, gambar dari enclosure, entitas didekode");
const bis = parseList(`<a href="https://market.bisnis.com/read/20261022/7/2014728/ihsg-dibuka-turun-251-ke-5914"><img></a><a href="https://market.bisnis.com/read/20261022/7/2014728/ihsg-dibuka-turun-251-ke-5914">IHSG Dibuka Turun 2,51% ke 5.914, Saham TPIA Longsor</a><a href="https://bandung.bisnis.com/read/20261022/1/2/lain">Berita daerah yang tidak dipantau sama sekali</a>`, SOURCES.find((s) => s.id === "bisnis-market").link);
assert.deepEqual(bis.map((x) => [x.title, x.at]), [["IHSG Dibuka Turun 2,51% ke 5.914, Saham TPIA Longsor", "2026-10-22T00:00:00+07:00"]], "teks link terpanjang, tanggal dari URL, subdomain lain dilewati");
const een = parseList(`<a href="https://www.emitennews.com/news/bantah-delisting-bnga-pilih-kejar-minimum-free-float">Read More</a>`, SOURCES.find((s) => s.id === "emitennews").link);
assert.equal(een[0].title, "Bantah delisting bnga pilih kejar minimum free float", "teks 'Read More' -> judul dari slug");
const inv = parseList(`<a href="https://investor.id/market/1/berita-berbayar">★ PREMIUM</a><a href="https://investor.id/market/1/berita-berbayar">Judul berita berbayar yang panjang</a><a href="https://investor.id/market/2/amman-buyback">Amman Mineral (AMMN) Siap Buyback Saham Rp 1 T</a>`, SOURCES.find((s) => s.id === "investor-market").link);
assert.deepEqual(inv.map((x) => x.title), ["Amman Mineral (AMMN) Siap Buyback Saham Rp 1 T"], "artikel PREMIUM dilewati");
assert.equal(cleanTitle("Emiten News --> Bos OJK Sebut PAM Jaya Mulai IPO"), "Bos OJK Sebut PAM Jaya Mulai IPO");
assert.equal(cleanTitle("Bukan Delisting, Saham HSC Dihapus dari IHSG 19/10/2026, 19:37 WIB"), "Bukan Delisting, Saham HSC Dihapus dari IHSG");

assert.equal(cleanTitle("Trending News --> Emiten Afiliasi Salim (AMMN) Berencana Buyback"), "Emiten Afiliasi Salim (AMMN) Berencana Buyback");
const bio = article("<meta property=\"og:title\" content=\"Cerah! IHSG Sesi Siang Bangkit 1,7%\"><p>Sempat jadi Youth Researcher ADB; memulai karir jurnalistik di e-bursa.com sebagai Reporter (2008-2013).</p><p>Potret mahasiswa di depan layar IHSG. Foto: EmitenNews/Akhmad Jiharka sedang memotret.</p><p>IHSG menguat 1,7 persen pada sesi siang ditopang saham perbankan dan energi.</p>");
assert.deepEqual([bio.title, bio.text], ["Cerah! IHSG Sesi Siang Bangkit 1,7%", "IHSG menguat 1,7 persen pada sesi siang ditopang saham perbankan dan energi."], "biodata penulis & keterangan foto tidak ikut dibaca AI");

/* ---------- klasifikasi ---------- */
const codes = new Set(["MBSS", "TLKM", "PTPP", "ADRO", "PTBA", "ANTM", "INCO"]);
const K = (t) => { const c = classify(t, "", codes); return c && [c.cat, c.theme, c.tickers.join(",")]; };
assert.deepEqual(K("Mitrabahtera Segara (MBSS) Buyback Saham Rp 200 Miliar"), ["emiten", "Buyback", "MBSS"]);
assert.deepEqual(K("BI Rate Ditahan 5,75%, Yield SBN Diproyeksi Naik"), ["makro", "BI-Rate", ""]);
assert.deepEqual(K("Kredit Perbankan Tumbuh 13,69%, Tertinggi dalam 10 Tahun"), ["makro", "Kredit", ""]);
assert.deepEqual(K("IHSG Dibuka Turun 2,51% ke 5.914"), ["pasar", "IHSG", ""]);
assert.deepEqual(K("Harga Batu Bara Melonjak 5% ke Level Tertinggi"), ["pasar", "Batu bara", ""]);
assert.equal(K("Rekomendasi Saham Hari Ini: TLKM dan PTPP Layak Beli"), null, "rekomendasi analis tidak dibagikan ke nasabah");
assert.equal(K("Video: Harga Minyak Brent Dekati USD 110"), null);
assert.equal(K("Bitcoin Reli Lagi, Bisa Naik Segini"), null);
assert.equal(K("Greenpeace Bentangkan Spanduk di Bundaran HI"), null, "berita umum tidak dipantau");
assert.deepEqual(K("Laba BUMN Karya Turun, Saham ABCD Ikut Melemah"), ["pasar", "", ""], "ABCD bukan kode terdaftar -> bukan kode saham");

/* ---------- skor hype ---------- */
const now = Date.parse("2026-10-22T08:00:00Z"), at = (h) => new Date(now - h * 3600e3).toISOString();
const I = (id, src, title, h, extra = {}) => ({ id, src, title, at: at(h), url: "https://x.test/" + id, ...classify(title, "", codes), ...extra });
const items = [
  I("a1", "CNBC Indonesia", "Mitrabahtera Segara (MBSS) Buyback Saham Rp 200 Miliar", 1),
  I("a2", "Kontan", "MBSS Siapkan Buyback Rp200 Miliar", 2),
  I("a3", "Bisnis.com", "Buyback MBSS Rp200 M Dimulai Pekan Depan", 3),
  I("b1", "Kontan", "BI Rate Ditahan 5,75% pada RDG Oktober", 2),
  I("b2", "CNBC Indonesia", "BI Rate Diprediksi Turun Tahun Depan", 30),
  I("c1", "EmitenNews", "Telkom (TLKM) Garap Data Center Baru", 2),
];
const sc = score(items, { MBSS: 4.5, TLKM: -1 }, now);
assert.deepEqual([sc.a1.lead, sc.a2.lead, sc.a3.lead, sc.a1.ckey], [1, 0, 0, "T:MBSS"], "satu wakil per emiten");
assert.deepEqual(sc.a1.sources.map((x) => x.src), ["Kontan", "Bisnis.com"], "media lain dicatat");
assert.ok(sc.a1.score > sc.c1.score, "3 media + buyback + saham naik > 1 media");
assert.ok(sc.b1.score > sc.b2.score, "rilis keputusan (ditahan 5,75%) > proyeksi lama");
assert.equal(sc.b1.lead, 1);

/* ---------- artikel & AI ---------- */
const art = article(`<head><meta property="og:image" content="https://img.test/og.jpg"><meta name="description" content="Desk"></head><body><nav><p>Menu menu menu menu menu menu menu menu menu menu menu menu menu</p></nav>
  <p>PT Mitrabahtera Segara Sejati Tbk (MBSS) mengalokasikan dana Rp200 miliar untuk pembelian kembali saham mulai pekan depan.</p><p>Baca juga: berita lain yang tidak perlu dibaca oleh AI sama sekali di sini ya</p><script>var x="<p>skrip skrip skrip skrip skrip skrip skrip skrip skrip skrip</p>"</script></body>`);
assert.deepEqual([art.image, art.descr, art.text], ["https://img.test/og.jpg", "Desk", "PT Mitrabahtera Segara Sejati Tbk (MBSS) mengalokasikan dana Rp200 miliar untuk pembelian kembali saham mulai pekan depan."]);
const pa = parseAi('```json\n{"title":"MBSS Buyback Rp200 Miliar","summary":"MBSS menyiapkan buyback Rp200 miliar. Investor bisa beli saham MBSS sekarang di harga murah.","why":"Buyback menopang harga saham.","cat":"emiten","tickers":["mbss","XX"]}\n```');
assert.deepEqual(pa, { title: "MBSS Buyback Rp200 Miliar", summary: "MBSS menyiapkan buyback Rp200 miliar.", why: "Buyback menopang harga saham.", cat: "emiten", tickers: ["MBSS"] }, "kalimat ajakan beli dibuang");

/* ---------- ringkasan pasar ---------- */
const mk = marketFrom([["MBSS", 600, 9.5, 5e9], ["GORE", 30, 30, 2e9], ["TLKM", 3000, -1, 9e11], ["ADRO", 2500, 3.1, 2e11], ["PTBA", 2700, 2.2, 1e11], ["XYZ", 100, null, 1]]);
assert.deepEqual([mk.gainers[0].code, mk.value[0].code, mk.breadth], ["MBSS", "TLKM", { up: 4, down: 1, flat: 0 }], "top gainer tanpa saham gocap; data tanpa % dilewati");
const ov = overview({ date: "2026-10-22", session: "close", ihsg: { close: 7000, chg: 50, pct: 0.72 }, sectors: [{ name: "Energi", pct: 2 }, { name: "Bank", pct: 1 }, { name: "Teknologi", pct: -1 }],
  movers: { up: [{ code: "ADRO", pts: 5 }], down: [] }, commodities: [{ label: "Batu bara", close: 130, pct: 3.4 }, { label: "Emas", close: 2400, pct: 0.3 }] }, mk);
assert.deepEqual([ov.ihsg.pct, ov.sectors.best[0].name, ov.sectors.worst[0].name, ov.commodities[0].hot, ov.commodities[0].related.map((x) => x.code), ov.commodities[1].hot], [0.72, "Energi", "Teknologi", true, ["ADRO", "PTBA"], false],
  "komoditas bergerak >= 2% disorot bersama emiten sektornya");

/* ---------- worker: kumpulkan, skor, AI, terbitkan, halaman publik ---------- */
const { default: news, collect, rescore, enrich, ensure, finQueue, notifyFin, prune, KEEP_DAYS } = await import("./worker.js");
function d1() {
  const db = new DatabaseSync(":memory:");
  const st = (sql, args = []) => ({ bind: (...a) => st(sql, a), all: async () => ({ results: db.prepare(sql).all(...args) }), first: async () => db.prepare(sql).get(...args) ?? null,
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: r.changes } }; } });
  return { db, prepare: (sql) => st(sql), batch: async (list) => { const out = []; for (const x of list) out.push(await x.all()); return out; } };
}
const recapDb = d1();
recapDb.db.exec("CREATE TABLE recaps (date TEXT, session TEXT, data TEXT, status TEXT)");
recapDb.db.prepare("INSERT INTO recaps VALUES ('2026-10-21','close',?,'published'), ('2026-10-22','s1',?,'draft')").run(JSON.stringify({ date: "2026-10-21", ihsg: { close: 1 } }), JSON.stringify({ date: "2026-10-22", session: "s1", ihsg: { close: 7012.5, chg: 40, pct: 0.57 }, commodities: [{ label: "Batu bara", pct: 2.5 }] }));
const SECRET = "s".repeat(40), HUB = "https://hub.acme.test", BASE = "https://news.acme.test";
const env = { DB: d1(), RECAP_DB: recapDb, SSO_SECRET: SECRET, HUB_URL: HUB, PROFILE: JSON.stringify({ urls: { hub: HUB }, brand: { short: "KISI", company: "PT Contoh Sekuritas" } }),
  AI: { run: async () => ({ response: JSON.stringify({ title: "MBSS Siapkan Buyback Rp200 Miliar", summary: "PT Mitrabahtera Segara Sejati Tbk (MBSS) menyiapkan buyback Rp200 miliar mulai pekan depan.", why: "Buyback dapat menopang harga saham.", cat: "emiten", tickers: ["MBSS"] }) }) } };
globalThis.caches = { default: { match: async () => null, put: async () => {} } };
const FEEDS = {
  "https://www.cnbcindonesia.com/market/rss": rss([["Mitrabahtera Segara (MBSS) Buyback Saham Rp 200 Miliar", "guid:https://www.cnbcindonesia.com/market/mbss", "MBSS buyback.", '<enclosure url="https://img.test/mbss.jpg" type="image/jpeg"/>'], ["Rekomendasi Saham Hari Ini: TLKM Layak Beli", "guid:https://www.cnbcindonesia.com/market/rek"]]),
  "https://investasi.kontan.co.id/rss": rss([["MBSS Siapkan Buyback Rp200 Miliar", "https://investasi.kontan.co.id/news/mbss"], ["BI Rate Ditahan 5,75% pada RDG Oktober", "https://investasi.kontan.co.id/news/bi"]]),
  "https://www.emitennews.com/": `<a href="https://www.emitennews.com/news/buyback-mbss-rp200-miliar-dimulai">Buyback MBSS Rp200 Miliar Dimulai Pekan Depan</a>`,
};
const realFetch = globalThis.fetch;
globalThis.fetch = async (u, o = {}) => {
  u = String(u);
  if (FEEDS[u]) return new Response(FEEDS[u], { headers: { "content-type": "text/xml" } });
  if (u.startsWith("https://scanner.tradingview.com")) return Response.json({ data: [["MBSS", 600, 6.2, 5e9], ["TLKM", 3000, -1, 9e11], ["ADRO", 2500, 2.6, 2e11]].map((d) => ({ d })) });
  if (u === "https://www.cnbcindonesia.com/market/mbss") return new Response('<meta property="og:image" content="https://img.test/og-mbss.jpg"><p>PT Mitrabahtera Segara Sejati Tbk (MBSS) mengalokasikan Rp200 miliar untuk buyback saham mulai pekan depan.</p>');
  if (u.startsWith("https://img.test/")) return new Response("PNG", { headers: { "content-type": "image/jpeg" } });
  if (u === "https://www.idxchannel.com/rss") throw new Error("timeout");
  return new Response("not found", { status: 404 });
};
const te = new TextEncoder();
async function cookie(p) {
  const body = Buffer.from(JSON.stringify({ app: "news", x: Date.now() + 3600e3, ...p })).toString("base64url");
  const key = await crypto.subtle.importKey("raw", te.encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return `hub_news=${body}.${Buffer.from(await crypto.subtle.sign("HMAC", key, te.encode(body))).toString("base64url")}`;
}
const EDIT = await cookie({ e: "sari@acme.test", n: "Sari", a: "editor" }), VIEW = await cookie({ e: "budi@acme.test", n: "Budi", a: "viewer" });
const call = async (path, ck, method = "GET", body) => {
  const r = await news.fetch(new Request(BASE + path, { method, headers: { ...(ck ? { cookie: ck } : {}), ...(body ? { "content-type": "application/json", origin: BASE } : {}) }, body: body ? JSON.stringify(body) : undefined }), env, { waitUntil() {} });
  return [r.status, r.headers.get("content-type")?.includes("json") ? await r.json() : await r.text(), r];
};

// jadwal: 3 sumber pertama (CNBC market, CNBC news, Kontan) + data pasar + skor + AI 2 teratas
await news.scheduled({ scheduledTime: Date.parse("2026-10-22T03:20:00Z") }, env);
const rows = () => env.DB.db.prepare("SELECT id, src, title, cat, theme, tickers, lead, score, sources, status, ai_state, summary, image FROM mn_items ORDER BY score DESC").all();
let R = rows();
assert.deepEqual(R.map((x) => x.title).sort(), ["BI Rate Ditahan 5,75% pada RDG Oktober", "MBSS Siapkan Buyback Rp200 Miliar", "Mitrabahtera Segara (MBSS) Buyback Saham Rp 200 Miliar"], "rekomendasi analis tidak masuk");
const mbss = R.find((x) => x.lead && x.tickers === "MBSS");
assert.ok(mbss && JSON.parse(mbss.sources).length === 1, "MBSS dari 2 media jadi satu kelompok");
await collect(env, ["emitennews", "idxchannel"]);
const st = JSON.parse(env.DB.db.prepare("SELECT v FROM mn_meta WHERE k='src'").get().v);
assert.deepEqual([st.emitennews.ok, st.emitennews.n, st.idxchannel.ok, st.idxchannel.err], [true, 1, false, "timeout"], "sumber gagal dicatat, yang lain tetap jalan");
await rescore(env);
R = rows();
const lead = R.find((x) => x.lead && x.tickers === "MBSS");
assert.equal(JSON.parse(lead.sources).length, 2, "3 media memberitakan MBSS");
// ringkasan AI untuk wakil CNBC (berskor tertinggi): gambar dari og:image artikel
const cn = R.find((x) => x.title.startsWith("Mitrabahtera"));
await enrich(env, env.DB.db.prepare("SELECT * FROM mn_items WHERE id=?").get(cn.id));
const e1 = env.DB.db.prepare("SELECT ai_state, ai_title, summary, image, cat FROM mn_items WHERE id=?").get(cn.id);
assert.deepEqual({ ...e1 }, { ai_state: "done", ai_title: "MBSS Siapkan Buyback Rp200 Miliar", summary: "PT Mitrabahtera Segara Sejati Tbk (MBSS) menyiapkan buyback Rp200 miliar mulai pekan depan.", image: "https://img.test/og-mbss.jpg", cat: "emiten" });

// halaman tim: harus login; viewer hanya lihat
let [s, j] = await call("/api/items?view=pick");
assert.equal(s, 401);
[s, j] = await call("/api/items?view=pick", VIEW);
assert.equal(s, 200);
assert.equal(j.find((x) => x.id === lead.id).px.MBSS, 6.2, "perubahan harga saham ikut ditampilkan");
assert.equal(j.filter((x) => x.tickers.includes("MBSS")).length, 1, "satu kartu per kelompok berita");
[s, j] = await call("/api/item", VIEW, "POST", { id: cn.id, action: "publish" });
assert.equal(s, 403, "viewer tidak bisa menerbitkan");
const bi = R.find((x) => x.theme === "BI-Rate");
env.DB.db.prepare("UPDATE mn_items SET summary=NULL WHERE id=?").run(bi.id); // AI tiruan meringkas semua berita dengan teks MBSS
[s, j] = await call("/api/item", EDIT, "POST", { id: bi.id, action: "publish" });
assert.equal(s, 400, "tanpa ringkasan tidak bisa terbit");
[s, j] = await call("/api/item", EDIT, "POST", { id: cn.id, action: "publish", summary: "MBSS menyiapkan buyback Rp200 miliar.", why: "Menopang harga saham." });
assert.deepEqual([s, j.link], [200, BASE + "/n/" + cn.id]);
[s, j] = await call("/api/market", EDIT);
assert.deepEqual([j.ihsg.close, j.gainers[0].code, j.commodities[0].related.map((x) => x.code)], [7012.5, "MBSS", ["ADRO"]], "ringkasan pasar: recap terbaru + TradingView");

// publik
[s, j] = await call("/p");
assert.equal(s, 200);
assert.match(j, /MBSS menyiapkan buyback Rp200 miliar\./);
assert.doesNotMatch(j, /BI Rate Ditahan/, "yang belum terbit tidak tampil");
[s, j] = await call("/n/" + cn.id);
assert.match(j, new RegExp(`<meta property="og:image" content="${BASE}/img/${cn.id}">`), "pratinjau WhatsApp menampilkan banner");
assert.match(j, /<meta property="og:description" content="MBSS menyiapkan buyback Rp200 miliar\.">/);
[s] = await call("/n/" + bi.id);
assert.equal(s, 404, "berita belum terbit tidak bisa dibuka publik");
let r;
[s, , r] = await call("/img/" + cn.id);
assert.deepEqual([s, r.headers.get("content-type")], [200, "image/jpeg"]);
// tanpa gambar & tarik dari publik
await call("/api/item", EDIT, "POST", { id: cn.id, no_img: true });
[s, j] = await call("/n/" + cn.id);
assert.doesNotMatch(j, /og:image/);
await call("/api/item", EDIT, "POST", { id: cn.id, action: "unpublish" });
[s] = await call("/n/" + cn.id);
assert.equal(s, 404);
// AI menilai bukan berita pasar -> diabaikan otomatis
env.AI = { run: async () => ({ response: '{"title":"x","summary":"","why":"","cat":"","tickers":[]}' }) };
await enrich(env, env.DB.db.prepare("SELECT * FROM mn_items WHERE id=?").get(bi.id));
assert.deepEqual({ ...env.DB.db.prepare("SELECT status, ai_state FROM mn_items WHERE id=?").get(bi.id) }, { status: "abaikan", ai_state: "bukan" });

/* ---------- laporan keuangan emiten ---------- */
const codes2 = new Set(["PTPP", "UNVR", "ADRO"]);
assert.equal(parseFin('{"is_report":false,"code":"PTPP","period":"Q3-2026","revenue":1}', codes2), null, "proyeksi / bukan laporan");
assert.equal(parseFin('{"is_report":true,"code":"ABCD","period":"Q3-2026","revenue":1}', codes2), null, "kode tidak terdaftar");
assert.equal(parseFin('{"is_report":true,"code":"PTPP","period":"kuartal ketiga","revenue":1}', codes2), null, "periode tidak dikenali");
assert.equal(parseFin('{"is_report":true,"code":"PTPP","period":"Q3-2026"}', codes2), null, "tanpa angka");
const usd = parseFin('{"is_report":true,"code":"ADRO","period":"9m 2026","currency":"USD","revenue":4200,"revenue_prev":5000,"net_profit":-50,"net_profit_prev":100}', codes2);
assert.deepEqual([usd.period, usd.revenue_yoy, usd.net_profit_yoy, finMoney(usd.revenue, "USD"), finMoney(usd.net_profit, "USD")], ["9M-2026", -16, -150, "US$4,2 M", "−US$50 jt"], "YoY dihitung dari angka tahun lalu; rugi negatif");
// antrean: berita kinerja dari 2 media -> 1 baris, AI sekali
const FIN_AI = { is_report: true, code: "PTPP", company: "PP (Persero)", period: "9M-2026", currency: "IDR", revenue: 12500, revenue_prev: 13900, net_profit: 210.5, net_profit_prev: 180, note: "Ditopang efisiensi beban usaha." };
let finCalls = 0, tg = [];
env.AI = { run: async (_m, q) => { if (/laporan keuangan emiten/.test(q.messages[0].content)) { finCalls++; return { response: JSON.stringify(FIN_AI) }; } return { response: JSON.stringify({ title: "x", summary: "Ringkasan.", why: "", cat: "emiten", tickers: [] }) }; } };
FEEDS["https://investasi.kontan.co.id/rss"] = rss([["Laba PT PP (PTPP) Naik 16,9% per Kuartal III 2026", "https://investasi.kontan.co.id/news/ptpp-laba"], ["Rekomendasi Saham PTPP Hari Ini", "https://investasi.kontan.co.id/news/rek-ptpp"]]);
FEEDS["https://www.cnbcindonesia.com/market/rss"] = rss([["PTPP Cetak Laba Rp210 Miliar hingga Kuartal III", "guid:https://www.cnbcindonesia.com/market/ptpp"]]);
const realF2 = globalThis.fetch;
globalThis.fetch = async (u, o) => { if (String(u).startsWith("https://api.telegram.org/")) { tg.push(JSON.parse(o.body)); return Response.json({ ok: true }); } return realF2(u, o); };
env.DB.db.prepare("UPDATE mn_meta SET v=json_set(v, '$.codes', ?) WHERE k='mkt'").run("MBSS,TLKM,ADRO,PTPP"); // daftar kode BEI (di produksi: semua kode dari TradingView)
await collect(env, ["kontan", "cnbc-market"]);
assert.deepEqual(env.DB.db.prepare("SELECT title FROM mn_items WHERE fin_state='pending' ORDER BY title").all().map((x) => x.title), ["Laba PT PP (PTPP) Naik 16,9% per Kuartal III 2026", "PTPP Cetak Laba Rp210 Miliar hingga Kuartal III"]);
await finQueue(env, 3);
const fr = env.DB.db.prepare("SELECT * FROM mn_fin").all();
assert.deepEqual([fr.length, fr[0].code, fr[0].period, fr[0].net_profit_yoy, JSON.parse(fr[0].sources).length, finCalls], [1, "PTPP", "9M-2026", 16.94, 2, 1], "berita kedua jadi sumber tambahan tanpa AI");
// notifikasi: tanpa saluran -> ditandai terkirim tanpa mengirim; dengan Telegram -> satu pesan berisi angka
await notifyFin(env);
assert.deepEqual([tg.length, env.DB.db.prepare("SELECT notified FROM mn_fin").get().notified], [0, 1]);
env.DB.db.exec("UPDATE mn_fin SET notified=0"); env.TELEGRAM_BOT_TOKEN = "123:abc"; env.TELEGRAM_CHAT_ID = "-100";
await notifyFin(env);
assert.equal(tg.length, 1);
assert.match(tg[0].text, /<b>PTPP · PP \(Persero\) — 9M-2026<\/b>\nPendapatan Rp12,5 T \(−10,07% YoY\)\nLaba bersih Rp210,5 M \(\+16,94% YoY\)/);
await notifyFin(env);
assert.equal(tg.length, 1, "tidak dikirim ulang");
delete env.TELEGRAM_BOT_TOKEN; delete env.TELEGRAM_CHAT_ID;
[s, j] = await call("/api/fin", VIEW);
assert.deepEqual([s, j.rows[0].code, j.rows[0].sources.length, j.notify.telegram], [200, "PTPP", 2, false]);
// kartu "Hari ini" di beranda Tool Hub
let hr = await news.fetch(new Request(BASE + "/__hub/today"), env, { waitUntil() {} });
assert.equal(hr.status, 403);
hr = await news.fetch(new Request(BASE + "/__hub/today", { headers: { "x-hub-key": SECRET } }), env, { waitUntil() {} });
assert.deepEqual((await hr.json()).fin.map((x) => x.code), ["PTPP"]);
globalThis.fetch = realFetch;

// skrip halaman harus bisa di-parse
const page = fs.readFileSync(new URL("./page.html", import.meta.url), "utf8");
for (const [, sc2] of page.matchAll(/<script>([\s\S]*?)<\/script>/g)) new Function(sc2);
assert.equal(idOf("https://a.test/x"), idOf("https://a.test/x"));
// ---- banner KISI: tema, prompt aman, latar AI tersimpan & bisa diambil publik ----
{
  const { BG_MODEL, BG_THEMES, bgTheme, bgPrompt, imageB64 } = await import("./banner.js");
  assert.equal(bgTheme({ theme: "BI-Rate", cat: "makro" }), "BI-Rate");
  assert.equal(bgTheme({ theme: "Tema Aneh", cat: "emiten" }), "emiten");
  assert.equal(bgTheme({}), "umum");
  for (const k of Object.keys(BG_THEMES)) assert.match(bgPrompt(k), /no text.*no people/i, "prompt " + k + " wajib melarang teks & orang");
  assert.match(bgPrompt("Emas", "gold bars on velvet"), /Subject: gold bars on velvet\./);
  assert.equal(await imageB64({ image: "QUJD" }), "QUJD");
  assert.equal(await imageB64(new Uint8Array([65, 66, 67])), "QUJD");
  const { makeBg } = await import("./worker.js");
  const calls = [];
  const env2 = { ...env, AI: { run: async (m, inp) => { calls.push([m, inp]); return m === BG_MODEL ? { image: "/9j/AAAA" } : { response: "a calm vault with neat gold bars" }; } } };
  await ensure(env2);
  const t = await makeBg(env2, { theme: "Emas", who: "Uji" });
  assert.equal(t.status, "usul"); assert.equal(t.item_id, null);
  assert.ok(!("seed" in calls.at(-1)[1]), "flux-1-schnell menolak parameter seed");
  await env2.DB.prepare("INSERT INTO mn_items (id, url, title, cat, theme, summary) VALUES ('n1','https://a.test/n1','BI Tahan Bunga','makro','BI-Rate','BI menahan suku bunga.')").run();
  const it = await env2.DB.prepare("SELECT * FROM mn_items WHERE id='n1'").first();
  const a = await makeBg(env2, { item: it, who: "Uji" }), b = await makeBg(env2, { item: it, who: "Uji" });
  assert.equal(b.status, "ok"); assert.equal(b.theme, "BI-Rate");
  assert.equal((await env2.DB.prepare("SELECT COUNT(*) n FROM mn_bg WHERE item_id='n1'").first()).n, 1, "latar khusus berita diganti, bukan ditumpuk");
  assert.ok(a.id !== b.id);
  const r = await news.fetch(new Request("https://mn.test/bg/" + b.id), env2, { waitUntil() {} });
  assert.equal(r.status, 200); assert.equal(r.headers.get("content-type"), "image/jpeg");
  assert.equal((await news.fetch(new Request("https://mn.test/bg/tidakada"), env2, { waitUntil() {} })).status, 404);

  /* ---------- berita lama dihapus (maks. KEEP_DAYS hari), latar khususnya ikut; latar per tema tetap ---------- */
  const ago = (d) => new Date(Date.now() - d * 864e5).toISOString();
  await env2.DB.prepare("UPDATE mn_items SET seen_at=?, status='terbit' WHERE id='n1'").bind(ago(KEEP_DAYS + 1)).run();
  await env2.DB.prepare("INSERT INTO mn_items (id, url, title, seen_at) VALUES ('n2','https://a.test/n2','Masih baru',?)").bind(ago(KEEP_DAYS - 1)).run();
  const before = (await env2.DB.prepare("SELECT COUNT(*) n FROM mn_items").first()).n;
  assert.equal(await prune(env2), 1);
  assert.equal((await env2.DB.prepare("SELECT COUNT(*) n FROM mn_items").first()).n, before - 1);
  assert.equal(await env2.DB.prepare("SELECT id FROM mn_items WHERE id='n1'").first(), null, "berita > 7 hari dihapus, termasuk yang sudah terbit");
  assert.ok(await env2.DB.prepare("SELECT id FROM mn_items WHERE id='n2'").first(), "berita < 7 hari tetap");
  assert.equal((await env2.DB.prepare("SELECT COUNT(*) n FROM mn_bg WHERE item_id='n1'").first()).n, 0, "latar khusus berita yang dihapus ikut dihapus");
  assert.ok(await env2.DB.prepare("SELECT id FROM mn_bg WHERE id=?").bind(t.id).first(), "latar per tema tidak ikut dihapus");
  assert.equal(await prune(env2), 0);
}
console.log("semua cek lolos");
