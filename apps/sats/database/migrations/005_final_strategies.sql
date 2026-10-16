-- Strategi final (2026-09-25): SATS + filter (utama) dan SATS (pantauan).
-- Jalankan SEKALI:
--   npx wrangler d1 execute sats-db --remote -c wrangler.deploy.json --file=../database/migrations/005_final_strategies.sql
--   npx wrangler d1 execute sats-db --remote -c wrangler.deploy.json --file=../database/schema.sql
DELETE FROM sats_latest WHERE strategy NOT IN ('SATS', 'SATS_F');
DELETE FROM sats_trades WHERE strategy NOT IN ('SATS', 'SATS_F');
ALTER TABLE sats_latest ADD COLUMN filter_signal INTEGER;
ALTER TABLE sats_latest ADD COLUMN filter_now INTEGER;
