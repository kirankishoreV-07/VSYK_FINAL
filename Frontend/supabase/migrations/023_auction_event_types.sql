-- ============================================================
-- 023_auction_event_types.sql
-- Extend auction_events event types
-- ============================================================

ALTER TABLE public.auction_events DROP CONSTRAINT IF EXISTS auction_events_event_type_check;

ALTER TABLE public.auction_events
ADD CONSTRAINT auction_events_event_type_check
CHECK (event_type IN ('started','paused','resumed','winner_declared','cancelled','closed','auto_closed'));
