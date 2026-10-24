// Tema gelap halaman Tutorial (tampilan bawaan terang). Lihat shared/theme.js: hanya aktif saat dibuka di dalam Tool Hub,
// jadi link tutorial yang dibagikan ke nasabah tetap terang. Hasil export tidak disisipi (lihat worker.js).
const D = 'html[data-theme="dark"]';

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
`;
