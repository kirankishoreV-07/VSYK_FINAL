-- ============================================================
-- 021_auction_bid_rules.sql
-- Open auction tables for demo + enforce bid rules in DB
-- ============================================================

-- Allow public access for demo (admin + member apps are anon)
DROP POLICY IF EXISTS "Authenticated users can view auctions" ON public.auctions;
CREATE POLICY "Allow public all access to auctions for demo"
  ON public.auctions FOR ALL
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can view bids" ON public.auction_bids;
DROP POLICY IF EXISTS "Users can place their own bids" ON public.auction_bids;
CREATE POLICY "Allow public read bids for demo"
  ON public.auction_bids FOR SELECT
  USING (true);
CREATE POLICY "Allow public insert bids for demo"
  ON public.auction_bids FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view their own auction joins" ON public.auction_participants;
DROP POLICY IF EXISTS "Users can join auctions" ON public.auction_participants;
DROP POLICY IF EXISTS "Users can leave auctions" ON public.auction_participants;
CREATE POLICY "Allow public read participants for demo"
  ON public.auction_participants FOR SELECT
  USING (true);
CREATE POLICY "Allow public insert participants for demo"
  ON public.auction_participants FOR INSERT
  WITH CHECK (true);
CREATE POLICY "Allow public delete participants for demo"
  ON public.auction_participants FOR DELETE
  USING (true);

-- Enforce bid rules at DB level
CREATE OR REPLACE FUNCTION public.validate_auction_bid()
RETURNS TRIGGER AS $$
DECLARE
  a RECORD;
BEGIN
  SELECT * INTO a FROM public.auctions WHERE id = NEW.auction_id;
  IF a IS NULL THEN
    RAISE EXCEPTION 'Auction not found.';
  END IF;

  IF a.status <> 'live' THEN
    RAISE EXCEPTION 'Auction is not live.';
  END IF;

  IF a.closes_at IS NOT NULL AND now() >= a.closes_at THEN
    RAISE EXCEPTION 'Auction has closed.';
  END IF;

  IF NEW.bid_amount < COALESCE(a.min_bid, 0) THEN
    RAISE EXCEPTION 'Bid is below the minimum.';
  END IF;

  IF COALESCE(a.max_bid, 0) > 0 AND NEW.bid_amount > a.max_bid THEN
    RAISE EXCEPTION 'Bid exceeds the maximum.';
  END IF;

  IF COALESCE(a.current_bid, 0) > 0 AND NEW.bid_amount >= a.current_bid THEN
    RAISE EXCEPTION 'Bid must be lower than the current lowest bid.';
  END IF;

  IF NEW.customer_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.auction_participants ap
      WHERE ap.auction_id = NEW.auction_id
        AND ap.customer_id = NEW.customer_id
    ) THEN
      RAISE EXCEPTION 'You must join the auction before bidding.';
    END IF;
  END IF;

  IF NEW.bidder_name IS NULL AND NEW.customer_id IS NOT NULL THEN
    SELECT full_name INTO NEW.bidder_name FROM public.customers WHERE id = NEW.customer_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_auction_bid ON public.auction_bids;
CREATE TRIGGER trg_validate_auction_bid
  BEFORE INSERT ON public.auction_bids
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_auction_bid();

CREATE OR REPLACE FUNCTION public.update_current_lowest_bid()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.auctions
  SET current_bid = NEW.bid_amount
  WHERE id = NEW.auction_id
    AND (current_bid = 0 OR NEW.bid_amount < current_bid);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_current_lowest_bid ON public.auction_bids;
CREATE TRIGGER trg_update_current_lowest_bid
  AFTER INSERT ON public.auction_bids
  FOR EACH ROW
  EXECUTE FUNCTION public.update_current_lowest_bid();

CREATE OR REPLACE FUNCTION public.validate_auction_participant()
RETURNS TRIGGER AS $$
DECLARE
  a RECORD;
BEGIN
  SELECT * INTO a FROM public.auctions WHERE id = NEW.auction_id;
  IF a IS NULL THEN
    RAISE EXCEPTION 'Auction not found.';
  END IF;

  IF NEW.customer_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.chit_members cm
      WHERE cm.chit_group_id = a.chit_group_id
        AND cm.customer_id = NEW.customer_id
    ) THEN
      RAISE EXCEPTION 'Member is not part of this chit group.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_auction_participant ON public.auction_participants;
CREATE TRIGGER trg_validate_auction_participant
  BEFORE INSERT ON public.auction_participants
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_auction_participant();
