// Isi BRD (formulir F-IT-BRD-0624-00) sebagai data per bagian. Kerangka tetap disalin dari contoh
// docs/superpowers/specs/assets/BRD_Pengembangan_Reksa_Dana_iKISI_v1_2_ID.docx; AI hanya mengisi bagian yang boleh ditulisnya.
// Kolom manusia (No. Dokumen, tanggal, nama, durasi & target jadwal, tanda tangan) tidak pernah diisi: tetap "___".

/** Urutan bagian = urutan kotak judul di template. */
export const BRD_KEYS = ["ringkasan", "tujuan", "ruang_lingkup", "kebutuhan", "definisi", "keamanan", "pemangku", "kendala", "tambahan", "jadwal", "open_items", "lampiran"];
/** Bagian yang boleh ditulis AI (sisanya kerangka tetap). */
export const BRD_AI_KEYS = ["ringkasan", "tujuan", "ruang_lingkup", "kebutuhan", "definisi", "keamanan", "kendala", "tambahan", "open_items"];
export const BRD_VERSION = "1.0 – Draft untuk direview";
const NO_DOKUMEN = "IT-BRD-2026-___ (akan ditetapkan)", DISUSUN = "Product / Business Analyst – Divisi Digital Business";

const KEAMANAN = [
  "Seluruh lalu lintas data antara aplikasi mobile, back-end iKISI, dan sistem pihak ketiga harus menggunakan TLS 1.2 atau lebih tinggi; tidak ada data produk maupun nasabah yang dikirim tanpa enkripsi.",
  "Data milik nasabah hanya boleh dikembalikan untuk rekening nasabah yang terautentikasi, dan divalidasi di sisi server (bukan penyaringan di sisi klien).",
  "Transaksi dan perubahan pengaturan yang berdampak pada dana nasabah harus mewajibkan autentikasi ulang menggunakan PIN atau biometrik, dengan batas waktu sesi serta kebijakan jumlah percobaan / pemblokiran yang ditetapkan.",
  "Seluruh peristiwa transaksi dan perubahan data harus dicatat pada audit trail yang tidak dapat diubah (siapa, apa, kapan, dari perangkat/IP mana), disimpan sesuai kebijakan retensi internal dan ketentuan OJK.",
  "Pengelolaan data pribadi harus memenuhi ketentuan pelindungan data pribadi (UU PDP); tidak ada data identitas nasabah yang dikirim ke pihak ketiga tanpa dasar hukum.",
  "Kredensial atau API key untuk antarmuka pihak ketiga harus disimpan pada secrets store yang disetujui; tidak boleh ditulis langsung dalam kode.",
  "Solusi harus lulus security review internal / penetration test sebelum rilis produksi.",
];
const MODUL_DATA = { modul: "Kebutuhan Data dan Integrasi", tetap: true, rows: [
  { pri: "H", text: "Data induk produk, harga/NAB, dan kepemilikan nasabah tetap bersumber dari sistem inti yang berlaku sebagai satu-satunya sumber kebenaran." },
  { pri: "H", text: "Setiap angka yang ditampilkan kepada nasabah harus disertai tanggal data (\"as of\"); apabila data tidak tersedia atau kedaluwarsa, tampilkan penanda yang ditetapkan, bukan nilai lama tanpa keterangan." },
] };
const MODUL_NFR = { modul: "Kebutuhan Non-Fungsional", tetap: true, rows: [
  { pri: "H", text: "Layar baru harus dimuat dalam waktu maksimum 3 detik pada koneksi 4G untuk persentil ke-95 permintaan." },
  { pri: "H", text: "Solusi harus mendukung versi minimum OS iOS dan Android yang berlaku pada iKISI serta ukuran perangkat yang didukung tanpa kerusakan tata letak." },
  { pri: "H", text: "Seluruh layar harus mendefinisikan status loading, kosong, error, dan offline." },
  { pri: "H", text: "Seluruh label baru dan pesan error harus tersedia dalam Bahasa Indonesia dan Bahasa Inggris serta mengikuti pengaturan bahasa aplikasi." },
  { pri: "M", text: "Seluruh layar dan peristiwa baru harus diinstrumentasi untuk analitik (tampilan layar, aksi utama, titik drop-off)." },
  { pri: "M", text: "Aksesibilitas: area sentuh minimum 44 px, rasio kontras teks minimum 4,5:1, dan elemen grafis juga disampaikan dalam bentuk teks untuk pembaca layar." },
] };
const PEMANGKU = [
  ["Project Manager", "Pengelolaan penyelesaian proyek, jadwal, ruang lingkup, dan risiko"],
  ["Head of Department", "Persetujuan, penyediaan sumber daya, dan eskalasi"],
  ["Business Owner", "Aturan bisnis dan ukuran keberhasilan"],
  ["Product / UI-UX Designer", "Desain Figma, konsistensi design system, prototipe"],
  ["IT Development (Mobile & Back-end)", "Implementasi, integrasi, dan deployment"],
  ["IT Security", "Security review dan penetration test"],
  ["Compliance & Legal", "Pengungkapan sesuai OJK dan redaksi disclaimer"],
  ["Risk Management", "Aturan profil risiko / kesesuaian produk"],
  ["Operations", "Proses operasional, penyelesaian transaksi, rekonsiliasi"],
  ["QA / Koordinator UAT", "Skenario pengujian dan sign-off UAT"],
].map(([jabatan, tugas]) => ({ jabatan, tugas }));
const KENDALA = [
  ["Regulasi", "Seluruh angka, klaim, dan proyeksi yang ditampilkan kepada nasabah tunduk pada ketentuan OJK terkait pemasaran dan pengungkapan, serta memerlukan persetujuan Compliance sebelum go-live."],
  ["Platform yang berjalan", "Solusi harus berjalan dalam arsitektur iKISI, design system, dan sistem inti yang berlaku."],
  ["Kelengkapan desain", "Status error, kosong, loading, dan kasus khusus harus disiapkan sebelum pengembangan dimulai."],
  ["Sumber daya dan jadwal", "Penyelesaian bergantung pada kapasitas squad mobile bersama dan kalender rilis iKISI."],
].map(([kendala, deskripsi]) => ({ kendala, deskripsi }));
const TAMBAHAN = [
  ["Status error, kosong, loading, dan offline", "Setiap layar baru perlu status selain alur normal (happy path), termasuk jaringan terputus dan data tidak tersedia."],
  ["Disclaimer regulasi", "Setiap layar yang menampilkan kinerja, proyeksi, atau rekomendasi memerlukan teks disclaimer yang disetujui beserta penempatannya."],
  ["Notifikasi", "Kanal dan template pesan untuk setiap peristiwa penting pada fitur ini."],
  ["Analitik dan pelaporan", "Taksonomi peristiwa dan dashboard yang akan digunakan Business untuk memantau ukuran keberhasilan."],
  ["Migrasi dan peluncuran", "Apakah fitur dirilis ke seluruh nasabah sekaligus atau bertahap / A/B test, beserta rencana mundurnya."],
  ["Skenario UAT dan kriteria penerimaan", "Setiap kebutuhan sebaiknya dilengkapi kriteria penerimaan dan skrip UAT sebelum sign-off pengembangan."],
].map(([butir, alasan]) => ({ butir, alasan }));
const JADWAL = ["Review BRD, penutupan open items, sign-off", "Penyelesaian desain (status layar, disclaimer, teks) & design freeze", "Desain teknis & spesifikasi integrasi",
  "Pengembangan – tahap 1", "Pengembangan – tahap 2", "SIT & security review / penetration test", "UAT dan persetujuan Compliance", "Rilis produksi & pemantauan pasca rilis"]
  .map((aktivitas, i) => ({ fase: String(i + 1), aktivitas }));

const str = (v, max = 2000) => (typeof v === "string" || typeof v === "number" ? String(v) : "").replace(/\s+/g, " ").trim().slice(0, max);
const list = (v, n = 30) => (Array.isArray(v) ? v.map((x) => str(x)).filter(Boolean).slice(0, n) : null);
const rows = (v, keys, n = 40) => (Array.isArray(v) ? v.map((x) => Object.fromEntries(keys.map((k) => [k, str(x && x[k], 1200)]))).filter((x) => x[keys[0]]).slice(0, n) : null);
const PRI = ["H", "M", "L"];
/** Nomori ulang semua modul: BR-<urutan modul>.<urutan baris>. */
const number = (mods) => mods.map((m, i) => ({ ...m, rows: m.rows.map((r, k) => ({ id: `BR-${i + 1}.${k + 1}`, pri: r.pri, text: r.text })) }));
const kompetitorKalimat = (ev) => {
  const names = [...new Set(ev.map((e) => e.competitor).filter(Boolean))];
  return names.length ? `Fitur serupa sudah tersedia di aplikasi ${names.join(" dan ")}; rincian referensi kompetitor tercantum pada Lampiran E.` : "Rincian referensi kompetitor tercantum pada Lampiran E.";
};

/** Kerangka BRD dari fitur & bukti terverifikasi. evidence: [{ feature_id, competitor, launched_at, url }]. */
export function brdSkeleton({ title, features = [], evidence = [], version = BRD_VERSION }) {
  const fname = Object.fromEntries(features.map((f) => [f.id, f.name]));
  const ref = evidence.map((e) => `${e.competitor} – ${fname[e.feature_id] || "fitur"} (diluncurkan ${e.launched_at || "___"}${e.url ? ", " + e.url : ""})`).join("; ");
  const names = features.map((f) => f.name).join(", ");
  return {
    identitas: { nama_proyek: str(title, 200), no_dokumen: NO_DOKUMEN, versi: str(version, 80) || BRD_VERSION, tanggal: "___", disusun_oleh: DISUSUN, referensi: "Lampiran E – Referensi Kompetitor" },
    ringkasan: [`Proyek ini menghadirkan ${names || "fitur baru"} pada aplikasi iKISI.`, kompetitorKalimat(evidence)],
    tujuan: features.map((f) => `Menghadirkan ${f.name} pada aplikasi iKISI${f.description ? ": " + str(f.description, 300) : "."}`),
    ruang_lingkup: features.map((f) => `${f.name} (${f.area || "Lainnya"})`),
    kebutuhan: number([MODUL_DATA, MODUL_NFR]),
    definisi: [],
    keamanan: [...KEAMANAN],
    pemangku: PEMANGKU.map((x) => ({ ...x })),
    kendala: KENDALA.map((x) => ({ ...x })),
    tambahan: TAMBAHAN.map((x) => ({ ...x })),
    jadwal: JADWAL.map((x) => ({ ...x })),
    open_items: ["Apakah ruang lingkup fase ini sudah disetujui Business Owner?", "Kapan target tanggal rilis dan rilis iKISI mana yang akan memuat perubahan ini?", "Apakah redaksi disclaimer dan teks UI baru sudah disetujui Compliance?"],
    lampiran: ["Lampiran A – Desain layar Figma (akan dilampirkan).", "Lampiran B – Diagram alur layar (akan dilampirkan).", "Lampiran C – Spesifikasi integrasi (akan dilampirkan).",
      "Lampiran D – Daftar skenario UAT (akan dilampirkan).", "Lampiran E – Referensi Kompetitor: " + (ref || "–")],
  };
}

/** Gabungkan jawaban AI (atau suntingan tim) ke kerangka: kunci asing dibuang, kolom manusia & bagian tetap diambil dari kerangka. */
export function brdParse(raw, base) {
  let j = raw;
  if (typeof raw === "string") {
    const a = raw.indexOf("{"), b = raw.lastIndexOf("}");
    try { j = a >= 0 && b > a ? JSON.parse(raw.slice(a, b + 1)) : null; } catch { j = null; }
  }
  if (!j || typeof j !== "object") return base;
  const out = structuredClone(base), id = j.identitas || {};
  for (const k of ["nama_proyek", "referensi"]) if (str(id[k])) out.identitas[k] = str(id[k], 200);
  const lastRingkasan = base.ringkasan.at(-1), r = list(j.ringkasan, 8);
  if (r && r.length) out.ringkasan = [...r.filter((x) => x !== lastRingkasan), lastRingkasan];
  for (const k of ["tujuan", "ruang_lingkup", "keamanan", "open_items"]) { const v = list(j[k]); if (v && v.length) out[k] = v; }
  const fixed = base.kebutuhan.filter((m) => m.tetap);
  if (Array.isArray(j.kebutuhan)) {
    const mods = j.kebutuhan.filter((m) => m && !m.tetap).map((m) => ({ modul: str(m.modul, 200), rows: (Array.isArray(m.rows) ? m.rows : []).map((x) => ({ pri: PRI.includes(str(x && x.pri)) ? str(x.pri) : "M", text: str(x && x.text) })).filter((x) => x.text) }))
      .filter((m) => m.modul && m.rows.length).slice(0, 12);
    out.kebutuhan = number([...mods, ...fixed]);
  }
  const d = rows(j.definisi, ["istilah", "id", "en"]); if (d) out.definisi = d;
  const kd = rows(j.kendala, ["kendala", "deskripsi"]); if (kd && kd.length) out.kendala = kd;
  const t = rows(j.tambahan, ["butir", "alasan"]); if (t && t.length) out.tambahan = t;
  return out;
}
