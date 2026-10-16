// Tema gelap Email Studio (tampilan bawaan terang). Aktif saat Tool Hub memilih tema gelap; lihat shared/theme.js.
// Preview email (#frame) sengaja tetap putih: itu tampilan asli email di kotak masuk penerima.
const D = 'html[data-theme="dark"]';

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
`;
