-- Kolom aliran dana (CMF, OBV, volume naik/turun) di tech_latest. Tabel diisi ulang setiap run EOD, jadi aman dibuat ulang.
--   npx wrangler d1 execute sats-db --remote -c wrangler.deploy.json --file=../database/migrations/006_money_flow.sql
--   npx wrangler d1 execute sats-db --remote -c wrangler.deploy.json --file=../database/schema.sql
DROP TABLE IF EXISTS tech_latest;
