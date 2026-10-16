-- Multi-strategi. Jalankan SEKALI, lalu jalankan workflow EOD SATS dengan opsi "full".
--   npx wrangler d1 execute sats-db --remote -c wrangler.deploy.json --file=../database/migrations/003_strategies.sql
--   npx wrangler d1 execute sats-db --remote -c wrangler.deploy.json --file=../database/schema.sql
-- Tabel lama dihapus; semua isinya dibangun ulang oleh pipeline.
DROP TABLE IF EXISTS sats_signals;
DROP TABLE IF EXISTS sats_latest;
DROP TABLE IF EXISTS sats_trades;
