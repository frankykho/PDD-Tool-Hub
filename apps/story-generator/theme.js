// Tema gelap Story Generator (tampilan bawaan terang). Aktif saat Tool Hub memilih tema gelap; lihat shared/theme.js.
// Hanya panel aplikasi: kanvas story (.sc, yang diunduh jadi PNG) memakai warnanya sendiri dan tidak ikut berubah.
const D = 'html[data-theme="dark"]';
const G = 'html[data-theme]';

// Liquid glass (token --hg-* dari shared/theme.js, terang & gelap): hanya di dalam Tool Hub, hanya panel aplikasi.
// Kanvas story (.sc / .pw-frame) tidak disentuh. Form tetap hampir padat (--hg-float) supaya isian mudah dibaca.
// .form-panel sengaja TANPA backdrop-filter: di HP .sf-bar di dalamnya position:fixed (filter akan menjadikannya containing block).
const GLASS = `
${G}{background:var(--hg-base)}
${G} body{background:transparent}
${G} body::before{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;background:var(--hg-mesh)}
${G} .topbar{background:var(--hg-float);border-bottom-color:var(--hg-edge);box-shadow:var(--hg-hl),var(--hg-shadow);-webkit-backdrop-filter:var(--hg-blur);backdrop-filter:var(--hg-blur)}
${G} .form-panel{background:var(--hg-float);border-right-color:var(--hg-edge);box-shadow:var(--hg-hl),var(--hg-shadow)}
${G} .sp-card,${G} .news-card-form,${G} .ca-card-form,${G} .wa-pg,${G} .cal-item{border-color:var(--hg-edge)}
${G} .preview-panel{background:transparent}
${G} .pw-lbl{background:var(--hg-sheen),var(--hg-glass);border-color:var(--hg-edge);box-shadow:var(--hg-hl),0 2px 8px rgba(16,32,22,.04)}
${G} #sfHome{background:var(--hg-mesh)}
${G} .sf-card{background:var(--hg-sheen),var(--hg-glass)!important;border-color:var(--hg-edge)!important;border-radius:var(--hg-r-lg)!important;box-shadow:var(--hg-hl),var(--hg-shadow)!important;transition:background-color .2s,box-shadow .2s,transform .2s}
${G} .sf-card:hover{background:var(--hg-glass-hover)!important;border-color:var(--hg-edge)!important;transform:translateY(-2px);box-shadow:var(--hg-hl),var(--hg-lift)!important}
${G} .sf-bar{background:var(--hg-float);border-top-color:var(--hg-edge);-webkit-backdrop-filter:var(--hg-blur);backdrop-filter:var(--hg-blur);box-shadow:var(--hg-hl),0 -8px 24px rgba(16,32,22,.08)}
${G} .sf-bar .s{background:var(--hg-sheen),var(--hg-glass);border-color:var(--hg-edge);box-shadow:var(--hg-hl)}
${G} .btn-dl,${G} .btn-dl-sm,${G} .btn-dl-all{box-shadow:inset 0 1px 0 rgba(255,255,255,.22),0 5px 14px rgba(22,132,81,.16)}
${G} .sf-row button.p{box-shadow:inset 0 1px 0 rgba(255,255,255,.22),0 4px 14px rgba(11,33,23,.16)!important}
${D} .sf-bar{box-shadow:var(--hg-hl),0 -8px 24px rgba(0,0,0,.35)}
@media(prefers-reduced-motion:reduce){${G} .sf-card:hover{transform:none}}
`;

export const STORY_THEME_CSS = `
${D}{color-scheme:dark;--bg:#0F1713;--panel:#16201B;--border:#2A3A31;--inp:#121C17;--inp-b:#2F4137;--inp-focus:#3FC488;--t1:#E4ECE7;--t2:#9DB0A5;--t3:#73867B;--blue:#2F9E68;--green:#3FC488;--red:#F2897E;--amber:#E0A84A;--green-dim:rgba(63,196,136,.12);--red-dim:rgba(242,137,126,.12);--blue-dim:rgba(47,158,104,.14)}
${D} body{background:linear-gradient(135deg,#0F1713 0%,#0C130F 100%)}
${D} .sc{color-scheme:light}
${D} .topbar{background:rgba(18,27,22,.94);border-bottom-color:var(--border);box-shadow:0 4px 18px rgba(0,0,0,.3)}
${D} .tb-name{color:#D7F5DF}
${D} .tb-sub{color:var(--t2)}
${D} .tb-user a,${D} .tab-btn.active,${D} .pw-lbl,${D} .pw-toggle,${D} .pw-ready,${D} .cal-item,${D} .wa-pg{background:var(--panel);border-color:var(--border)}
${D} .tb-status{color:#86E0B0;background:#14281E;border-color:#24503A}
${D} .sf-home-btn{background:#14281E!important;border-color:#24503A!important;color:#86E0B0!important}
${D} .sf-home-btn:hover{background:#1A3326!important}
${D} .sf-pick select{background:var(--inp);color:var(--t1);border-color:var(--inp-b)}
${D} .form-panel{background:rgba(20,30,25,.96);border-color:var(--border);scrollbar-color:#2F4137 transparent}
${D} .fst{color:var(--t2)}
${D} .fst::after{background:linear-gradient(90deg,#2A3A31,transparent)}
${D} .fl{color:#A9BCB0}
${D} .fi{background:var(--inp);border-color:var(--inp-b);color:var(--t1)}
${D} .fi:hover{border-color:#3D5446}
${D} .fi:focus{background:var(--bg);border-color:var(--inp-focus);box-shadow:0 0 0 3px rgba(63,196,136,.14)}
${D} .fi.fi-auto,${D} .fi[readonly].fi-auto,${D} select.fi.fi-auto:disabled{background:#18231D;color:#8A9C91;border-color:var(--border)}
${D} .auto-note,${D} .pw-sz{color:var(--t3)}
${D} .sp-card,${D} .news-card-form,${D} .ca-card-form{background:var(--inp);border-color:var(--border)}
${D} .btn-dl-all{background:#24503A}
${D} .btn-dl-all:hover{background:#2B6045}
${D} .preview-panel{background:radial-gradient(ellipse at 50% 0%,rgba(40,70,52,.35),transparent 70%);scrollbar-color:#2F4137 transparent}
${D} .pw-lbl{color:var(--t2)}
${D} .pw-frame{box-shadow:0 18px 44px rgba(0,0,0,.45),0 0 0 1px rgba(255,255,255,.06)}
${D} .pw-over{color:#FCA5A5;background:#3B1414;border-color:#7F2A2A}
${D} .pw-ready.bad{color:#FCD34D;background:#3A2A0B;border-color:#6B4F12}
${D} .pw-probs{color:#F5D48A;background:#2A2010;border-color:#6B4F12}
${D} .wa-pg-h{color:var(--t1)}
${D} .wa-txt{background:var(--inp)!important;border-color:var(--inp-b)!important;color:var(--t1)}
${D} .wk-tbl th{background:var(--inp)}
${D} .wk-tbl td{border-bottom-color:var(--border)}
${D} .toggle-slider{background:#3A4A41}
${D} .toggle-switch input:checked+.toggle-slider{background:#2F9E68}
${D} #sfHome{background:var(--bg)}
${D} #sfHomeIn h1{color:#D7F5DF}
${D} #sfHomeIn .lead,${D} #sfHomeIn h2,${D} .sf-card .slot{color:var(--t2)}
${D} .sf-card{background:var(--panel)!important;border-color:var(--border)!important;color:var(--t1)!important;box-shadow:none!important}
${D} .sf-card:hover{border-color:#3D7A55!important;box-shadow:0 14px 30px rgba(0,0,0,.35)!important}
${D} .sf-st,${D} .sf-st.new{background:#1C2822;color:#8A9C91}
${D} .sf-st.done{background:#14281E;color:#86E0B0}
${D} .sf-st.wip{background:#2E2410;color:#F0C875}
${D} .sf-prog{background:#24322A!important}
${D} .sf-bar{background:rgba(20,30,25,.96);border-top-color:var(--border);box-shadow:0 -8px 22px rgba(0,0,0,.35)}
${D} .sf-saved{color:var(--t3)!important}
${D} .sf-warn{background:#2A1D10;border-color:#5C3A1A;color:#FDBA74}
${D} .sf-warn button{background:#1E1710!important;border-color:#7C4A1E!important;color:#FDBA74!important}
${D} .form-panel [style*="#f0fdf4"]{background:#14281E!important;border-color:#24503A!important}
${D} .form-panel [style*="#fef2f2"]{background:#3B1414!important;border-color:#7F2A2A!important;color:#FCA5A5!important}
${D} .form-panel [style*="#7f1d1d"]{color:#FCA5A5!important}
@media(max-width:760px){${D} .form-panel{border-bottom-color:var(--border)}}
${GLASS}`;
