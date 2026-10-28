// Tema gelap halaman Tutorial (tampilan bawaan terang). Lihat shared/theme.js: hanya aktif saat dibuka di dalam Tool Hub,
// jadi link tutorial yang dibagikan ke nasabah tetap terang. Hasil export tidak disisipi (lihat worker.js).
const D = 'html[data-theme="dark"]';
const G = 'html[data-theme]';

// Liquid glass (token --hg-* dari shared/theme.js, terang & gelap): hanya di dalam Tool Hub, untuk index, submit & admin.
// Layar tutorial (.screen), gambar langkah, dan isian tetap padat supaya mudah dibaca; kartu di atasnya diberi tepi halus,
// kilap & bayangan. Blur hanya untuk yang melayang (lembar daftar langkah di HP, dialog, toast, tombol panah gambar).
const GLASS = `
${G}{background:var(--hg-base)}
${G} body{background:transparent}
${G} body::before{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;background:var(--hg-mesh)}
${G} .row,${G} .pop,${G} .help-card{border-color:var(--hg-edge);box-shadow:var(--hg-hl),var(--hg-shadow);transition:border-color .15s ease,box-shadow .2s ease,transform .2s ease}
${G} .row:hover,${G} .pop:hover{transform:translateY(-2px);box-shadow:var(--hg-hl),var(--hg-lift)}
${G} .row:active{transform:scale(.98)}
${G} .faq details,${G} .share-btn,${G} .fb button{border-color:var(--hg-edge);box-shadow:var(--hg-hl)}
${G} .btn-app,${G} .nav-next,${G} .state-note button,${G} .ask-row button,${G} .fb-send,${G} .kn button.pri,${G} .btn-submit,${G} .btn-approve,${G} #login-box button,${G} .btn-add-cat,${G} .btn-save-slide,${G} .btn-import{background-image:linear-gradient(180deg,rgba(255,255,255,.16),rgba(255,255,255,0));box-shadow:inset 0 1px 0 rgba(255,255,255,.22),0 4px 14px rgba(11,33,23,.14)}
${G} .kn-bg{background:rgba(6,16,10,.42);-webkit-backdrop-filter:blur(8px) saturate(140%);backdrop-filter:blur(8px) saturate(140%)}
${G} .kn{background:var(--hg-float);border:1px solid var(--hg-edge);border-radius:var(--hg-r-lg);box-shadow:var(--hg-hl),var(--hg-shadow-lg)}
${G} .kn button:not(.pri){background:var(--hg-glass);border-color:var(--hg-edge)}
${G} .toast{background:rgba(20,32,26,.86);-webkit-backdrop-filter:var(--hg-blur);backdrop-filter:var(--hg-blur);box-shadow:var(--hg-shadow-lg)}
${D} .toast{background:rgba(38,51,44,.88)}
${G} .img-modal{-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}
@media (min-width:700px){${G} #phone{border-color:var(--hg-edge);box-shadow:var(--hg-shadow),0 0 0 1px var(--hg-edge)}}
@media (max-width:899px){${G} .steps{background:var(--hg-solid);-webkit-backdrop-filter:var(--hg-blur);backdrop-filter:var(--hg-blur);box-shadow:var(--hg-hl),0 -12px 40px rgba(10,30,20,.22)}}
@media (min-width:900px){${G} .tap-zone::after{background:var(--hg-float);-webkit-backdrop-filter:var(--hg-blur);backdrop-filter:var(--hg-blur);box-shadow:var(--hg-hl),var(--hg-shadow)}}
${G} .pending-card,${G} .storage-box,${G} .migrate-box,${G} .manage-cat,${G} .step-card,${G} .check-row,${G} .login-card,${G} .user-bar{background:var(--hg-glass);border-color:var(--hg-edge);border-radius:var(--hg-r-lg);box-shadow:var(--hg-hl),var(--hg-shadow)}
${G} .new-cat-box{background:var(--hg-glass);border-radius:var(--hg-r-lg);box-shadow:var(--hg-hl),var(--hg-shadow)}
${G} .btn-logout,${G} .mini-btn:not(.danger),${G} .btn-view-topic,${G} .btn-edit-topic-title,${G} .btn-edit-slide,${G} .btn-move-cat,${G} .btn-move-topic,${G} .btn-cancel-slide-edit,${G} .btn-cancel-topic-title{background:var(--hg-glass);border-color:var(--hg-edge);box-shadow:var(--hg-hl)}
@media (prefers-reduced-motion:reduce){${G} .row:hover,${G} .pop:hover{transform:none}}
`;

export const TUTORIAL_THEME_CSS = `
${D}{color-scheme:dark;--brand-green:#6FDC9F;--brand-emerald-soft:#14281E;--ink:#E4ECE7;--sub:#9DB0A5;--line:#2A3A31;--paper:#16201B;--bg:#0F1713;--danger:#F2897E;--danger-soft:#3B1A18;--warn-soft:#2A2010;--warn:#F0C875}
${D} input,${D} select,${D} textarea{background:var(--bg);color:var(--ink);border-color:var(--line)}
${D} #login-box button,${D} .btn-approve,${D} .btn-add-cat,${D} .btn-save-topic-title,${D} .btn-save-slide,${D} .btn-submit{background:#1F7A4C;color:#fff}
${D} .btn-import{background:#24503A}
${D} .privacy-box{border-color:#5A4A1E}
${D} .privacy-box strong{color:#F5D48A}
${D} .file-pick{border-color:#2F5E47}
${D} .img-modal{background:rgba(0,0,0,.9)}
${D} .green-head{background:linear-gradient(155deg,#14432c,#1a5c3a 70%)}
${D} .state-note button,${D} .nav-next{background:#1F7A4C;color:#fff}
${D} .search-box input{background:var(--bg);color:var(--ink)}
${D} .row:hover,${D} .pop:hover{border-color:#2F5E47}
${D} .row-chevron{color:#5D7066}
${D} .skeleton{background:linear-gradient(90deg,#16201B 25%,#1C2822 50%,#16201B 75%);background-size:200% 100%}
${D} .slide-image-wrap{background:linear-gradient(160deg,#121C17,#16201B)}
${D} .slide-image-placeholder{color:#7F9187}
${D} .slide-desc{color:#B8C8BF}
${D} .toast{background:#26332C;color:var(--ink)}
${GLASS}`;
