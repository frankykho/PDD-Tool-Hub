// Tema terang/gelap mengikuti satu tombol tema di Tool Hub.
// Tool Hub mengirim {type:"toolhub-theme", theme:"light"|"dark"|"system"} ke iframe tool (saat dimuat & saat tombol diklik).
// Skrip ini menerjemahkannya menjadi <html data-theme="light|dark">; CSS tiap tool menimpa warna lewat selector itu.
// Pilihan terakhir disimpan di localStorage supaya halaman tidak berkedip saat dimuat ulang.
// Di luar Tool Hub (bukan iframe) halaman tidak diubah: tampil dengan warna bawaannya.
//
// Di server:  import { themeHead } from "../../shared/theme.js";  lalu sisipkan themeHead(CSS) ke dalam <head>.

const LISTENER = `<script>(function(){if(window.parent===window)return;var r=document.documentElement,q=matchMedia("(prefers-color-scheme: dark)"),m;function set(t){m=t;r.setAttribute("data-theme",t==="system"?(q.matches?"dark":"light"):t)}try{var s=localStorage.getItem("hub_theme");if(/^(light|dark|system)$/.test(s))set(s)}catch(e){}try{q.addEventListener("change",function(){if(m==="system")set(m)})}catch(e){}addEventListener("message",function(e){var d=e.data||{};if(e.source===parent&&d.type==="toolhub-theme"&&/^(light|dark|system)$/.test(d.theme)){set(d.theme);try{localStorage.setItem("hub_theme",d.theme)}catch(x){}}});try{parent.postMessage({type:"toolhub-theme-request"},"*")}catch(e){}})()</script>`;

// Liquid glass: token bersama (nilai sama dengan apps/tool-hub/shell.html) supaya semua tool tampil seragam. Hanya aktif saat
// <html> punya data-theme (di dalam Tool Hub); CSS tiap tool memetakan komponennya ke token ini, mis.
//   html[data-theme] .card{background:var(--hg-glass);border-color:var(--hg-edge);box-shadow:var(--hg-hl),var(--hg-shadow)}
// Latar: html memakai --hg-base, body transparan, body::before (position:fixed, z-index:-1) memakai --hg-mesh.
// Blur (--hg-blur) hanya untuk yang melayang di atas konten (header lengket, menu, dialog). Jangan pasang backdrop-filter langsung
// di elemen yang punya anak position:fixed (elemen itu jadi containing block-nya, lihat perbaikan menu SATS); pakai ::before.
// Tabel & angka tetap di atas permukaan padat (--hg-solid) supaya mudah dibaca.
const GLASS_LIGHT = "--hg-base:#EDF3EF;--hg-glass:rgba(255,255,255,.36);--hg-glass-hover:rgba(255,255,255,.58);--hg-float:rgba(255,255,255,.68);--hg-solid:rgba(255,255,255,.92);--hg-edge:rgba(23,35,27,.1);--hg-hl:inset 0 1px 0 rgba(255,255,255,.95),inset 0 0 0 1px rgba(255,255,255,.45);--hg-sheen:linear-gradient(135deg,rgba(255,255,255,.55) 0%,rgba(255,255,255,.12) 35%,rgba(255,255,255,0) 60%,rgba(255,255,255,.1) 100%);--hg-shadow:0 1px 2px rgba(16,32,22,.04),0 8px 24px rgba(16,32,22,.06);--hg-lift:0 14px 34px rgba(16,32,22,.11);--hg-shadow-lg:0 20px 50px rgba(11,33,23,.18);--hg-mesh:radial-gradient(60vw 55vh at 0% 0%,rgba(20,219,76,.36),transparent 70%),radial-gradient(50vw 50vh at 100% 0%,rgba(56,189,248,.3),transparent 70%),radial-gradient(45vw 45vh at 35% 60%,rgba(16,185,129,.16),transparent 70%),radial-gradient(60vw 55vh at 75% 100%,rgba(139,92,246,.22),transparent 70%),linear-gradient(180deg,#F1F7F3,#E8F0EB)";
const GLASS_DARK = "--hg-base:#08100C;--hg-glass:rgba(28,42,35,.32);--hg-glass-hover:rgba(36,54,45,.48);--hg-float:rgba(18,28,23,.72);--hg-solid:rgba(19,28,23,.92);--hg-edge:rgba(255,255,255,.09);--hg-hl:inset 0 1px 0 rgba(255,255,255,.1),inset 0 0 0 1px rgba(255,255,255,.04);--hg-sheen:linear-gradient(135deg,rgba(255,255,255,.09) 0%,rgba(255,255,255,.02) 35%,rgba(255,255,255,0) 60%,rgba(255,255,255,.03) 100%);--hg-shadow:0 1px 2px rgba(0,0,0,.3),0 10px 30px rgba(0,0,0,.24);--hg-lift:0 16px 40px rgba(0,0,0,.4);--hg-shadow-lg:0 24px 60px rgba(0,0,0,.6);--hg-mesh:radial-gradient(60vw 55vh at 0% 0%,rgba(20,219,76,.26),transparent 70%),radial-gradient(50vw 50vh at 100% 0%,rgba(56,189,248,.2),transparent 70%),radial-gradient(45vw 45vh at 35% 60%,rgba(16,185,129,.12),transparent 70%),radial-gradient(60vw 55vh at 75% 100%,rgba(139,92,246,.2),transparent 70%),linear-gradient(180deg,#08100C,#0A120E)";
export const GLASS_CSS = `html[data-theme]{--hg-blur:blur(20px) saturate(170%);--hg-r:12px;--hg-r-lg:18px;${GLASS_LIGHT}}html[data-theme="dark"]{${GLASS_DARK}}@media (prefers-color-scheme:dark){html[data-theme="system"]{${GLASS_DARK}}}`;

export const themeHead = (css) => `${LISTENER}<style id="tool-theme">${GLASS_CSS}${css}</style>`;
