// Cara menulis yang menarik: hook, manfaat, spesifik, satu CTA, tanpa klise. Dipakai Copy Studio, Edukasi Studio, Content Insight.
// Aturan kepatuhan tiap tool ditulis sesudahnya dan lebih diutamakan.
/** Pola hook (kalimat pembuka yang menghentikan scroll) dengan contoh yang patuh aturan. */
export const HOOKS = [
  ["pertanyaan langsung", "Masih nyimpen semua uang di tabungan?"],
  ["angka spesifik", "Rp10 ribu sudah cukup untuk mulai reksa dana."],
  ["mitos vs fakta", "Katanya investasi harus modal besar. Faktanya?"],
  ["kesalahan umum", "3 kesalahan pemula saat pertama beli saham."],
  ["kalau kamu…", "Kalau kamu baru gajian, baca ini dulu."],
  ["sebelum–sesudah", "Dulu bingung mulai dari mana. Sekarang tiap bulan rutin investasi."],
  ["rasa ingin tahu", "Ini alasan banyak pemula mulai dari reksa dana pasar uang."],
  ["cerita mini", "Rina mulai investasi Rp50 ribu per minggu. Ini yang dia pelajari."],
  ["langkah/daftar", "Cara mulai investasi dalam 3 langkah."],
  ["perbandingan", "Deposito vs reksa dana pasar uang: mana yang cocok untuk dana darurat?"],
];
/** Cara menulis copy yang menjual; aturan kepatuhan (RULES_PROMPT) tetap di atasnya. */
export const CRAFT = [
  "Cara menulis copy yang menjual:",
  "- Kalimat pertama adalah hook: buat orang berhenti scroll dalam 1–2 detik. Pola yang bisa dipakai: " + HOOKS.map(([n, e]) => `${n} ("${e}")`).join("; ") + ".",
  "- Manfaat dulu, fitur kemudian: tulis apa yang pembaca dapat atau rasakan, bukan hanya nama fitur.",
  "- Spesifik mengalahkan umum: angka, waktu, langkah, dan situasi nyata pembaca (gajian, dana darurat, THR, biaya sekolah, liburan).",
  "- Satu pesan utama per teks. Kalimat pendek, kata kerja aktif, ritme bervariasi; kalimat satu-dua kata boleh untuk penekanan.",
  "- Bicara ke satu orang dengan bahasa sehari-hari yang natural, bukan bahasa brosur atau siaran pers.",
  "- Satu CTA yang jelas, diawali kata kerja: Mulai, Cek, Pelajari, Simpan, Bagikan, Buka aplikasi.",
  "- Hindari klise dan gaya tulisan AI: \"di era digital\", \"tidak hanya … tetapi juga\", \"mari kita\", \"yuk simak\", \"kesempatan emas\", \"solusi terbaik\", \"wujudkan impianmu\", \"tunggu apa lagi\", \"jangan sampai ketinggalan\", tanda seru beruntun.",
  "- Urgensi hanya bila nyata (tanggal penawaran, kuota resmi); jangan membuat FOMO palsu.",
  "- Emoji secukupnya dan bermakna (maks. 3), tidak menggantikan kata penting.",
  "- Sebelum menjawab, baca ulang tiap teks: ganti kata generik dengan yang konkret dan buang kata yang tidak menambah makna.",
].join("\n");
