// Menulis FUND_URL dan BOND_URL (untuk $GITHUB_ENV) dari env PROFILE_JSON.
// urls.fund / urls.bond kalau diisi; selain itu https://<nama-worker>.<subdomain>.workers.dev
// Profil boleh berkomentar (// di baris sendiri maupun di ujung baris), sama seperti yang dibaca scripts/deploy.mjs.
import { parseJsonc } from "../../shared/jsonc.js";

const raw = (process.env.PROFILE_JSON || "").trim() || "{}";
let p;
try { p = parseJsonc(raw); } catch (e) { console.error("Secret PROFILE_JSON bukan JSON yang valid: " + e.message); process.exit(1); }
const u = p.urls || {};
const at = (name) => (p.subdomain ? `https://${name}.${p.subdomain}.workers.dev` : "");
const fund = u.fund || at("fund-insight"), bond = u.bond || at("bond-insight");
if (!fund || !bond) { console.error("Secret PROFILE_JSON belum berisi urls.fund/urls.bond atau subdomain."); process.exit(1); }
console.log(`FUND_URL=${fund}\nBOND_URL=${bond}`);
