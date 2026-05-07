import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { formatPaise, formatShortDate } from '../../../lib/hooks/useDashboard';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator, Platform, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Svg, { Path, Circle } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { Colors, Shadows } from '../../../lib/constants';
import { useMemberSession } from '../../../lib/MemberSessionContext';

const RAZORPAY_KEY = 'rzp_test_SmauVIQGRqu5gR';

type PaymentRow = {
  id: string;
  month_number: number;
  due_date: string;
  amount: number;
  paid: boolean;
  paid_at: string | null;
  dividend_amount?: number;
};

type ChitDetailData = {
  id: string;
  current_month: number;
  bid_status: string;
  chit_group: {
    id: string;
    name: string;
    value: number;
    duration_months: number;
    monthly_installment: number;
    status: string;
    start_date?: string | null;
  };
  payments: PaymentRow[];
};

/** Auto-generate and save payment schedule rows if they don't exist yet */
async function ensurePaymentSchedules(membershipId: string, group: ChitDetailData['chit_group']): Promise<PaymentRow[]> {
  const { data: existing } = await supabase.from('payment_schedules')
    .select('*').eq('chit_member_id', membershipId).order('month_number');

  if (existing && existing.length > 0) return existing as PaymentRow[];

  // Generate based on chit group start_date
  const base = group.start_date ? new Date(group.start_date) : new Date();
  base.setDate(1); // Always start from the 1st

  const rows: Omit<PaymentRow, 'id'>[] = [];
  for (let i = 0; i < group.duration_months; i++) {
    const dueDate = new Date(base);
    dueDate.setMonth(dueDate.getMonth() + i + 1);
    dueDate.setDate(0); // Last day of the month
    rows.push({
      month_number: i + 1,
      due_date: dueDate.toISOString().split('T')[0],
      amount: group.monthly_installment,
      paid: false,
      paid_at: null,
      dividend_amount: 0,
    } as any);
  }

  const toInsert = rows.map(r => ({ ...r, chit_member_id: membershipId }));
  const { data: inserted, error } = await supabase.from('payment_schedules').insert(toInsert).select();
  if (error) {
    // Return virtual rows if insert fails (e.g., RLS)
    return rows.map((r, idx) => ({ ...r, id: `virtual-${idx}` } as PaymentRow));
  }
  return (inserted ?? []) as PaymentRow[];
}

function useChitDetail(membershipId: string, memberId: string | null) {
  return useQuery<ChitDetailData | null>({
    queryKey: ['chit-detail', membershipId, memberId],
    queryFn: async () => {
      if (!memberId) return null;
      const { data: m } = await supabase.from('chit_members')
        .select('id, current_month, bid_status, chit_group:chit_groups(id,name,value,duration_months,monthly_installment,status,start_date)')
        .eq('id', membershipId)
        .eq('customer_id', memberId)
        .single();
      if (!m) return null;
      const group = (m as any).chit_group;
      const payments = await ensurePaymentSchedules(membershipId, group);
      return { ...(m as any), payments };
    },
    enabled: !!membershipId && !!memberId,
  });
}

/** Calculate the display month period for a payment row (1st to last day of that month) */
function getMonthPeriod(payment: PaymentRow): { from: string; to: string; monthName: string } {
  const dueDate = new Date(payment.due_date);
  // dueDate is the last day of the month (we set it to 0 = last day when generating)
  const endOfMonth = new Date(dueDate);
  const startOfMonth = new Date(dueDate.getFullYear(), dueDate.getMonth(), 1);
  const fmt = (d: Date) => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const monthName = dueDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  return { from: fmt(startOfMonth), to: fmt(endOfMonth), monthName };
}

function MonthTimelineItem({
  p, isCurrentDue, onPay, paying,
}: { p: PaymentRow; isCurrentDue: boolean; onPay: (p: PaymentRow) => void; paying: boolean; }) {
  const period = getMonthPeriod(p);
  const isPaid = p.paid;
  const today = Date.now();
  const daysLeft = Math.ceil((new Date(p.due_date).getTime() - today) / 86400000);
  const overdue = daysLeft < 0 && !isPaid;
  const canPay = (isCurrentDue || overdue) && !isPaid;
  const isUpcoming = !isPaid && !isCurrentDue && !overdue;

  return (
    <View style={ts.item}>
      {/* Dot */}
      <View style={ts.lineCol}>
        <View style={[ts.dot, isPaid && ts.dotPaid, canPay && ts.dotCurrent, isUpcoming && ts.dotUpcoming]}>
          {isPaid && <Svg width={10} height={10} viewBox="0 0 24 24" fill="#FFF"><Path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></Svg>}
          {canPay && <View style={ts.dotInner} />}
        </View>
      </View>

      {/* Card */}
      <View style={[
        ts.card,
        isPaid && ts.cardPaid,
        canPay && !overdue && ts.cardCurrent,
        overdue && ts.cardOverdue,
        isUpcoming && ts.cardUpcoming,
      ]}>
        {/* Month name + amount */}
        <View style={ts.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={[ts.monthName, isUpcoming && { color: '#94A3B8' }, overdue && { color: '#B91C1C' }]}>
              {period.monthName}
            </Text>
            <Text style={[ts.monthNumber, isUpcoming && { color: '#CBD5E1' }]}>
              Month {p.month_number} · {period.from} – {period.to}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <Text style={[
              ts.amount,
              isPaid && { color: Colors.secondary },
              canPay && { color: overdue ? '#EF4444' : Colors.primary, fontSize: 20 },
              isUpcoming && { color: '#94A3B8' },
            ]}>
              {formatPaise(p.amount)}
            </Text>
            {overdue && <View style={ts.overdueBadge}><Text style={ts.overdueText}>OVERDUE</Text></View>}
            {isCurrentDue && !overdue && daysLeft >= 0 && (
              <View style={ts.dueBadge}><Text style={ts.dueText}>DUE IN {daysLeft}D</Text></View>
            )}
          </View>
        </View>

        {/* Divider */}
        <View style={ts.innerDivider} />

        {/* Action */}
        {isPaid ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Svg width={16} height={16} viewBox="0 0 24 24" fill={Colors.secondary}>
              <Path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
            </Svg>
            <Text style={ts.statusPaid}>Paid on {formatShortDate(p.paid_at!)}</Text>
            {(p.dividend_amount ?? 0) > 0 && (
              <View style={ts.dividendBadge}>
                <Text style={ts.dividendText}>+{formatPaise(p.dividend_amount!)} dividend</Text>
              </View>
            )}
          </View>
        ) : canPay ? (
          <TouchableOpacity style={[ts.payBtn, overdue && ts.payBtnOverdue, paying && { opacity: 0.6 }]}
            onPress={() => onPay(p)} disabled={paying} activeOpacity={0.85}>
            {paying ? <ActivityIndicator color="#FFF" size="small" /> : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'center' }}>
                <Svg width={18} height={18} viewBox="0 0 24 24" fill="#FFF">
                  <Path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
                </Svg>
                <Text style={ts.payBtnText}>
                  {overdue ? 'PAY NOW · OVERDUE' : 'PAY NOW'}
                </Text>
                <View style={ts.payBtnAmtBadge}>
                  <Text style={ts.payBtnAmt}>{formatPaise(p.amount)}</Text>
                </View>
              </View>
            )}
          </TouchableOpacity>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Svg width={14} height={14} viewBox="0 0 24 24" fill="#94A3B8">
              <Path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z" />
            </Svg>
            <Text style={ts.statusScheduled}>Scheduled · Not yet due</Text>
          </View>
        )}
      </View>
    </View>
  );
}

export default function ChitDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { memberId, memberProfile } = useMemberSession();
  const { data, isLoading } = useChitDetail(id ?? '', memberId);
  const [payingId, setPayingId] = useState<string | null>(null);

  // ── Real-time subscription ───────────────────────────────────
  useEffect(() => {
    if (!id) return;
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ['chit-detail', id, memberId] });
      queryClient.invalidateQueries({ queryKey: ['active-chits', memberId] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats', memberId] });
    };
    const channel = supabase
      .channel(`chit-detail-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chit_members', filter: `id=eq.${id}` }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_schedules', filter: `chit_member_id=eq.${id}` }, invalidate)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, memberId, queryClient]);

  // ── Razorpay Payment ─────────────────────────────────────────
  const handlePayment = async (payment: PaymentRow) => {
    if (!memberProfile) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const amountInPaise = payment.amount; // already stored in paise
    const group = data?.chit_group;

    const markPaid = async (paymentId?: string) => {
      const { error } = await supabase
        .from('payment_schedules')
        .update({
          paid: true,
          paid_at: new Date().toISOString(),
        })
        .eq('id', payment.id);
      if (error) throw error;

      await supabase.from('chit_member_transactions').insert([{
        chit_member_id: id,
        amount: amountInPaise,
        payment_type: 'installment',
        status: 'completed',
        notes: `Month ${payment.month_number}${paymentId ? ` – Razorpay: ${paymentId}` : ''}`,
      }]); // non-critical, ignore any insert errors

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('✅ Payment Successful!', `Month ${payment.month_number} installment of ${formatPaise(payment.amount)} paid.`);
      queryClient.invalidateQueries({ queryKey: ['chit-detail', id, memberId] });
      queryClient.invalidateQueries({ queryKey: ['active-chits', memberId] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats', memberId] });
    };

    setPayingId(payment.id);
    try {
      // Try native Razorpay first, only if the native module is actually linked
      let RazorpayCheckout: any = null;
      if (require('react-native').NativeModules.RNRazorpayCheckout) {
        try { 
          RazorpayCheckout = require('react-native-razorpay').default; 
        } catch (e) { console.log('Razorpay require failed:', e); }
      }

      if (RazorpayCheckout && RazorpayCheckout.open) {
        const options = {
          description: `VSYK Chits – ${group?.name ?? 'Chit'} – Month ${payment.month_number}`,
          currency: 'INR',
          key: RAZORPAY_KEY,
          amount: amountInPaise,
          name: 'VSYK Chit Funds',
          prefill: {
            email: memberProfile.email ?? 'member@vsyk.in',
            contact: memberProfile.phone ?? '',
            name: memberProfile.full_name ?? '',
          },
          theme: { color: '#0B1C30' },
        };
        const paymentData = await RazorpayCheckout.open(options);
        await markPaid(paymentData?.razorpay_payment_id);
      } else {
        // Expo Go fallback — simulate with confirmation
        Alert.alert(
          'Confirm Payment',
          `Pay ${formatPaise(payment.amount)} for Month ${payment.month_number}?\n\n(Test Mode – No actual charge)`,
          [
            { text: 'Cancel', style: 'cancel', onPress: () => setPayingId(null) },
            {
              text: 'Pay Now (Test)', onPress: async () => {
                try {
                  await markPaid('TEST_' + Date.now());
                } catch (err: any) {
                  Alert.alert('Error', err.message);
                } finally {
                  setPayingId(null);
                }
              },
            },
          ],
        );
        return; // early return; setPayingId handled inside
      }
    } catch (e: any) {
      if (e?.code !== 'PAYMENT_CANCELLED') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert('Payment Failed', e?.description ?? e?.message ?? 'Something went wrong. Please try again.');
      }
    } finally {
      setPayingId(null);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={s.safe}>
        <ActivityIndicator style={{ flex: 1 }} color={Colors.primary} size="large" />
      </SafeAreaView>
    );
  }
  if (!data) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.appBar}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Svg width={24} height={24} viewBox="0 0 24 24" fill={Colors.primary}>
              <Path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
            </Svg>
          </TouchableOpacity>
          <Text style={s.appBarTitle}>Chit Details</Text>
          <View style={{ width: 40 }} />
        </View>
        <Text style={{ textAlign: 'center', marginTop: 80, color: '#94A3B8', fontFamily: 'Inter_400Regular' }}>
          Chit group not found or access denied.
        </Text>
      </SafeAreaView>
    );
  }

  const group = data.chit_group;
  const payments: PaymentRow[] = data.payments;
  const currentMonth: number = data.current_month;

  // First unpaid payment that is currently due
  const firstUnpaid = payments.find(p => !p.paid);
  const totalPaid = payments.filter(p => p.paid).reduce((sum, p) => sum + p.amount, 0);
  const totalDue = payments.filter(p => !p.paid).reduce((sum, p) => sum + p.amount, 0);
  const paidCount = payments.filter(p => p.paid).length;

  const isCurrentDue = (p: PaymentRow) =>
    firstUnpaid?.id === p.id;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {/* App Bar */}
      <View style={s.appBar}>
        <TouchableOpacity onPress={() => { Haptics.selectionAsync(); router.back(); }} style={s.backBtn}>
          <Svg width={24} height={24} viewBox="0 0 24 24" fill={Colors.primary}>
            <Path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
          </Svg>
        </TouchableOpacity>
        <Text style={s.appBarTitle} numberOfLines={1}>{group.name}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Hero Stats */}
        <View style={s.heroCard}>
          <View style={s.heroTop}>
            <View>
              <Text style={s.heroLabel}>CHIT VALUE</Text>
              <Text style={s.heroValue}>{formatPaise(group.value)}</Text>
            </View>
            <View style={[s.statusPill, group.status === 'active' && { backgroundColor: '#DCFCE7' }]}>
              <Text style={[s.statusPillText, group.status === 'active' && { color: '#16A34A' }]}>
                {group.status?.toUpperCase()}
              </Text>
            </View>
          </View>
          <View style={s.heroStats}>
            <View style={s.heroStat}>
              <Text style={s.heroStatLabel}>MONTHLY DUE</Text>
              <Text style={s.heroStatVal}>{formatPaise(group.monthly_installment)}</Text>
            </View>
            <View style={s.heroStatDivider} />
            <View style={s.heroStat}>
              <Text style={s.heroStatLabel}>DURATION</Text>
              <Text style={s.heroStatVal}>{group.duration_months} Months</Text>
            </View>
            <View style={s.heroStatDivider} />
            <View style={s.heroStat}>
              <Text style={s.heroStatLabel}>PROGRESS</Text>
              <Text style={s.heroStatVal}>{paidCount}/{group.duration_months}</Text>
            </View>
          </View>
          {/* Progress bar */}
          <View style={s.progressTrack}>
            <View style={[s.progressFill, { width: `${Math.min((paidCount / group.duration_months) * 100, 100)}%` as any }]} />
          </View>
        </View>

        {/* Summary Cards */}
        <View style={s.summaryRow}>
          <View style={[s.summaryCard, { borderLeftColor: Colors.secondary }]}>
            <Text style={s.summaryLabel}>TOTAL PAID</Text>
            <Text style={[s.summaryVal, { color: Colors.secondary }]}>{formatPaise(totalPaid)}</Text>
          </View>
          <View style={[s.summaryCard, { borderLeftColor: '#EF4444' }]}>
            <Text style={s.summaryLabel}>REMAINING</Text>
            <Text style={[s.summaryVal, { color: '#EF4444' }]}>{formatPaise(totalDue)}</Text>
          </View>
        </View>

        {/* Timeline Header */}
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>Payment Timeline</Text>
          <Text style={s.sectionSub}>{payments.length} installments</Text>
        </View>

        {/* Timeline */}
        <View style={ts.container}>
          {payments.length === 0 ? (
            <Text style={{ color: '#94A3B8', textAlign: 'center', padding: 24, fontFamily: 'Inter_400Regular' }}>
              No payment schedule found.
            </Text>
          ) : (
            payments.map((p, idx) => (
              <View key={p.id}>
                <MonthTimelineItem
                  p={p}
                  isCurrentDue={isCurrentDue(p)}
                  onPay={handlePayment}
                  paying={payingId === p.id}
                />
                {idx < payments.length - 1 && <View style={ts.connector} />}
              </View>
            ))
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Timeline Styles ───────────────────────────────────────────
const ts = StyleSheet.create({
  container: { paddingHorizontal: 4 },
  item: { flexDirection: 'row', gap: 12 },
  lineCol: { width: 28, alignItems: 'center', paddingTop: 8 },
  connector: { width: 2, height: 14, backgroundColor: '#E2E8F0', marginLeft: 13 },
  dot: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#F1F5F9', borderWidth: 2, borderColor: '#E2E8F0',
    alignItems: 'center', justifyContent: 'center',
  },
  dotPaid: { backgroundColor: Colors.secondary, borderColor: Colors.secondary },
  dotCurrent: { backgroundColor: '#FFF', borderColor: Colors.primary, borderWidth: 2.5 },
  dotUpcoming: { backgroundColor: '#F8FAFC', borderColor: '#CBD5E1' },
  dotInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.primary },

  card: {
    flex: 1, backgroundColor: '#FFF', borderRadius: 18,
    padding: 16, marginBottom: 0, borderWidth: 1, borderColor: '#F1F5F9',
    ...Shadows.subtle,
  },
  cardPaid: { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
  cardCurrent: { borderColor: Colors.primary, borderWidth: 1.5 },
  cardOverdue: { borderColor: '#FECACA', backgroundColor: '#FFF5F5', borderWidth: 1.5 },
  cardUpcoming: { backgroundColor: 'rgba(255,255,255,0.55)', borderStyle: 'dashed' },

  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  monthName: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 16, color: '#0B1C30' },
  monthNumber: { fontFamily: 'Inter_400Regular', fontSize: 11, color: '#6B7280', marginTop: 3 },
  amount: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 16, color: Colors.primary, textAlign: 'right' },

  innerDivider: { height: 1, backgroundColor: '#F1F5F9', marginVertical: 12 },

  statusPaid: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#16A34A' },
  statusScheduled: { fontFamily: 'Inter_400Regular', fontSize: 12, color: '#94A3B8' },

  // Full-width pay button — hard to miss
  payBtn: {
    width: '100%', paddingVertical: 14, borderRadius: 14,
    backgroundColor: Colors.primary, alignItems: 'center',
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 10, elevation: 6,
  },
  payBtnOverdue: { backgroundColor: '#EF4444', shadowColor: '#EF4444' },
  payBtnText: { fontFamily: 'Inter_700Bold', fontSize: 14, color: '#FFF', letterSpacing: 1 },
  payBtnAmtBadge: {
    backgroundColor: 'rgba(255,255,255,0.25)', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20,
  },
  payBtnAmt: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 13, color: '#FFF' },

  overdueBadge: { backgroundColor: '#FEE2E2', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  overdueText: { fontFamily: 'Inter_700Bold', fontSize: 9, color: '#B91C1C', letterSpacing: 0.5 },
  dueBadge: { backgroundColor: '#FEF3C7', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  dueText: { fontFamily: 'Inter_700Bold', fontSize: 9, color: '#92400E', letterSpacing: 0.5 },
  dividendBadge: { backgroundColor: '#DBEAFE', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  dividendText: { fontFamily: 'Inter_500Medium', fontSize: 11, color: '#1E40AF' },
});

// ── Screen Styles ─────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  appBar: {
    height: 64, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: 16,
    backgroundColor: 'rgba(255,255,255,0.95)', borderBottomWidth: 1,
    borderBottomColor: 'rgba(226,232,240,0.6)', ...Shadows.subtle,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  appBarTitle: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 18, color: '#0B1C30', flex: 1, textAlign: 'center' },

  scroll: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40, gap: 16 },

  heroCard: {
    backgroundColor: Colors.primary, borderRadius: 24, padding: 20, gap: 16,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25, shadowRadius: 16, elevation: 10,
  },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  heroLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 10, color: 'rgba(255,255,255,0.6)', letterSpacing: 1 },
  heroValue: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 32, color: '#FFF', letterSpacing: -1, marginTop: 4 },
  statusPill: { backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  statusPillText: { fontFamily: 'Inter_700Bold', fontSize: 10, color: '#FFF', letterSpacing: 1 },

  heroStats: { flexDirection: 'row', justifyContent: 'space-between' },
  heroStat: { flex: 1, alignItems: 'center', gap: 4 },
  heroStatLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 9, color: 'rgba(255,255,255,0.55)', letterSpacing: 0.8 },
  heroStatVal: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 16, color: '#FFF' },
  heroStatDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.15)' },

  progressTrack: { height: 4, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 100, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: Colors.secondary, borderRadius: 100 },

  summaryRow: { flexDirection: 'row', gap: 12 },
  summaryCard: {
    flex: 1, backgroundColor: '#FFF', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: '#F1F5F9', borderLeftWidth: 3, gap: 6, ...Shadows.subtle,
  },
  summaryLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 9, color: '#94A3B8', letterSpacing: 0.8, textTransform: 'uppercase' },
  summaryVal: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 20, letterSpacing: -0.5 },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 18, color: '#0B1C30' },
  sectionSub: { fontFamily: 'Inter_500Medium', fontSize: 12, color: '#94A3B8' },
});
