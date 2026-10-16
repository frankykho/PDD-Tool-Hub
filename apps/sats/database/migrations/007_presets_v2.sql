-- Kolom indikator tambahan untuk 12 preset baru. tech_latest diisi ulang setiap run EOD, jadi aman dibuat ulang.
--   npx wrangler d1 execute sats-db --remote -c wrangler.deploy.json --file=../database/migrations/007_presets_v2.sql
--   npx wrangler d1 execute sats-db --remote -c wrangler.deploy.json --file=../database/schema.sql
DROP TABLE IF EXISTS tech_latest;
