// Tema terang/gelap mengikuti satu tombol tema di Tool Hub.
// Tool Hub mengirim {type:"toolhub-theme", theme:"light"|"dark"|"system"} ke iframe tool (saat dimuat & saat tombol diklik).
// Skrip ini menerjemahkannya menjadi <html data-theme="light|dark">; CSS tiap tool menimpa warna lewat selector itu.
// Pilihan terakhir disimpan di localStorage supaya halaman tidak berkedip saat dimuat ulang.
// Di luar Tool Hub (bukan iframe) halaman tidak diubah: tampil dengan warna bawaannya.
//
// Di server:  import { themeHead } from "../../shared/theme.js";  lalu sisipkan themeHead(CSS) ke dalam <head>.

const LISTENER = `<script>(function(){if(window.parent===window)return;var r=document.documentElement,q=matchMedia("(prefers-color-scheme: dark)"),m;function set(t){m=t;r.setAttribute("data-theme",t==="system"?(q.matches?"dark":"light"):t)}try{var s=localStorage.getItem("hub_theme");if(/^(light|dark|system)$/.test(s))set(s)}catch(e){}try{q.addEventListener("change",function(){if(m==="system")set(m)})}catch(e){}addEventListener("message",function(e){var d=e.data||{};if(e.source===parent&&d.type==="toolhub-theme"&&/^(light|dark|system)$/.test(d.theme)){set(d.theme);try{localStorage.setItem("hub_theme",d.theme)}catch(x){}}});try{parent.postMessage({type:"toolhub-theme-request"},"*")}catch(e){}})()</script>`;

export const themeHead = (css) => `${LISTENER}<style id="tool-theme">${css}</style>`;
