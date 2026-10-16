// Tema gelap halaman Tutorial yang dibuka di Tool Hub (/submit & /admin; tampilan bawaan terang). Lihat shared/theme.js.
// Halaman tutorial publik (index.html) tidak disisipi: tetap terang untuk pengguna aplikasi dan untuk hasil export.
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
`;
