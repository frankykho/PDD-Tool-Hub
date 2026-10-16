/** Tooltip texts ("cara baca") — kept in one place so they stay consistent. */
export const HELP = {
  // ---- track record
  periode: <>Hanya posisi yang <b>dibuka</b> dalam rentang waktu ini.</>,
  indeks: (
    <>
      Hanya saham anggota indeks. Memakai daftar anggota <b>saat ini</b>, jadi hasil tahun-tahun lalu sedikit bias ke saham yang
      kini masih bertahan di indeks.
    </>
  ),
  transaksiMin: (
    <>
      Rata-rata nilai transaksi harian 20 hari <b>saat posisi dibuka</b>. Menyaring saham yang sulit dibeli/dijual di harga
      sinyal. ≥ Rp 5–20 M/hari umumnya cukup likuid untuk ritel.
    </>
  ),
  hargaMin: <>Harga saat masuk. Saham di bawah Rp 200 bergerak besar per fraksi harga dan lebih rawan ARA/ARB.</>,
  scoreMin: <>Hanya sinyal dengan score minimal ini. Cek tabel "Berdasarkan score" dulu: filter ini hanya berguna kalau score tinggi memang hasilnya lebih baik.</>,
  jumlahTrade: (
    <>
      Jumlah posisi BUY yang sudah selesai. Makin banyak makin bisa dipercaya; di bawah ±30 trade hasilnya mudah kebetulan.
    </>
  ),
  winRate: (
    <>
      Persentase posisi dengan return bersih &gt; 0. Sistem trend-following wajar punya win rate <b>30–40%</b>: banyak rugi kecil,
      sedikit untung besar. Win rate rendah belum tentu buruk, lihat juga rata-rata dan median.
    </>
  ),
  rataReturn: (
    <>
      Rata-rata return bersih per posisi (sudah dipotong biaya ±0,4%). <b>Positif</b> = secara keseluruhan untung. Angka kecil di
      bawahnya: rata-rata posisi yang untung dan yang rugi.
    </>
  ),
  median: (
    <>
      Return posisi "yang di tengah": separuh posisi hasilnya lebih buruk dari angka ini. Jika rata-rata positif tapi median
      negatif, hasil ditopang <b>segelintir trade yang untung besar</b>. "Tanpa 1% trade terbaik" menguji apakah sistem masih
      untung tanpa outlier itu.
    </>
  ),
  tp1: (
    <>
      Persentase posisi yang <b>sempat</b> menyentuh TP1 (1R) sebelum ditutup. Belum tentu untung: tanpa ambil untung sebagian,
      harga bisa turun lagi sebelum sinyal SELL.
    </>
  ),
  histogram: <>Tiap batang = persentase posisi dengan return bersih di rentang itu. Merah = rugi, hijau = untung.</>,
  caraTutup: (
    <>
      Kejadian pertama yang menutup posisi: <b>sinyal SELL</b> (keluar di harga penutupan), <b>kena SL</b>, <b>kena TP3</b>,
      atau <b>timeout</b> 100 hari bursa.
    </>
  ),
  perScore: <>Hasil dikelompokkan menurut score sinyal saat BUY. Jika score tinggi tidak memberi hasil lebih baik, score jangan dipakai sebagai filter.</>,
  perTahun: <>Menurut tahun posisi dibuka. Hasil sistem trend-following sangat bergantung pada kondisi pasar (tren vs. sideways).</>,
  perSaham: <>Hanya saham dengan minimal 5 trade. Sampel per saham kecil, jadi peringkat mudah berubah; jangan dijadikan satu-satunya dasar.</>,
  colTrade: <>Jumlah posisi selesai.</>,
  colUntung: <>Rata-rata return posisi yang untung.</>,
  colRugi: <>Rata-rata return posisi yang rugi.</>,
  colSl: <>Persentase posisi yang ditutup karena menyentuh Stop Loss.</>,
  colLama: <>Rata-rata lama posisi dipegang, dalam hari bursa.</>,

  // ---- dashboard
  kpiBuy: <>Saham yang sinyal BUY-nya <b>terkonfirmasi</b> di hari bursa terakhir (candle sudah tutup). Klik untuk menampilkannya.</>,
  kpiSell: <>Saham yang sinyal SELL-nya terkonfirmasi di hari bursa terakhir. Di BEI dibaca sebagai sinyal keluar.</>,
  kpiActive: <>Saham yang sinyal terakhirnya BUY dan posisinya belum ditutup (belum kena SL, TP3, atau timeout).</>,
  kpiEvents: <>Jumlah posisi BUY yang menyentuh TP1/TP2/TP3 atau Stop Loss di hari bursa terakhir (berdasarkan high/low hari itu).</>,
  filterUmur: <>Umur = jumlah hari bursa sejak sinyal. "Hari ini (baru)" = sinyal yang muncul di hari bursa terakhir.</>,
  filterRisk: (
    <>
      Menyembunyikan sinyal dengan penanda ⚠: nilai transaksi rata-rata &lt; Rp 1 M/hari (tidak likuid), jarak Stop Loss &gt; 15%,
      atau harga &lt; Rp 50.
    </>
  ),
  filterIndeks: <>Hanya saham anggota indeks yang dipilih. Pilihan ini tersimpan di browser.</>,
  colUmur: <>Hari bursa sejak sinyal muncul (0 = hari ini) dan tanggal sinyalnya.</>,
  colHarga: <>Harga penutupan terakhir dan perubahannya dibanding hari sebelumnya.</>,
  colEntry: <>Harga penutupan pada hari sinyal. Untuk SELL = harga keluar.</>,
  colSlLevel: (
    <>
      Pivot low terakhir dikurangi 2×ATR (minimal 2×ATR di bawah entry). Persentase = jarak dari entry. Jarak &gt; 15% diberi
      penanda ⚠.
    </>
  ),
  colTp: <>Target = entry + 1R / 2R / 3R, dengan R = entry − Stop Loss. Persentase = jarak dari entry.</>,
  colPosisi: (
    <>
      Posisi harga terakhir di antara Stop Loss (kiri) dan TP3 (kanan). Garis tebal = entry, garis tipis = TP1 dan TP2. Zona
      merah = di bawah entry.
    </>
  ),
  colScore: (
    <>
      Nilai 0–102 versi SATS (momentum, efisiensi, volume, RSI, struktur, tembusan band). Menurut Track Record <b>tidak terbukti</b>{" "}
      memprediksi hasil, jadi cukup sebagai info.
    </>
  ),
  colStatus: (
    <>
      Menuju TP1 = posisi berjalan · TP1/TP2 ✓ = level sudah tersentuh · Kena SL / TP3 ✓ selesai = posisi ditutup · Sinyal
      keluar = sinyal terakhir SELL.
    </>
  ),

  kpiOut: <>Saham yang sinyal terakhirnya SELL/EXIT, artinya strategi sedang tidak memegang posisi di saham itu.</>,
  colSinceEntry: <>Perubahan harga terakhir dibanding harga entry posisi yang masih berjalan (belum termasuk biaya).</>,
  stopNow: {
    TURTLE: (
      <>
        Level keluar untuk besok: yang lebih tinggi antara stop awal (entry − 2×ATR20) dan harga terendah 10 hari. Posisi ditutup
        jika harga menyentuh stop awal, atau <b>menutup</b> di bawah harga terendah 10 hari sebelumnya.
      </>
    ),
    UTBOT: (
      <>
        Trailing stop UT Bot (1×ATR10). Sinyal SELL muncul saat harga <b>menutup</b> di bawah garis ini. Persentase = jarak dari harga
        terakhir.
      </>
    ),
    FOLLOW: (
      <>
        "SL Reference" dari script (Follow Line − 0,5×ATR7). Hanya referensi: script tidak menutup posisi di level ini, posisi ditutup
        oleh sinyal EXIT.
      </>
    ),
    FOLLOW10: (
      <>
        Stop V10 = Follow Line − 0,5×ATR7, hanya boleh naik. Posisi ditutup jika harga <b>menutup</b> di bawahnya (juga saat tutup di
        bawah Follow Line dengan filter EMA50/MACD, atau tren berbalik turun).
      </>
    ),
  },

  // ---- strategies / track record comparison
  strategy: <>Semua halaman (dashboard, detail, track record) mengikuti strategi yang dipilih. Pilihan tersimpan di browser.</>,
  period: (
    <>
      <b>3 tahun</b>: semua data. <b>12 bulan terakhir</b>: data uji. <b>Sebelum 12 bulan terakhir</b>: data pembentukan. Strategi yang
      bagus di data pembentukan tapi buruk di data uji kemungkinan hanya cocok dengan masa lalu.
    </>
  ),
  profitFactor: (
    <>
      Total untung dibagi total rugi (bersih). <b>&gt; 1</b> = untung secara keseluruhan; di bawah 1,2 biasanya terlalu tipis untuk
      diandalkan setelah biaya dan slippage.
    </>
  ),
  compare: (
    <>
      Semua strategi dengan filter yang sama. Nilai median dan "tanpa 1% terbaik" lebih jujur daripada rata-rata, karena tidak
      ditarik segelintir trade yang terbang.
    </>
  ),
  otherStrategies: <>Sinyal terakhir saham ini di setiap strategi. Klik untuk berpindah strategi.</>,

  filterBadge: (
    <>
      Apakah sinyal BUY ini lolos filter <b>SATS + filter</b> pada hari sinyal: harga saham &gt; MA200 <b>dan</b> IHSG &gt; MA200.
      Menurut Track Record, hanya BUY yang lolos filter yang untung secara meyakinkan; sisanya cenderung impas.
    </>
  ),
  market: (
    <>
      Filter pasar SATS + filter. Saat IHSG di bawah MA200, <b>tidak ada</b> BUY baru di strategi SATS + filter: pasar sedang lemah dan
      sinyal BUY historisnya lebih sering gagal.
    </>
  ),

  exitMode: (
    <>
      <b>Utuh</b>: seluruh posisi dijual sekaligus saat keluar (SL, TP3, sinyal SELL, atau timeout).{" "}
      <b>Bertahap</b>: 1/3 dijual di TP1, 1/3 di TP2, 1/3 di TP3 bila tersentuh; sisanya dijual saat keluar, seperti
      perhitungan Performance di script SATS. Bertahap mengamankan untung saat harga melonjak lalu jatuh lagi, tapi memotong
      untung dari tren yang terus naik.
    </>
  ),

  bullPattern: (
    <>
      Hanya saham yang punya pola candle bullish ≤ 2 hari terakhir (mis. hammer, bullish engulfing, morning star) atau pola chart
      bullish (double bottom, ascending triangle, bull flag). Pola ditampilkan di bawah nama saham; arahkan kursor untuk penjelasan.
    </>
  ),

  fundOk: (
    <>
      Hanya saham yang <b>untung</b> (laba 12 bulan positif), ekuitas positif, DER ≤ 2 (bank dikecualikan), dan laporan keuangan tidak
      lebih dari 9 bulan. Data fundamental dari Yahoo Finance, diperbarui seminggu sekali.
    </>
  ),

  // ---- detail
  levelSats: <>Level dari sinyal BUY terakhir yang masih berlaku. Persentase = jarak dari entry.</>,
  ladder: (
    <>
      Urutan level dari TP3 sampai Stop Loss, dengan posisi harga terakhir di tengahnya. "Tercapai" = level sudah tersentuh sejak
      sinyal BUY.
    </>
  ),
  calc: (
    <>
      Menghitung jumlah lot supaya rugi saat kena Stop Loss tidak melebihi risiko yang dipilih (modal × risiko %), termasuk fee.
      Dibatasi juga oleh modal. Catatan: menurut Track Record, posisi lebih sering ditutup oleh sinyal SELL daripada SL.
    </>
  ),
  stockTrack: <>Ringkasan semua posisi BUY SATS yang sudah selesai di saham ini (5 tahun). Sampel per saham kecil, baca dengan hati-hati.</>,
  likuiditas: <>Rata-rata nilai transaksi harian 20 hari terakhir (harga × volume). Di bawah Rp 1 M/hari diberi penanda tidak likuid.</>,
};
