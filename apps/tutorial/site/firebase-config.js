// =============================================================================
//  KONFIGURASI FIREBASE — diisi di profil, bukan di sini
// =============================================================================
//  Nilainya dibaca dari window.PROFILE.tools.tutorial.firebase (disisipkan
//  worker tutorial dari profile.json). Cara mendapatkannya:
//  1. Buka https://console.firebase.google.com -> buat project baru (gratis).
//  2. Di dashboard project: klik ikon "</>" (Add app -> Web) untuk daftarkan
//     web app baru. Kasih nama bebas, TIDAK perlu centang Firebase Hosting.
//  3. Firebase akan menampilkan blok "firebaseConfig". Salin seluruh objeknya
//     (apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId)
//     ke profile.json di "tools": { "tutorial": { "firebase": { ... } } }.
//  4. Aktifkan juga:
//       - Firestore Database (Build -> Firestore Database -> Create database)
//       - Authentication (login memakai tiket dari Tool Hub, lihat hub-auth.js)
//  5. Di Firestore Database -> Rules, tempel isi file firestore.rules
//     (satu folder di atas folder ini), lalu klik Publish.
// =============================================================================

const P = window.PROFILE || {};
export const firebaseConfig = (P.tools && P.tools.tutorial && P.tools.tutorial.firebase) || {};

// Catatan: versi SDK Firebase (12.16.0) ditulis langsung di baris "import" pada
// index.html, submit.html, dan admin.html (bukan di sini) — karena aturan
// JavaScript module mengharuskan alamat import berupa teks tetap, tidak bisa
// pakai variabel. Kalau suatu saat mau update versi, cari & ganti angka
// "12.16.0" di ketiga file itu. Cek versi terbaru di:
// https://firebase.google.com/docs/web/setup
