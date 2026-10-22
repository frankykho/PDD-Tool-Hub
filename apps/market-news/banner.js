// Latar banner KISI untuk Market News: ilustrasi AI (Workers AI, FLUX.1 schnell, gratis ±60 neuron/gambar).
// Dua jenis: latar per TEMA (dibuat sekali, disetujui tim, dipakai ulang) dan latar khusus SATU berita.
// Latar selalu tanpa teks, orang, logo, atau grafik berangka: judul, logo & sumber ditulis template di browser.

export const BG_MODEL = "@cf/black-forest-labs/flux-1-schnell";
export const BG_DAILY = 30;   // batas pembuatan latar per hari (jaga kuota neuron gratis)

const STYLE = "Abstract editorial illustration used as a background for a financial news banner. Clean, modern, calm, soft lighting, "
  + "shallow depth of field, deep green and warm gold color palette, generous empty space on the left side, high quality. "
  + "Strictly no text, no letters, no numbers, no words, no logos, no people, no faces, no hands, no flags, no charts or graphs with values.";

/** Subjek visual tiap tema (kunci = tema/kategori dari news.js). */
export const BG_THEMES = {
  "BI-Rate": "monetary policy concept: a classical stone colonnade in soft focus with stacked gold coins and a gentle balance scale",
  "The Fed": "global interest rate concept: a grand neoclassical facade in mist with floating coins",
  "Inflasi": "rising cost of living concept: a market basket of groceries with gently rising coin stacks",
  "PDB": "national economic growth concept: distant city skyline silhouette in soft haze with green growing shoots, no signage",
  "Kredit": "banking and lending concept: a bank vault door slightly open with soft light and coins",
  "Neraca dagang": "international trade concept: container ship and stacked shipping containers at a harbor at sunset",
  "Cadangan devisa": "foreign exchange reserves concept: a secure vault with neatly stacked gold bars",
  "PMI": "manufacturing concept: a clean modern factory floor with robotic arms in soft light",
  "APBN": "state budget concept: an elegant ledger book, a fountain pen and neat coin stacks on a desk",
  "Rupiah": "currency concept: a soft abstract pattern of banknote textures and coins, no readable denominations",
  "Batu bara": "coal mining concept: dark coal lumps with a distant open pit mine at golden hour",
  "Nikel": "nickel mining concept: shiny metallic nickel ore and an electric vehicle battery cell",
  "Emas": "gold concept: gleaming gold bars and nuggets on dark velvet",
  "CPO": "palm oil concept: lush oil palm plantation rows with ripe palm fruit bunches",
  "Minyak": "crude oil concept: an offshore oil rig at sunset over a calm sea",
  "Timah": "tin concept: stacked silver tin ingots with a soft industrial background",
  "Dividen": "dividend concept: a small tree with gold coins growing as fruit",
  "Rights issue": "capital raising concept: building blocks being added to a growing tower",
  "Buyback": "share buyback concept: coins flowing back into a glass jar",
  "Akuisisi": "acquisition concept: two puzzle pieces joining together on a desk",
  "IPO": "new listing concept: a bright open doorway with rays of golden light",
  "Stock split": "stock split concept: a gold bar neatly split into equal smaller pieces",
  "RUPS": "shareholder meeting concept: an empty modern boardroom with a long table and chairs",
  "Kinerja": "corporate earnings concept: a polished office desk with a calculator and neat documents, no readable text",
  "Obligasi": "bond concept: elegant rolled certificates tied with ribbon beside coins",
  "Tender offer": "tender offer concept: a sealed envelope and a wooden gavel on a desk",
  "IHSG": "stock market concept: abstract flowing streaks of green and gold light with soft bokeh, no buildings, no screens, no signage",
  "Asing": "foreign capital flow concept: a softly glowing globe with light trails connecting continents",
  makro: "macroeconomy concept: distant city skyline silhouette at dawn in soft haze, no signage",
  pasar: "stock market concept: abstract flowing streaks of green and gold light with soft bokeh, no buildings, no screens, no signage",
  emiten: "listed company concept: modern corporate glass office towers looking up at the sky",
  umum: "finance concept: abstract soft green and gold flowing waves",
};
export const BG_LABEL = { makro: "Makro (umum)", pasar: "Pasar (umum)", emiten: "Emiten (umum)", umum: "Umum" };

/** Tema latar untuk satu berita: tema spesifik → kategori → umum. */
export const bgTheme = (x) => (x && x.theme && BG_THEMES[x.theme] ? x.theme : x && BG_THEMES[x.cat] ? x.cat : "umum");

/** Prompt gambar. `scene` = deskripsi adegan dari AI teks untuk latar khusus berita (opsional). */
export function bgPrompt(theme, scene) {
  const subj = String(scene || "").replace(/\s+/g, " ").trim().slice(0, 300) || BG_THEMES[theme] || BG_THEMES.umum;
  return `${STYLE} Subject: ${subj}.`;
}

/** Instruksi AI teks: ubah berita jadi adegan visual aman (tanpa orang, teks, grafik). */
export const SCENE_RULES = "You write one short English visual scene description (max 30 words) for an abstract background illustration of an Indonesian financial news headline. "
  + "Describe objects, places, materials and mood only. Never mention or depict real people, faces, crowds, logos, brand names, flags, text, numbers, charts or graphs. "
  + "Answer with the description only.";

/** Ambil base64 JPEG dari hasil env.AI.run model gambar (bentuk {image} atau stream/bytes). */
export async function imageB64(out) {
  if (out && typeof out.image === "string") return out.image;
  let buf;
  if (out instanceof ReadableStream) buf = new Uint8Array(await new Response(out).arrayBuffer());
  else if (out instanceof ArrayBuffer) buf = new Uint8Array(out);
  else if (out instanceof Uint8Array) buf = out;
  if (!buf || !buf.length) throw new Error("Model gambar tidak mengembalikan gambar.");
  let s = ""; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}
