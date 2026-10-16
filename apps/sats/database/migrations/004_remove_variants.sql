-- Hapus varian yang kalah perbandingan (2026-09-25): Follow Line V9 (FOLLOW) dan SATS IDX Core (SATS_IDX).
--   npx wrangler d1 execute sats-db --remote -c wrangler.deploy.json --file=../database/migrations/004_remove_variants.sql
DELETE FROM sats_latest WHERE strategy IN ('FOLLOW', 'SATS_IDX');
DELETE FROM sats_trades WHERE strategy IN ('FOLLOW', 'SATS_IDX');
