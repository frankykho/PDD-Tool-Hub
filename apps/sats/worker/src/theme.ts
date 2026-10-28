// Tema terang SATS Radar (tampilan bawaan gelap). Aktif saat Tool Hub memilih tema terang; lihat shared/theme.js.
// Grafik TradingView ikut berganti lewat atribut data-theme (lihat frontend/src/components/TradingViewChart.tsx).
const L = 'html[data-theme="light"]';
const G = "html[data-theme]"; // terang & gelap, hanya di dalam Tool Hub

// Liquid glass (token --hg-* dari shared/theme.js, sama dengan dashboard Tool Hub). Ditaruh setelah aturan terang supaya menang.
// Kartu berisi tabel/harga/grafik tetap hampir padat (--hg-solid); yang tembus pandang hanya kartu ringkas (KPI, sektor, preset).
// Blur hanya untuk yang melayang: header lengket (lewat ::before), menu, hasil pencarian, tooltip.
// JANGAN pasang backdrop-filter di .topbar / .nav: elemen itu jadi containing block anaknya yang position:fixed
// (bilah menu bawah di HP & menu Admin), lihat styles.css bagian "nav on phones". Bilah menu bawah cukup hampir padat.
const GLASS = `
${G}{background:var(--hg-base)}
${G} body{background:transparent}
${G} body::before{content:"";position:fixed;inset:0;z-index:-1;background:var(--hg-mesh);pointer-events:none}
${G} .topbar{isolation:isolate;background:transparent;border-bottom-color:var(--hg-edge);box-shadow:none;-webkit-backdrop-filter:none;backdrop-filter:none}
${G} .topbar::before{content:"";position:absolute;inset:0;z-index:-1;border-radius:inherit;background:var(--hg-glass);-webkit-backdrop-filter:var(--hg-blur);backdrop-filter:var(--hg-blur);box-shadow:var(--hg-hl),var(--hg-shadow);pointer-events:none}
${G} .search-box,${G} .user-chip,${G} .segmented{background:var(--hg-glass);border-color:var(--hg-edge);box-shadow:var(--hg-hl)}
${G} .search-box:focus-within{border-color:var(--ac)}
${G} .search-results,${G} .nav-more-menu,${G} .own-results,${G} .info-pop{background:var(--hg-float);border-color:var(--hg-edge);-webkit-backdrop-filter:var(--hg-blur);backdrop-filter:var(--hg-blur);box-shadow:var(--hg-hl),var(--hg-shadow-lg)}
${G} .card{background:var(--hg-solid);border-color:var(--hg-edge);box-shadow:var(--hg-hl),var(--hg-shadow)}
${G} .card.kpi,${G} .sector-tile,${G} .preset-card{background:var(--hg-glass);border-color:var(--hg-edge);box-shadow:var(--hg-hl),var(--hg-shadow)}
${G} .kpi-button.active,${G} .sector-tile.on,${G} .preset-card.on{border-color:var(--ac)}
${G} .preset-card.on{background:color-mix(in srgb,var(--ac) 9%,var(--hg-glass-hover))}
${G} .kpi-button,${G} .sector-tile,${G} .preset-card{transition:background-color .2s,border-color .2s,box-shadow .2s,transform .2s}
${G} .kpi-button:hover,${G} .sector-tile:hover,${G} .preset-card:hover{background-color:var(--hg-glass-hover);transform:translateY(-2px);box-shadow:var(--hg-hl),var(--hg-lift)}
${G} .back-btn,${G} .btn:not(.primary):not(.google-btn){background-color:var(--hg-glass);border-color:var(--hg-edge);box-shadow:var(--hg-hl)}
${G} .back-btn:hover,${G} .btn:not(.primary):not(.google-btn):hover{background-color:var(--hg-glass-hover);border-color:var(--ac)}
${G} .btn.primary{background-color:var(--ac);border-color:var(--ac);color:var(--ac-ink);background-image:linear-gradient(180deg,rgba(255,255,255,.18),rgba(255,255,255,0));box-shadow:inset 0 1px 0 rgba(255,255,255,.25),0 4px 14px rgba(11,33,23,.16)}
@media(max-width:640px){
  ${G} .topbar{position:relative;z-index:30}
  ${G} .nav{background:color-mix(in srgb,var(--s1) 97%,transparent);border-top-color:var(--hg-edge);box-shadow:var(--hg-hl),0 -10px 30px rgba(0,0,0,.12)}
}
@media(prefers-reduced-motion:reduce){
  ${G} .kpi-button:hover,${G} .sector-tile:hover,${G} .preset-card:hover{transform:none}
}
`;

export const SATS_THEME_CSS = `
${L}{color-scheme:light;--bg:#F3F6F4;--s1:#fff;--s2:#EEF3F0;--bd:#D9E2DD;--bd2:#C3D0C8;--tx:#14201B;--mu:#56665F;--dim:#6E7E76;--buy:#14905C;--sell:#D23F4B;--ac:#4A7F12;--c1:#5E9A1E;--c2:#1F6FC4;--ac-ink:#fff}
${L}{--own-ind:#1F6FC4;--own-corp:#A86A00;--own-inst:#14905C;--own-gov:#7B3FC4;--own-cust:#76837D;--own-oth:#6E7E76}
${L} body{background:radial-gradient(900px 440px at 12% -12%,rgba(30,138,90,.07),transparent 64%),var(--bg)}
${L} ::selection{background:rgba(74,127,18,.2)}
${L} a:hover{color:#3A6A0C}
${L} .brand span span,${L} .kpi-sub{color:var(--dim)}
${L} .kpi-label,${L} .table th{color:var(--mu)}
${L} .topbar{background:rgba(255,255,255,.9);border-bottom-color:var(--bd);box-shadow:0 6px 20px rgba(20,40,30,.06)}
${L} .nav a,${L} .nav-more>summary{color:var(--mu)}
${L} .nav a[aria-current="page"],${L} .nav-more.active>summary{color:var(--tx);background:#E6F0EA;border-color:#CFE0D6;box-shadow:none}
${L} .nav a:hover,${L} .nav-more>summary:hover{background:#EEF3F0;border-color:var(--bd)}
${L} .search-box,${L} .user-chip{background:#fff;border-color:var(--bd)}
${L} .search-results,${L} .nav-more-menu{background:#fff;border-color:var(--bd);box-shadow:0 18px 48px rgba(20,40,30,.14)}
${L} .card{background:#fff;border-color:var(--bd);box-shadow:0 1px 3px rgba(20,40,30,.06)}
${L} .card:hover,${L} .kpi-button:hover,${L} .today-list li:hover,${L} .preset-card:hover,${L} .sector-tile:hover{border-color:#B5CBBE}
${L} .card-head{border-bottom-color:var(--bd)}
${L} .card-foot,${L} .events li{border-top-color:var(--bd);border-bottom-color:var(--bd)}
${L} .kpi::before{background:var(--ac)}
${L} .kpi-button.active{box-shadow:0 0 0 1px rgba(74,127,18,.18),0 8px 22px rgba(20,40,30,.08)}
${L} .kpi-button:hover,${L} .sector-tile:hover,${L} .preset-card:hover{box-shadow:0 8px 22px rgba(20,40,30,.08)}
${L} .segmented{background:#EEF3F0;border-color:var(--bd)}
${L} .segmented button[aria-pressed="true"]{background:#fff;color:var(--tx);box-shadow:0 1px 3px rgba(20,40,30,.1)}
${L} .select select,${L} .input,${L} input:not([type="checkbox"]):not([type="radio"]),${L} textarea{background:#fff;border-color:var(--bd);color:var(--tx)}
${L} .table th{background:#F4F7F5;border-bottom-color:var(--bd)}
${L} .table td{border-bottom-color:var(--bd)}
${L} .table tr.clickable:hover td{background:rgba(74,127,18,.05)}
${L} .table tr.clickable:hover td:first-child{box-shadow:inset 3px 0 0 var(--ac)}
${L} .pill.buy{background:rgba(20,144,92,.08);border-color:rgba(20,144,92,.35)}
${L} .pill.sell{background:rgba(210,63,75,.07);border-color:rgba(210,63,75,.32)}
${L} .chip{background:#fff;border-color:var(--bd)}
${L} .chip.on{border-color:var(--ac);color:var(--ac);background:rgba(74,127,18,.08)}
${L} .back-btn,${L} .btn{background:#fff;border-color:var(--bd)}
${L} .back-btn:hover,${L} .btn:hover{background:#F1F6F3;border-color:var(--ac)}
${L} .strip-card{background:#F7FAF8}
${L} .level-chip{background:#F4F7F5;border-color:var(--bd)}
${L} .today-list li,${L} .sector-tile,${L} .preset-card,${L} .fund-card,${L} .metric-card,${L} .info-card{border-color:var(--bd)}
${L} .today-list li:hover,${L} .preset-card:hover,${L} .sector-tile:hover{background-color:rgba(74,127,18,.04)}
${L} .preset-tab[aria-selected="true"],${L} .preset-tab.active{background:#E6F0EA;border-color:#B5CBBE;color:var(--tx)}
${L} .preset-card{background:#fff}
${L} .tv-chart{background:#fff}
${L} .tv-fullscreen{background:rgba(255,255,255,.92)}
${L} .info-pop{background:#fff;border-color:var(--bd);color:var(--tx);box-shadow:0 12px 32px rgba(20,40,30,.18)}
${L} .tv-wrap,${L} .tv-chart{background:#fff}
${L} .sk-line{background:linear-gradient(90deg,var(--s2) 0%,#E1E9E4 50%,var(--s2) 100%);background-size:200% 100%}
@media(max-width:640px){
  ${L} .nav{background:rgba(255,255,255,.96);border-top-color:var(--bd);box-shadow:0 -10px 28px rgba(20,40,30,.1)}
  ${L} .nav a[aria-current="page"],${L} .nav-more.active>summary{background:#E3F0E8}
}
${GLASS}`;
