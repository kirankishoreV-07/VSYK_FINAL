import { useQuery } from '@tanstack/react-query';
import { supabase } from '../supabase';

// ─── Types ────────────────────────────────────────────────────

export type ChitGroup = {
  id: string;
  name: string;
  value: number;              // in paise
  duration_months: number;
  monthly_installment: number; // in paise
  status: 'active' | 'completed' | 'cancelled';
};

export type PaymentSchedule = {
  id: string;
  month_number: number;
  due_date: string;
  amount: number;
  paid: boolean;
  dividend_amount: number;
};

export type ActiveChit = {
  membership_id: string;
  current_month: number;
  bid_status: 'active' | 'bidding' | 'completed' | 'foreclosed';
  chit_group: ChitGroup;
  next_payment: PaymentSchedule | null;
};

export type UpcomingAuction = {
  id: string;
  scheduled_at: string;
  status: string;
  min_bid: number;
  chit_group: { name: string } | null;
  has_reminder: boolean;
};

export type DashboardStats = {
  total_portfolio_value: number;  // in paise
  total_earnings: number;         // in paise
  active_chit_count: number;
};

// ─── Hooks ────────────────────────────────────────────────────

/** Fetch all active chits for the current user with next payment */
export function useActiveChits(memberId: string | null) {
  return useQuery<ActiveChit[]>({
    queryKey: ['active-chits', memberId],
    queryFn: async () => {
      if (!memberId) return [];

      // Fetch memberships with their chit group
      const { data: memberships, error: mErr } = await supabase
        .from('chit_members')
        .select(`
          id,
          current_month,
          bid_status,
          chit_group:chit_groups (
            id, name, value, duration_months, monthly_installment, status
          )
        `)
        .eq('customer_id', memberId)
        .neq('bid_status', 'completed')
        .neq('bid_status', 'foreclosed');

      if (mErr) throw new Error(mErr.message);
      if (!memberships || memberships.length === 0) return [];

      // For each membership, fetch the next unpaid payment schedule
      const results: ActiveChit[] = await Promise.all(
        memberships.map(async (m: any) => {
          const { data: payments } = await supabase
            .from('payment_schedules')
            .select('*')
            .eq('chit_member_id', m.id)
            .eq('paid', false)
            .order('due_date', { ascending: true })
            .limit(1);

          return {
            membership_id: m.id,
            current_month: m.current_month,
            bid_status: m.bid_status,
            chit_group: m.chit_group as ChitGroup,
            next_payment: payments?.[0] ?? null,
          };
        })
      );

      return results;
    },
    staleTime: 2 * 60 * 1000,
  });
}

/** Fetch dashboard stats — portfolio value and total earnings */
export function useDashboardStats(memberId: string | null) {
  return useQuery<DashboardStats>({
    queryKey: ['dashboard-stats', memberId],
    queryFn: async () => {
      if (!memberId) return { total_portfolio_value: 0, total_earnings: 0, active_chit_count: 0 };

      // 1) Active count
      const { count } = await supabase
        .from('chit_members')
        .select('*', { count: 'exact', head: true })
        .eq('customer_id', memberId)
        .neq('bid_status', 'completed');

      // 2) Portfolio value & Earnings
      const { data: memberships } = await supabase
        .from('chit_members')
        .select(`
          id,
          chit_group:chit_groups (value)
        `)
        .eq('customer_id', memberId);

      let portfolioValue = 0;
      let totalEarnings = 0;

      if (memberships) {
        for (const m of memberships) {
          if (m.chit_group) {
            portfolioValue += Number((m.chit_group as any).value || 0);
          }
          // Safely calling RPC, if missing we ignore
          const { data: sumData } = await Promise.resolve(
            supabase.rpc('sum_dividends', { p_member_id: m.id })
          ).catch(() => ({ data: 0 }));
          totalEarnings += sumData || 0;
        }
      }

      return {
        total_portfolio_value: portfolioValue,
        total_earnings: totalEarnings,
        active_chit_count: count ?? 0,
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** Fetch upcoming auctions with reminder status */
export function useUpcomingAuctions(memberId: string | null) {
  return useQuery<UpcomingAuction[]>({
    queryKey: ['upcoming-auctions', memberId],
    queryFn: async () => {
      if (!memberId) return [];

      const now = new Date().toISOString();

      const { data: auctions, error } = await supabase
        .from('auctions')
        .select(`
          id,
          scheduled_at,
          status,
          min_bid,
          chit_group:chit_groups ( name )
        `)
        .in('status', ['upcoming', 'live'])
        .gte('scheduled_at', now)
        .order('scheduled_at', { ascending: true })
        .limit(5);

      if (error) throw new Error(error.message);
      if (!auctions || auctions.length === 0) return [];

      // Currently ignoring reminders since they are user_id based
      return auctions.map((a: any) => ({
        id: a.id,
        scheduled_at: a.scheduled_at,
        status: a.status,
        min_bid: Number(a.min_bid ?? 0),
        chit_group: a.chit_group,
        has_reminder: false,
      }));
    },
    staleTime: 60 * 1000,
  });
}

// ─── Formatters ───────────────────────────────────────────────

/** Format paise (integer) → ₹X,XX,XXX */
export function formatPaise(paise: number): string {
  const rupees = paise / 100;
  return `₹${rupees.toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

/** Format a date string → "15 Nov" */
export function formatShortDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  });
}

/** Format auction scheduled_at → "Starts in 4 hours" or "Tomorrow at 10:00 AM" */
export function formatAuctionTime(scheduledAt: string): string {
  const now = new Date();
  const scheduled = new Date(scheduledAt);
  const diffMs = scheduled.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours < 1) return `Starts in ${Math.round(diffMs / 60000)} mins`;
  if (diffHours < 24) return `Starts in ${Math.round(diffHours)} hours`;
  if (diffHours < 48) {
    const time = scheduled.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    return `Tomorrow at ${time}`;
  }
  return formatShortDate(scheduledAt);
}
