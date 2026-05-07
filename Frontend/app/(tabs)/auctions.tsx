import { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Platform, Alert, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Svg, { Path, Circle } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../lib/supabase';
import { Colors, Shadows } from '../../lib/constants';
import { formatPaise } from '../../lib/hooks/useDashboard';

// ─── Types ────────────────────────────────────────────────────
type AuctionDetail = {
  id: string;
  chit_group_id: string;
  scheduled_at: string;
  status: string;
  min_bid: number;
  current_bid: number;
  chit_group: { name: string; value: number; duration_months: number } | null;
};

type BidEntry = {
  id: string;
  bid_amount: number;
  placed_at: string;
  user_id: string;
  initials: string;
  display_name: string;
};

// ─── Hook: Live Upcoming Auctions ─────────────────────────────
function useUpcomingAuctionsList() {
  return useQuery<AuctionDetail[]>({
    queryKey: ['auctions-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('auctions')
        .select('id, chit_group_id, scheduled_at, status, min_bid, current_bid, chit_group:chit_groups(name, value, duration_months)')
        .in('status', ['upcoming', 'live'])
        .order('scheduled_at', { ascending: true })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as unknown as AuctionDetail[];
    },
    refetchInterval: 30000,
  });
}

function usePlaceBid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ auctionId, amount }: { auctionId: string; amount: number }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase.from('auction_bids').insert({
        auction_id: auctionId, user_id: user.id, bid_amount: amount,
      });
      if (error) throw new Error(error.message);
      // Update current_bid on auction
      await supabase.from('auctions').update({ current_bid: amount }).eq('id', auctionId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auctions-list'] }),
    onError: (e: Error) => Alert.alert('Bid Error', e.message),
  });
}

// ─── Live Pulse Dot ───────────────────────────────────────────
function LiveDot() {
  const anim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.2, duration: 800, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return (
    <View style={s.liveDotWrap}>
      <Animated.View style={[s.liveDotPing, { opacity: anim }]} />
      <View style={s.liveDot} />
    </View>
  );
}

// ─── Countdown ────────────────────────────────────────────────
function Countdown({ scheduledAt }: { scheduledAt: string }) {
  const [timeLeft, setTimeLeft] = useState({ mins: 0, secs: 0 });
  useEffect(() => {
    const update = () => {
      const diff = new Date(scheduledAt).getTime() - Date.now();
      if (diff <= 0) { setTimeLeft({ mins: 0, secs: 0 }); return; }
      setTimeLeft({ mins: Math.floor(diff / 60000), secs: Math.floor((diff % 60000) / 1000) });
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [scheduledAt]);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    <View style={s.countdownRow}>
      <Text style={s.countdownNum}>{pad(timeLeft.mins)}</Text>
      <Text style={s.countdownColon}>:</Text>
      <Text style={s.countdownNum}>{pad(timeLeft.secs)}</Text>
      <Text style={s.countdownUnit}>Minutes</Text>
    </View>
  );
}

// ─── Auction Card ─────────────────────────────────────────────
function AuctionCard({ auction }: { auction: AuctionDetail }) {
  const { mutate: placeBid, isPending } = usePlaceBid();
  const group = auction.chit_group;
  const isLive = auction.status === 'live';
  const currentBid = auction.current_bid;
  const minBid = auction.min_bid;
  const nextBid = currentBid > 0 ? currentBid + 500 : minBid;
  const progress = currentBid > 0 ? Math.min(currentBid / (group?.value ?? 1), 1) : 0;

  const handleBid = (extra: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    const amount = (currentBid || minBid) + extra;
    Alert.alert('Place Bid', `Bid ${formatPaise(amount * 100)} on ${group?.name ?? 'this auction'}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', onPress: () => placeBid({ auctionId: auction.id, amount: amount * 100 }) },
    ]);
  };

  return (
    <View style={s.auctionCard}>
      {/* Header */}
      <View style={s.auctionCardHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {isLive && <LiveDot />}
          <Text style={[s.liveLabel, { color: isLive ? '#EF4444' : Colors.primary }]}>
            {isLive ? 'LIVE AUCTION NOW' : 'UPCOMING'}
          </Text>
        </View>
      </View>
      <Text style={s.auctionTitle}>{group?.name ?? 'Auction'}</Text>
      <Text style={s.auctionSub}>
        Group Value: {formatPaise(group?.value ?? 0)} • Month 1/{group?.duration_months ?? '—'}
      </Text>

      {/* Main Card */}
      <View style={s.mainCard}>
        <View style={s.bidRow}>
          <View>
            <Text style={s.bidRowLabel}>TIME REMAINING</Text>
            <Countdown scheduledAt={auction.scheduled_at} />
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.bidRowLabel}>CURRENT BID</Text>
            <Text style={s.currentBidAmt}>{formatPaise(currentBid * 100)}</Text>
          </View>
        </View>

        {/* Progress Bar */}
        <View style={s.progressTrack}>
          <View style={[s.progressFill, { width: `${Math.round(progress * 100)}%` as any }]} />
        </View>

        {/* Stats */}
        <View style={s.statsGrid}>
          <View>
            <Text style={s.statLabel}>MIN BID</Text>
            <Text style={s.statVal}>{formatPaise(minBid * 100)}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.statLabel}>MAX DIVIDEND</Text>
            <Text style={[s.statVal, { color: Colors.primary }]}>
              {formatPaise(Math.round((group?.value ?? 0) * 0.036))}
            </Text>
          </View>
        </View>
      </View>

      {/* AI Assistant */}
      <View style={s.aiCard}>
        <View style={s.aiCardBg} />
        <View style={s.aiContent}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 16 }}>✨</Text>
            <Text style={s.aiCardLabel}>BIDDING ASSISTANT</Text>
          </View>
          <Text style={s.aiCardTitle}>Bid +₹500 to maintain lead</Text>
          <Text style={s.aiCardSub}>Winning now secures an extra ₹1,200 in dividend yield based on current trends.</Text>
          <View style={s.quickBidRow}>
            {[500, 1000].map(amt => (
              <TouchableOpacity key={amt} style={s.quickBidBtn}
                onPress={() => handleBid(amt)} activeOpacity={0.85}>
                <Text style={s.quickBidTxt}>+ ₹{amt.toLocaleString('en-IN')}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {/* Activity Feed */}
      <View style={s.feedSection}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={s.feedTitle}>Activity Feed</Text>
          <Text style={s.feedCount}>12 ACTIVE BIDDERS</Text>
        </View>
        {[
          { initials: 'RA', name: 'Rahul A.', time: 'Just now', amt: formatPaise((currentBid || minBid) * 100), opacity: 1 },
          { initials: 'SK', name: 'Suresh K.', time: '2 mins ago', amt: formatPaise(((currentBid || minBid) - 500) * 100), opacity: 0.75 },
          { initials: 'MP', name: 'Meera P.', time: '4 mins ago', amt: formatPaise(((currentBid || minBid) - 1000) * 100), opacity: 0.5 },
        ].map((entry, i) => (
          <View key={i} style={[s.feedRow, { opacity: entry.opacity }]}>
            <View style={s.feedAvatar}><Text style={s.feedAvatarTxt}>{entry.initials}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={s.feedName}>{entry.name}</Text>
              <Text style={s.feedTime}>{entry.time}</Text>
            </View>
            <Text style={[s.feedAmt, { color: i === 0 ? Colors.primary : '#94A3B8' }]}>{entry.amt}</Text>
          </View>
        ))}
      </View>

      {/* Place Bid CTA */}
      <TouchableOpacity style={s.placeBidBtn}
        onPress={() => handleBid(500)} activeOpacity={0.9}>
        <Text style={s.placeBidLeft}>Place Bid</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={s.placeBidRight}>{formatPaise(nextBid * 100)}</Text>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill={Colors.primary}>
            <Path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z" />
          </Svg>
        </View>
      </TouchableOpacity>
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────
export default function AuctionsScreen() {
  const { data: auctions, isLoading } = useUpcomingAuctionsList();
  const queryClient = useQueryClient();

  useEffect(() => {
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ['auctions-list'] });
    };

    const channel = supabase
      .channel('member-auctions-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'auctions' }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'auction_bids' }, invalidate)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.appBar}>
        <Text style={s.appBarTitle}>Live Auctions</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <LiveDot />
          <Text style={s.liveCount}>{auctions?.filter(a => a.status === 'live').length ?? 0} Live</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <View style={{ alignItems: 'center', paddingVertical: 80 }}>
            <Text style={{ fontSize: 32 }}>⚡</Text>
            <Text style={s.emptyTitle}>Loading auctions…</Text>
          </View>
        ) : !auctions || auctions.length === 0 ? (
          <View style={s.emptyContainer}>
            <Text style={{ fontSize: 40 }}>🔨</Text>
            <Text style={s.emptyTitle}>No auctions right now</Text>
            <Text style={s.emptySub}>Check back soon. New auctions open monthly.</Text>
          </View>
        ) : (
          auctions.map(a => <AuctionCard key={a.id} auction={a} />)
        )}
        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  appBar: { height: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, backgroundColor: 'rgba(255,255,255,0.92)', borderBottomWidth: 1, borderBottomColor: 'rgba(226,232,240,0.5)', ...Shadows.subtle },
  appBarTitle: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 22, color: Colors.primary, letterSpacing: -0.5 },
  liveCount: { fontFamily: 'Inter_700Bold', fontSize: 11, color: '#EF4444' },

  scroll: { padding: 20, gap: 20 },

  // Live Dot
  liveDotWrap: { width: 14, height: 14, alignItems: 'center', justifyContent: 'center' },
  liveDotPing: { position: 'absolute', width: 14, height: 14, borderRadius: 7, backgroundColor: '#EF4444' },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' },

  // Auction Card
  auctionCard: { backgroundColor: '#FFF', borderRadius: 24, padding: 20, gap: 14, borderWidth: 1, borderColor: '#F1F5F9', ...Shadows.subtle },
  auctionCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveLabel: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase' },
  auctionTitle: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 24, color: '#0B1C30', letterSpacing: -0.5 },
  auctionSub: { fontFamily: 'Inter_400Regular', fontSize: 13, color: '#64748B' },

  // Main card
  mainCard: { backgroundColor: '#F8FAFC', borderRadius: 18, padding: 16, gap: 12, borderWidth: 1, borderColor: '#F1F5F9' },
  bidRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  bidRowLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 9, color: '#94A3B8', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 },
  countdownRow: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  countdownNum: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 30, color: Colors.secondary, letterSpacing: -1 },
  countdownColon: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 24, color: Colors.secondary },
  countdownUnit: { fontFamily: 'Inter_400Regular', fontSize: 12, color: '#64748B', marginLeft: 6 },
  currentBidAmt: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 24, color: Colors.primary, letterSpacing: -0.5 },
  progressTrack: { height: 8, backgroundColor: '#E2E8F0', borderRadius: 100, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: 100 },
  statsGrid: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8, borderTopWidth: 1, borderTopColor: '#E2E8F0' },
  statLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 9, color: '#94A3B8', letterSpacing: 0.8, textTransform: 'uppercase' },
  statVal: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 18, color: '#0B1C30' },

  // AI card
  aiCard: { backgroundColor: Colors.primary, borderRadius: 20, overflow: 'hidden' },
  aiCardBg: { position: 'absolute', top: -20, right: -20, width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(255,255,255,0.05)' },
  aiContent: { padding: 16, gap: 6 },
  aiCardLabel: { fontFamily: 'Inter_700Bold', fontSize: 10, color: '#FFFFFF', letterSpacing: 1.2, textTransform: 'uppercase' },
  aiCardTitle: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 17, color: '#FFFFFF' },
  aiCardSub: { fontFamily: 'Inter_400Regular', fontSize: 12, color: 'rgba(255,255,255,0.75)', lineHeight: 18 },
  quickBidRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  quickBidBtn: { backgroundColor: Colors.secondary, paddingHorizontal: 18, paddingVertical: 9, borderRadius: 10 },
  quickBidTxt: { fontFamily: 'Inter_700Bold', fontSize: 13, color: Colors.primary },

  // Feed
  feedSection: { gap: 10 },
  feedTitle: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 16, color: '#0B1C30' },
  feedCount: { fontFamily: 'Inter_700Bold', fontSize: 10, color: Colors.primary, letterSpacing: 0.8 },
  feedRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#F8FAFC', padding: 12, borderRadius: 14, borderWidth: 1, borderColor: '#F1F5F9' },
  feedAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center' },
  feedAvatarTxt: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 13, color: '#64748B' },
  feedName: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#0B1C30' },
  feedTime: { fontFamily: 'Inter_400Regular', fontSize: 11, color: '#94A3B8' },
  feedAmt: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 14 },

  // CTA
  placeBidBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.secondary, borderRadius: 18, paddingHorizontal: 20, height: 60 },
  placeBidLeft: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 18, color: Colors.primary },
  placeBidRight: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 18, color: Colors.primary },

  // Empty
  emptyContainer: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyTitle: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 18, color: Colors.primary, marginTop: 8 },
  emptySub: { fontFamily: 'Inter_400Regular', fontSize: 13, color: '#94A3B8', textAlign: 'center' },
});
