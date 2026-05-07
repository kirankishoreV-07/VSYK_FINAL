-- ============================================================
-- 014_member_transactions.sql
-- Track partial/full payments made by members towards specific auctions
-- ============================================================

CREATE TABLE IF NOT EXISTS public.chit_member_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chit_member_id UUID REFERENCES public.chit_members(id) ON DELETE CASCADE NOT NULL,
    auction_id UUID REFERENCES public.auctions(id) ON DELETE SET NULL, -- specific auction/month
    amount BIGINT NOT NULL, -- in paise
    payment_type TEXT NOT NULL DEFAULT 'installment' CHECK (payment_type IN ('installment', 'penalty', 'registration')),
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'failed', 'refunded')),
    transaction_date TIMESTAMPTZ DEFAULT NOW(),
    notes TEXT
);

ALTER TABLE public.chit_member_transactions ENABLE ROW LEVEL SECURITY;

-- Admin policies
CREATE POLICY "Admin can insert member transactions"
  ON public.chit_member_transactions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admin can view all member transactions"
  ON public.chit_member_transactions FOR SELECT
  USING (true);

CREATE POLICY "Admin can update member transactions"
  ON public.chit_member_transactions FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admin can delete member transactions"
  ON public.chit_member_transactions FOR DELETE
  USING (true);

-- User policy
CREATE POLICY "Users can view own transactions"
  ON public.chit_member_transactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.chit_members cm
      WHERE cm.id = chit_member_transactions.chit_member_id
        AND cm.user_id = auth.uid()
    )
  );

-- Helper view to see total paid per member per auction
CREATE OR REPLACE VIEW public.v_member_auction_payments AS
SELECT 
    t.chit_member_id,
    t.auction_id,
    SUM(t.amount) as total_paid
FROM public.chit_member_transactions t
WHERE t.status = 'completed'
GROUP BY t.chit_member_id, t.auction_id;
