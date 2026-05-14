import { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Svg, { Path } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../lib/supabase';
import { Colors, Shadows } from '../../lib/constants';
import { formatPaise } from '../../lib/hooks/useDashboard';
import { useMemberSession } from '../../lib/MemberSessionContext';

// ─── Types ────────────────────────────────────────────────────
type AuctionDetail = {
  id: string;
  chit_group_id: string;
  scheduled_at: string;
  closes_at: string | null;
  status: string;
  min_bid: number;
  max_bid: number | null;
  current_bid: number;
  chit_group: { name: string; value: number; duration_months: number } | null;
  is_joined: boolean;
  my_bids: { bid_amount: number; placed_at: string }[];
};

// ─── Hook: Live Upcoming Auctions ─────────────────────────────
function useUpcomingAuctionsList(memberId: string | null) {
  return useQuery<AuctionDetail[]>({
    queryKey: ['auctions-list', memberId],
    enabled: !!memberId,
    queryFn: async () => {
      if (!memberId) return [];
      const { data: memberGroups, error: groupError } = await supabase
        .from('chit_members')
        .select('chit_group_id')
        .eq('customer_id', memberId);
      if (groupError) throw groupError;
      const groupIds = (memberGroups || []).map((row: { chit_group_id: string }) => row.chit_group_id);
      if (groupIds.length === 0) return [];

      const { data, error } = await supabase
        .from('auctions')
        .select('id, chit_group_id, scheduled_at, closes_at, status, min_bid, max_bid, current_bid, chit_group:chit_groups(name, value, duration_months)')
        .in('chit_group_id', groupIds)
        .in('status', ['upcoming', 'live'])
        .order('scheduled_at', { ascending: true })
        .limit(10);
      if (error) throw error;
      const auctions = (data ?? []) as unknown as AuctionDetail[];
      if (auctions.length === 0) return [];

      const auctionIds = auctions.map((a) => a.id);

      const { data: joinedRows } = await supabase
        .from('auction_participants')
        .select('auction_id')
        .eq('customer_id', memberId)
        .in('auction_id', auctionIds);

      const { data: bidRows } = await supabase
        .from('auction_bids')
        .select('auction_id, bid_amount, placed_at')
        .eq('customer_id', memberId)
        .in('auction_id', auctionIds)
        .order('placed_at', { ascending: false });

      const joinedSet = new Set((joinedRows || []).map((row: { auction_id: string }) => row.auction_id));
      const bidsByAuction = (bidRows || []).reduce((acc: Record<string, { bid_amount: number; placed_at: string }[]>, row: any) => {
        acc[row.auction_id] = acc[row.auction_id] || [];
        acc[row.auction_id].push({ bid_amount: row.bid_amount, placed_at: row.placed_at });
        return acc;
      }, {});

      return auctions.map((auction) => ({
        ...auction,
        is_joined: joinedSet.has(auction.id),
        my_bids: bidsByAuction[auction.id] || [],
      }));
    },
    refetchInterval: 30000,
  });
}

function useJoinAuction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ auctionId, customerId }: { auctionId: string; customerId: string }) => {
      const { error } = await supabase.from('auction_participants').insert({
        auction_id: auctionId,
        customer_id: customerId,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auctions-list'] }),
    onError: (e: Error) => Alert.alert('Join Error', e.message),
  });
}

function usePlaceBid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ auctionId, amount, customerId, bidderName }: { auctionId: string; amount: number; customerId: string; bidderName?: string }) => {
      const { error } = await supabase.from('auction_bids').insert({
        auction_id: auctionId,
        customer_id: customerId,
        bid_amount: amount,
        bidder_name: bidderName || null,
      });
      if (error) throw new Error(error.message);
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
function Countdown({ targetAt }: { targetAt: string }) {
  const [timeLeft, setTimeLeft] = useState({ mins: 0, secs: 0 });
  useEffect(() => {
    const update = () => {
      const diff = new Date(targetAt).getTime() - Date.now();
      if (diff <= 0) { setTimeLeft({ mins: 0, secs: 0 }); return; }
      setTimeLeft({ mins: Math.floor(diff / 60000), secs: Math.floor((diff % 60000) / 1000) });
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [targetAt]);
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
  const { memberId, memberProfile } = useMemberSession();
  const { mutate: placeBid, isPending } = usePlaceBid();
  const { mutate: joinAuction, isPending: joining } = useJoinAuction();
  const [bidAmount, setBidAmount] = useState('');
  const group = auction.chit_group;
  const isLive = auction.status === 'live';
  const currentBid = auction.current_bid || 0;
  const minBid = auction.min_bid || 0;
  const maxBid = auction.max_bid && auction.max_bid > 0 ? auction.max_bid : null;
  const lowestBid = currentBid > 0 ? currentBid : null;
  const progress = lowestBid ? Math.min(lowestBid / (group?.value ?? 1), 1) : 0;
  const targetAt = isLive && auction.closes_at ? auction.closes_at : auction.scheduled_at;

  const handleJoin = () => {
    if (!memberId) {
      Alert.alert('Login Required', 'Please log in to join this auction.');
      return;
    }
    joinAuction({ auctionId: auction.id, customerId: memberId });
  };

  const handleBid = () => {
    if (!auction.is_joined) {
      Alert.alert('Join Required', 'Join this auction before placing a bid.');
      return;
    }
    if (!isLive) {
      Alert.alert('Auction Not Live', 'Bidding opens once the auction is live.');
      return;
    }
    const amountPaise = Math.round(Number(bidAmount) * 100);
    if (Number.isNaN(amountPaise) || amountPaise <= 0) {
      Alert.alert('Invalid Amount', 'Enter a valid bid amount.');
      return;
    }
    if (amountPaise < minBid) {
      Alert.alert('Bid Too Low', `Minimum bid is ${formatPaise(minBid)}.`);
      return;
    }
    if (maxBid && amountPaise > maxBid) {
      Alert.alert('Bid Too High', `Maximum bid is ${formatPaise(maxBid)}.`);
      return;
    }
    if (lowestBid && amountPaise >= lowestBid) {
      Alert.alert('Bid Must Be Lower', `Current lowest bid is ${formatPaise(lowestBid)}.`);
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Alert.alert('Place Bid', `Bid ${formatPaise(amountPaise)} on ${group?.name ?? 'this auction'}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        onPress: () => {
          if (!memberId) {
            Alert.alert('Login Required', 'Please log in to place a bid.');
            return;
          }
          placeBid({
            auctionId: auction.id,
            amount: amountPaise,
            customerId: memberId,
            bidderName: memberProfile?.full_name || undefined,
          });
          setBidAmount('');
        },
      },
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
            <Text style={s.bidRowLabel}>{isLive ? 'CLOSES IN' : 'STARTS IN'}</Text>
            <Countdown targetAt={targetAt} />
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.bidRowLabel}>CURRENT LOWEST BID</Text>
            <Text style={s.currentBidAmt}>{lowestBid ? formatPaise(lowestBid) : '—'}</Text>
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
            <Text style={s.statVal}>{formatPaise(minBid)}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.statLabel}>MAX BID</Text>
            <Text style={[s.statVal, { color: Colors.primary }]}>
              {maxBid ? formatPaise(maxBid) : 'No Max'}
            </Text>
          </View>
        </View>
      </View>

      {/* Join + Bid */}
      {!auction.is_joined ? (
        <TouchableOpacity
          style={[s.placeBidBtn, { backgroundColor: '#0F766E' }]}
          onPress={handleJoin}
          activeOpacity={0.9}
          disabled={joining}
        >
          <Text style={[s.placeBidLeft, { color: '#FFFFFF' }]}>{joining ? 'Joining...' : 'Join Auction'}</Text>
        </TouchableOpacity>
      ) : (
        <View style={s.bidInputCard}>
          <Text style={s.bidInputLabel}>Your Bid (₹)</Text>
          <TextInput
            style={s.bidInput}
            keyboardType="numeric"
            placeholder="Enter amount"
            value={bidAmount}
            onChangeText={setBidAmount}
          />
          <TouchableOpacity
            style={[s.placeBidBtn, (!isLive || isPending) && { opacity: 0.6 }]}
            onPress={handleBid}
            activeOpacity={0.9}
            disabled={!isLive || isPending}
          >
            <Text style={s.placeBidLeft}>{isLive ? 'Place Bid' : 'Waiting to Open'}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={s.placeBidRight}>{lowestBid ? formatPaise(lowestBid) : formatPaise(minBid)}</Text>
              <Svg width={22} height={22} viewBox="0 0 24 24" fill={Colors.primary}>
                <Path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z" />
              </Svg>
            </View>
          </TouchableOpacity>
        </View>
      )}

      {/* My Bid History */}
      <View style={s.feedSection}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={s.feedTitle}>My Bid History</Text>
          <Text style={s.feedCount}>{auction.my_bids.length} BIDS</Text>
        </View>
        {auction.my_bids.length === 0 ? (
          <Text style={s.emptySub}>No bids placed yet.</Text>
        ) : (
          auction.my_bids.map((entry, i) => (
            <View key={`${entry.placed_at}-${i}`} style={s.feedRow}>
              <View style={s.feedAvatar}><Text style={s.feedAvatarTxt}>ME</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={s.feedName}>{formatPaise(entry.bid_amount)}</Text>
                <Text style={s.feedTime}>
                  {new Date(entry.placed_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
              <Text style={[s.feedAmt, { color: Colors.primary }]}>Placed</Text>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────
export default function AuctionsScreen() {
  const { memberId, isLoading: sessionLoading } = useMemberSession();
  const { data: auctions, isLoading } = useUpcomingAuctionsList(memberId);
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
        {sessionLoading || isLoading ? (
          <View style={{ alignItems: 'center', paddingVertical: 80 }}>
            <Text style={{ fontSize: 32 }}>⚡</Text>
            <Text style={s.emptyTitle}>Loading auctions…</Text>
          </View>
        ) : !memberId ? (
          <View style={s.emptyContainer}>
            <Text style={{ fontSize: 40 }}>🔒</Text>
            <Text style={s.emptyTitle}>Sign in to view auctions</Text>
            <Text style={s.emptySub}>Please log in to see live and upcoming auctions.</Text>
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
  bidInputCard: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16, gap: 12, borderWidth: 1, borderColor: '#F1F5F9' },
  bidInputLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: '#64748B', letterSpacing: 0.4 },
  bidInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    color: '#0B1C30',
  },

  // Empty
  emptyContainer: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyTitle: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 18, color: Colors.primary, marginTop: 8 },
  emptySub: { fontFamily: 'Inter_400Regular', fontSize: 13, color: '#94A3B8', textAlign: 'center' },
});
