-- Insert mock auctions for testing if none exist
INSERT INTO auctions (id, chit_group_id, scheduled_at, status, min_bid, current_bid, winner_user_id)
SELECT 
  gen_random_uuid(), 
  id, 
  NOW() + interval '5 minutes', 
  'live', 
  5000, 
  12500, 
  null
FROM chit_groups 
WHERE status = 'active'
LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO auctions (id, chit_group_id, scheduled_at, status, min_bid, current_bid, winner_user_id)
SELECT 
  gen_random_uuid(), 
  id, 
  NOW() + interval '2 days', 
  'upcoming', 
  3000, 
  0, 
  null
FROM chit_groups 
WHERE status = 'active' AND value < 500000
LIMIT 2
ON CONFLICT DO NOTHING;
