// Tema gelap Email Studio (tampilan bawaan terang). Aktif saat Tool Hub memilih tema gelap; lihat shared/theme.js.
// Preview email (#frame) sengaja tetap putih: itu tampilan asli email di kotak masuk penerima.
const D = 'html[data-theme="dark"]';
const G = 'html[data-theme]';

// Liquid glass (token --hg-* dari shared/theme.js, terang & gelap): hanya di dalam Tool Hub. Panel tembus pandang di atas latar gradasi;
// isian form tetap di permukaan padat (--hg-solid), preview email (#frame) & kode HTML tidak diubah. Blur hanya untuk yang melayang
// (menu Lainnya, laci Periksa & ekspor); tidak ada elemen ber-blur yang punya anak position:fixed.
const GLASS = `
${G}{background:var(--hg-base)}
${G} body{background:transparent}
${G} body::before{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;background:var(--hg-mesh)}
${G} header.top{margin:10px 12px 0;border:0;border-radius:var(--hg-r-lg);box-shadow:inset 0 1px 0 rgba(255,255,255,.1),0 8px 24px rgba(5,24,15,.16)}
${G} main{gap:12px;padding:12px}
${G} .railwrap,${G} .pane{background:var(--hg-sheen),var(--hg-glass);border:1px solid var(--hg-edge);border-radius:var(--hg-r-lg);overflow:hidden;box-shadow:var(--hg-hl),var(--hg-shadow)}
${G} .railbar,${G} .bar{background:transparent;border-color:var(--hg-edge)}
${G} .stage{background:transparent}
${G} .railtools button,${G} .bar>button:not(.pri),${G} .more summary,${G} .hrow button,${G} .df button:not(.pri),${G} .seg{background:var(--hg-sheen),var(--hg-glass);border-color:var(--hg-edge);box-shadow:var(--hg-hl)}
${G} .railtools button:hover,${G} .bar>button:not(.pri):hover,${G} .more summary:hover,${G} .hrow button:hover,${G} .df button:not(.pri):hover{background:var(--hg-glass-hover)}
${G} .seg{border-radius:9px}
${G} .seg button:not(.on){background:transparent}
${G} .seg button.on,${G} .bar .pri,${G} .hb.pri,${G} .df button.pri,${G} summary .tog{background-image:linear-gradient(180deg,rgba(255,255,255,.16),rgba(255,255,255,0));box-shadow:inset 0 1px 0 rgba(255,255,255,.22)}
${G} .hb.pri{box-shadow:inset 0 1px 0 rgba(255,255,255,.35),0 4px 14px rgba(57,230,154,.18)}
${G} .more>div{background:var(--hg-float);border-color:var(--hg-edge);border-radius:var(--hg-r);-webkit-backdrop-filter:var(--hg-blur);backdrop-filter:var(--hg-blur);box-shadow:var(--hg-hl),var(--hg-shadow-lg)}
${G} .tips,${G} .teambar{border-radius:var(--hg-r)}
${G} #rail details{background:var(--hg-solid);border-color:var(--hg-edge);border-radius:var(--hg-r);box-shadow:var(--hg-hl),0 1px 2px rgba(16,32,22,.04)}
${G} #rail details[open]>summary{border-bottom-color:var(--hg-edge)}
${G} .home{background:var(--hg-mesh)}
${G} .gallery-hero{margin-top:18px;border-radius:var(--hg-r-lg);box-shadow:inset 0 1px 0 rgba(255,255,255,.1),0 10px 30px rgba(5,24,15,.16)}
${G} .cont{border-radius:var(--hg-r-lg);box-shadow:inset 0 1px 0 rgba(255,255,255,.12),0 8px 24px rgba(15,72,44,.16)}
${G} .tcard,${G} .hist{background:var(--hg-sheen),var(--hg-glass);border-color:var(--hg-edge);border-radius:var(--hg-r-lg);box-shadow:var(--hg-hl),var(--hg-shadow)}
${G} .tcard{transition:background-color .2s,box-shadow .2s,transform .2s}
${G} .tcard:hover{background:var(--hg-glass-hover);border-color:var(--hg-edge);transform:translateY(-2px);box-shadow:var(--hg-hl),var(--hg-lift)}
${G} .hrow{border-top-color:var(--hg-edge)}
${G} .drawer{background:var(--hg-float);border-left:1px solid var(--hg-edge);border-radius:var(--hg-r-lg) 0 0 var(--hg-r-lg);-webkit-backdrop-filter:var(--hg-blur);backdrop-filter:var(--hg-blur);box-shadow:var(--hg-hl),var(--hg-shadow-lg)}
${G} .dh,${G} .df,${G} .ck{border-color:var(--hg-edge)}
${G} .veil{background:rgba(6,16,10,.26);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px)}
${D} .veil{background:rgba(0,0,0,.42)}
@media(max-width:480px){${G} .drawer{border-radius:0}}
@media(prefers-reduced-motion:reduce){${G} .tcard{transition:none}${G} .tcard:hover{transform:none}}
`;

export const EMAIL_THEME_CSS = `
${D}{color-scheme:dark;--bg:#0F1713;--panel:#16201B;--ink:#E4ECE7;--mut:#9DB0A5;--line:#2A3A31;--brand:#1B6B47;--brand2:#39E69A;--tint:#163024}
${D} body{background:var(--bg);color:var(--ink)}
${D} .tplsel select{background:#16201B;color:var(--ink);border:1px solid #47745D}
${D} .more summary,${D} .more>div,${D} details,${D} .hist,${D} .drawer,${D} .item,${D} .railwrap,${D} .railbar,${D} .bar{background:var(--panel);border-color:var(--line)}
${D} .more>div{box-shadow:0 8px 24px rgba(0,0,0,.45)}
${D} summary .st.ok{color:#86EFAC;background:#14321F}
${D} summary .st.no{color:#FDBA74;background:#3A1E0E}
${D} .home{background:var(--bg);color:var(--ink)}
${D} .home h2{color:var(--mut)}
${D} .home .gallery-copy h2{color:#fff}
${D} .tcard{background:var(--panel);border-color:var(--line);box-shadow:none}
${D} .tcard:before{border-bottom-color:var(--line)}
${D} .tcard b{color:var(--ink)}
${D} .tcard span{color:var(--mut)}
${D} .tcard small,${D} label.f small,${D} .hint{color:#7F9187}
${D} .tcard:hover{border-color:#36C985;box-shadow:0 7px 18px rgba(0,0,0,.35)}
${D} .hrow button{background:#1C2822;border-color:var(--line);color:#7FE0AD}
${D} .ck{border-bottom-color:var(--line)}
${D} .df button{background:#1C2822;border-color:var(--line);color:var(--ink)}
${D} .df button.pri{background:#155C40;border-color:#155C40;color:#fff}
${D} .drawer{box-shadow:-10px 0 40px rgba(0,0,0,.5)}
${D} .veil{background:rgba(0,0,0,.55)}
${D} .teambar{background:#2A1D10;border-color:#5C3A1A;color:#FDBA74}
${D} .teambar button{background:#1E1710;border-color:#7C4A1E;color:#FDBA74}
${D} .railbar button,${D} .bar button,${D} .ih button,${D} .seg button{background:#1C2822;border-color:var(--line);color:var(--ink)}
${D} .railbar button:hover,${D} .bar button:hover{background:#1F3329;border-color:#42C987}
${D} .seg button.on,${D} .bar .pri{background:#155C40;color:#fff}
${D} .ih button.del,${D} #fmtMsg,${D} #warn,${D} #size.warn{color:#F2897E}
${D} .tips{background:#14281E;border-color:#24503A;color:#B9E8CF}
${D} .tips code{background:var(--bg)}
${D} #fmt button{background:#1C2822;border-color:#2F5E47;color:#7FE0AD}
${D} #fmt button:hover{background:#1B6B47;color:#fff}
${D} details.off summary .tog{background:#2A3530;color:#9AA8A0}
${D} details.off summary{color:#7F8F86}
${D} label.f input,${D} label.f textarea,${D} label.f select{background:var(--bg);border-color:var(--line);color:var(--ink)}
${D} label.f input:focus,${D} label.f textarea:focus{outline-color:#24503A}
${D} .list{background:#121C17;border-color:var(--line)}
${D} .add{color:#7FE0AD}
${D} .pane{background:#0C120F}
${D} .stage{background:linear-gradient(135deg,#0F1713,#0B110E)}
${D} #frame{border-color:var(--line);box-shadow:0 5px 20px rgba(0,0,0,.45)}
${D} #xpChecks>p[style]{filter:brightness(1.7)}
${GLASS}`;
