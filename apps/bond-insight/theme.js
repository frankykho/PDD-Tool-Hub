// Tema terang Bond Insight (tampilan bawaan gelap). Aktif saat Tool Hub memilih tema terang; lihat shared/theme.js.
// Hanya tampilan layar: PDF (@media print) dan gambar story (canvas) tidak berubah.
const L = 'html[data-theme="light"]';

export const BOND_THEME_CSS = `
${L}{color-scheme:light;--bg:#F4F7F5;--p:#fff;--p2:#EEF3F0;--p3:#E1E9E5;--l:#D7E0DB;--g:#1E8A5A;--g2:#9CCBB3;--mint:#1A7A4F;--t:#14201B;--m:#56665F;--warn:#9a6400;--bad:#C2372B;--good:#1E8A5A}
${L} body{background:radial-gradient(ellipse at 50% -18%,rgba(30,138,90,.08),transparent 42%),var(--bg)}
${L} .top{border-bottom-color:var(--l)}
${L} .asof{background:var(--p);border-color:var(--l);color:var(--m)}
${L} .asof.demo{border-color:#E9D6A6}
${L} .btn{box-shadow:0 4px 14px rgba(30,138,90,.14)}
${L} .btn.s{background:var(--p);color:var(--t);border-color:var(--l)}
${L} .btn.s:hover{background:#F1F6F3;border-color:var(--g2)}
${L} .tabs{background:rgba(255,255,255,.92);border-color:var(--l);box-shadow:0 6px 20px rgba(20,60,40,.06)}
${L} .tabs button:hover{background:rgba(0,0,0,.04);color:var(--t)}
${L} .tabs button.active{background:#E3F3EA;color:var(--mint);box-shadow:inset 0 0 0 1px rgba(30,138,90,.22)}
${L} .tabs .count,${L} .seg button.on{color:#fff}
${L} .card,${L} .metric{background:var(--p);border-color:var(--l);box-shadow:0 2px 10px rgba(20,60,40,.04)}
${L} .metric:hover,${L} .bond:hover{border-color:#9CCBB3}
${L} .bond:hover{box-shadow:0 10px 26px rgba(20,60,40,.08)}
${L} input,${L} select,${L} textarea{background:#fff;color:var(--t);border-color:var(--l)}
${L} input:focus,${L} select:focus,${L} textarea:focus{border-color:var(--g);box-shadow:0 0 0 3px rgba(30,138,90,.12)}
${L} .chip{background:var(--p);border-color:var(--l)}
${L} .chip:hover{border-color:#9CCBB3}
${L} .chip.active{background:#E3F3EA;color:var(--mint);border-color:var(--g)}
${L} .tag,${L} .tag.cp{background:#E3F3EA;color:#1A7A4F}
${L} .tag.warn,${L} .tag.mt{background:#FBF0D9;color:#8A5A00}
${L} .tag.of{background:#E3EEFA;color:#1F5F9E}
${L} .tag.nt{background:#EEE8FB;color:#5B3FB0}
${L} .tag.id{background:#FBE6E3;color:#A8322A}
${L} .row{background:#F4F7F5;border-color:var(--l)}
${L} .hero{background:radial-gradient(ellipse at 90% 5%,rgba(30,138,90,.14),transparent 42%),linear-gradient(145deg,#EAF5EF,#fff 70%);border-color:#CDE3D6}
${L} .bar,${L} .vbar{background:#DDE6E1}
${L} .form label>span{color:#33433B}
${L} .note{background:#EAF5EF;color:#24332C;border-left-color:var(--g)}
${L} .note.warn{background:#FBF3E2;border-left-color:#D9A23A}
${L} .results .hl,${L} .vs>div.win{background:#E8F5EE;border-color:#9CCBB3}
${L} .disc{background:var(--p)}
${L} .tbl{border-color:var(--l)}
${L} .tbl th{background:#F1F6F3}
${L} .tbl tr:hover td{background:rgba(0,0,0,.025)}
${L} .preview{background:radial-gradient(ellipse at center,#F1F6F3,#E3EBE7 75%);border-color:var(--l)}
${L} .preview canvas{box-shadow:0 14px 36px rgba(20,60,40,.18);outline-color:rgba(0,0,0,.06)}
${L} .thumb{background:#fff}
${L} .thumb.on{background:#E3F3EA}
${L} .q{border-color:#B9C7C0}
${L} #tipbox{background:#fff;color:var(--t);box-shadow:0 10px 30px rgba(20,60,40,.16)}
${L} .toast{box-shadow:0 10px 30px rgba(20,60,40,.16)}
${L} .sharebar{background:#E8F5EE;color:#24332C}
${L} .homehero{background:radial-gradient(ellipse at 90% 0%,rgba(30,138,90,.14),transparent 40%),linear-gradient(120deg,#EAF5EF,#fff 72%);border-color:#CDE3D6;box-shadow:0 10px 28px rgba(20,60,40,.06)}
${L} .homehero p,${L} .home-pick-name{color:var(--m)}
${L} .home-stats .metric{background:var(--p)}
${L} .home-pick{background:var(--p);border-color:var(--l)}
${L} .home-pick:hover{border-color:#9CCBB3}
${L} .home-pick-bond{background:#F1F6F3;border-color:var(--l)}
${L} .home-pick-meta div{background:#F4F7F5;border-color:var(--l)}
${L} .home-reason{color:#33433B}
${L} .home-risk{color:#8A5A00;background:#FBF0D9;border-color:#EED9A8}
${L} .home-shortcut>span{background:#E3F3EA}
${L} .home-shortcut:hover{background:#F1F6F3}
${L} #loadErr{border-color:#F2D3B8;background:#FFF6EC}
${L} .app svg [stroke="#26302b"]{stroke:#E1E9E5}
${L} .app svg [stroke="#2a3430"]{stroke:#D7E0DB}
${L} .app svg [stroke="#0c0f0e"]{stroke:#fff}
${L} .app svg [fill="#93a39b"]{fill:#56665F}
${L} .app svg [fill="#dfe7e3"]{fill:#14201B}
${L} .app svg [fill="#8FE3B5"]{fill:#1A7A4F}
${L} .app svg [stroke="#8FE3B5"]{stroke:#1A7A4F}
${L} .app svg [stroke="#93a39b"]{stroke:#8A9A92}
${L} .app svg [stroke="#f0b54a"]{stroke:#9A6400}
${L} .app svg [stroke="#dfe7e3"]{stroke:#14201B}
${L} .app svg [stroke="#6fb7ff"]{stroke:#1F6FC4}
${L} .app svg [fill="#6fb7ff"]{fill:#1F6FC4}
${L} .app svg [stroke="#c49cff"]{stroke:#6E44B8}
${L} .app svg [fill="#c49cff"]{fill:#6E44B8}
${L} .app svg [stroke="#ef6b5e"]{stroke:#C2372B}
${L} .app svg [fill="#f0b54a"]{fill:#9A6400}
${L} .app svg [fill="#ef6b5e"]{fill:#C2372B}
`;

// Liquid glass di dalam Tool Hub (terang & gelap; token --hg-* dari shared/theme.js). Hanya layar: PDF & gambar story tidak berubah.
// Kartu berisi tabel, grafik, dan formulir tetap di permukaan hampir padat (--hg-solid); kartu ringkas (obligasi, metrik, pilihan) tembus pandang.
const G = 'html[data-theme]';
export const BOND_GLASS_CSS = `@media screen{
${G}{background:var(--hg-base)}
${G} body{background:transparent}
${G} body::before{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;background:var(--hg-mesh)}
${G} .top{border-bottom-color:var(--hg-edge)}
${G} .asof{background:var(--hg-sheen),var(--hg-glass);box-shadow:var(--hg-hl)}
${G} .asof:not(.demo){border-color:var(--hg-edge)}
${G} .tabs{background:var(--hg-float);border-color:var(--hg-edge);-webkit-backdrop-filter:var(--hg-blur);backdrop-filter:var(--hg-blur);box-shadow:var(--hg-hl),var(--hg-shadow)}
${G} .card:not(.homehero):not(#loadErr){background:var(--hg-solid);border-color:var(--hg-edge);box-shadow:var(--hg-hl),var(--hg-shadow)}
${G} .card,${G} .home-pick{border-radius:var(--hg-r-lg)}
${G} .homehero{border-color:var(--hg-edge);box-shadow:var(--hg-hl),var(--hg-shadow)}
${G} .card.bond,${G} .metric:not(.hl),${G} .home-pick,${G} .home-shortcut{background:var(--hg-sheen),var(--hg-glass);border-color:var(--hg-edge);box-shadow:var(--hg-hl),var(--hg-shadow);transition:background-color .2s,border-color .2s,box-shadow .2s,transform .2s}
${G} .card.bond:hover,${G} .metric:not(.hl):hover,${G} .home-pick:hover,${G} .home-shortcut:hover{background:var(--hg-glass-hover);border-color:rgba(56,201,130,.32);box-shadow:var(--hg-hl),var(--hg-lift)}
${G} .card.bond:hover,${G} .home-pick:hover{transform:translateY(-2px)}
${G} .btn{border-radius:var(--hg-r)}
${G} .btn:not(.s){box-shadow:inset 0 1px 0 rgba(255,255,255,.28),0 4px 14px rgba(11,33,23,.16)}
${G} .btn.s{background:var(--hg-sheen),var(--hg-glass);border-color:var(--hg-edge);box-shadow:var(--hg-hl)}
${G} .btn.s:hover{background:var(--hg-glass-hover);border-color:rgba(56,201,130,.4)}
${G} .chip:not(.active){background:var(--hg-sheen),var(--hg-glass);border-color:var(--hg-edge);box-shadow:var(--hg-hl)}
${G} .chip:not(.active):hover{background:var(--hg-glass-hover);border-color:rgba(56,201,130,.4)}
${G} .disc{background:var(--hg-sheen),var(--hg-glass);border-color:var(--hg-edge)}
${G} #tipbox{background:var(--hg-float);border-color:var(--hg-edge);-webkit-backdrop-filter:var(--hg-blur);backdrop-filter:var(--hg-blur);box-shadow:var(--hg-hl),var(--hg-shadow-lg)}
${G} .toast{background:var(--hg-float);-webkit-backdrop-filter:var(--hg-blur);backdrop-filter:var(--hg-blur);box-shadow:var(--hg-hl),var(--hg-shadow-lg)}
}
`;
