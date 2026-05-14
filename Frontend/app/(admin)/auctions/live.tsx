import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import Svg, { Path, Circle } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { apiPost } from '../../../lib/api';

export default function AdminLiveAuction() {
  const router = useRouter();
  const [auction, setAuction] = useState<any | null>(null);
  const [bids, setBids] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [declaring, setDeclaring] = useState(false);
  const [timeLeft, setTimeLeft] = useState('--:--');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLiveAuction = async () => {
    try {
      const { data: liveAuction, error: liveError } = await supabase
        .from('auctions')
        .select('*, chit_groups(name, group_code, value, capacity)')
        .eq('status', 'live')
        .order('scheduled_at', { ascending: true })
        .limit(1)
        .single();

      if (liveError && liveError.code !== 'PGRST116') throw liveError;

      if (liveAuction?.id) {
        setAuction(liveAuction);
        fetchBids(liveAuction.id);
        startTimer(liveAuction.scheduled_at, liveAuction.time_limit_mins, liveAuction.closes_at);
        return;
      }

      // Fallback: check for next upcoming if no live
      const { data: upcomingAuction, error: upcomingError } = await supabase
        .from('auctions')
        .select('*, chit_groups(name, group_code, value, capacity)')
        .eq('status', 'upcoming')
        .order('scheduled_at', { ascending: true })
        .limit(1)
        .single();

      if (upcomingError && upcomingError.code !== 'PGRST116') throw upcomingError;
      setAuction(upcomingAuction || null);
    } catch (err) {
      console.error('Error fetching live auction:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchBids = async (auctionId: string) => {
    try {
      const { data } = await supabase
        .from('auction_bids')
        .select('*, customers(full_name)')
        .eq('auction_id', auctionId)
        .order('bid_amount', { ascending: true }); 
      setBids(data || []);
    } catch (err) {
      console.error('Error fetching bids:', err);
    }
  };

  const startTimer = (scheduledAt: string, limitMins: number = 60, closesAt?: string | null) => {
    if (timerRef.current) clearInterval(timerRef.current);
    const endTime = closesAt 
      ? new Date(closesAt).getTime() 
      : new Date(scheduledAt).getTime() + (limitMins * 60 * 1000);

    timerRef.current = setInterval(() => {
      const remaining = endTime - Date.now();
      if (remaining <= 0) {
        setTimeLeft('00:00');
        clearInterval(timerRef.current!);
      } else {
        const m = Math.floor(remaining / 60000);
        const s = Math.floor((remaining % 60000) / 1000);
        setTimeLeft(`${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
      }
    }, 1000);
  };

  useEffect(() => {
    fetchLiveAuction();

    const bidsChannel = supabase
      .channel('live_bids')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'auction_bids' }, (payload) => {
        if (auction?.id) fetchBids(auction.id);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      })
      .subscribe();

    const auctionChannel = supabase
      .channel('auction_status')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'auctions' }, fetchLiveAuction)
      .subscribe();

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      supabase.removeChannel(bidsChannel);
      supabase.removeChannel(auctionChannel);
    };
  }, [auction?.id]);

  const handleDeclareWinner = async () => {
    if (!auction || bids.length === 0) {
      Alert.alert('No Bids', 'Cannot declare a winner — no bids have been placed.');
      return;
    }

    const topBid = bids[0]; 
    const bidderName = topBid?.customers?.full_name || 'Member';
    
    Alert.alert(
      'Declare Winner',
      `Confirm ${bidderName} as winner with a discount of ₹${(topBid.bid_amount / 100).toLocaleString()}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Confirm & Settle', 
          onPress: async () => {
            setDeclaring(true);
            try {
              const { error } = await supabase
                .from('auctions')
                .update({
                  status: 'completed',
                  winner_user_id: topBid.user_id,
                  current_bid: topBid.bid_amount,
                  ended_at: new Date().toISOString()
                })
                .eq('id', auction.id);
              
              if (error) throw error;
              
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              router.push(`/(admin)/groups/${auction.chit_group_id}`);
            } catch (err) {
              console.error(err);
              Alert.alert('Error', 'Failed to settle auction.');
            } finally {
              setDeclaring(false);
            }
          }
        }
      ]
    );
  };

  const handleCloseAuction = async () => {
    if (!auction) return;
    Alert.alert('End Bidding', 'Stop all incoming bids for this session?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'End Now', style: 'destructive', onPress: async () => {
        await supabase.from('auctions').update({ status: 'completed', ended_at: new Date().toISOString() }).eq('id', auction.id);
        fetchLiveAuction();
      }}
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color="#10D7CD" size="large" style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  const topBid = bids[0];
  const groupValue = (auction?.chit_groups?.value || 0) / 100;
  const currentDiscount = (topBid?.bid_amount || 0) / 100;
  const foremanCommission = groupValue * 0.05;
  const netDividend = currentDiscount - foremanCommission;
  const dividendPerMember = netDividend / (auction?.chit_groups?.capacity || 1);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Dynamic Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Svg width={24} height={24} viewBox="0 0 24 24" fill="#FFFFFF">
            <Path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
          </Svg>
        </TouchableOpacity>
        <View style={styles.avatarContainer}>
          <Image
            source={require('../../../assets/cropped_logo.png')}
            style={styles.avatar}
            contentFit="contain"
          />
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.groupName}>{auction?.chit_groups?.name || 'Live Auction'}</Text>
          <Text style={styles.groupCode}>{auction?.chit_groups?.group_code} • Auction #{auction?.auction_number}</Text>
        </View>
        <View style={styles.statusBox}>
          <View style={styles.pulseIndicator} />
          <Text style={styles.statusText}>LIVE</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Main Bidding Panel */}
        <View style={styles.biddingCard}>
          <View style={styles.timerRow}>
            <View style={styles.timerBadge}>
              <Text style={styles.timerLabel}>REMAINING TIME</Text>
              <Text style={styles.timerVal}>{timeLeft}</Text>
            </View>
            <View style={styles.bidCountBadge}>
              <Text style={styles.bidCountVal}>{bids.length}</Text>
              <Text style={styles.bidCountLabel}>BIDS</Text>
            </View>
          </View>

          <Text style={styles.lowestBidLabel}>CURRENT LOWEST PRIZE (HIGHEST DISCOUNT)</Text>
          <Text style={styles.lowestBidVal}>₹{(groupValue - currentDiscount).toLocaleString()}</Text>
          
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Discount</Text>
              <Text style={styles.statVal}>₹{currentDiscount.toLocaleString()}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Dividend/Member</Text>
              <Text style={[styles.statVal, { color: '#10B981' }]}>₹{dividendPerMember.toLocaleString()}</Text>
            </View>
          </View>

          {topBid && (
            <View style={styles.leaderBox}>
              <View style={styles.leaderAvatar}>
                <Text style={styles.leaderAvatarText}>{topBid.customers?.full_name?.charAt(0)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.leaderLabel}>CURRENT WINNER</Text>
                <Text style={styles.leaderName}>{topBid.customers?.full_name}</Text>
              </View>
              <View style={styles.rankBadge}>
                <Text style={styles.rankText}>#1</Text>
              </View>
            </View>
          )}
        </View>

        {/* Control Center */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Control Center</Text>
          <Text style={styles.sectionSub}>Manage the auction floor live.</Text>
        </View>

        <View style={styles.controlsRow}>
          <TouchableOpacity 
            style={[styles.controlBtn, styles.btnSettle, bids.length === 0 && styles.btnDisabled]} 
            onPress={handleDeclareWinner}
            disabled={bids.length === 0 || declaring}
          >
            {declaring ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnText}>DECLARE WINNER</Text>}
          </TouchableOpacity>
          
          <TouchableOpacity style={[styles.controlBtn, styles.btnStop]} onPress={handleCloseAuction}>
            <Text style={styles.btnText}>STOP BIDDING</Text>
          </TouchableOpacity>
        </View>

        {/* Live Bidding Feed */}
        <View style={styles.feedHeader}>
          <Text style={styles.sectionTitle}>Real-time Feed</Text>
          <View style={styles.feedBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.feedBadgeText}>UPDATED JUST NOW</Text>
          </View>
        </View>

        {bids.length === 0 ? (
          <View style={styles.emptyFeed}>
            <Text style={styles.emptyFeedText}>Awaiting first bid from members...</Text>
          </View>
        ) : (
          <View style={styles.feedList}>
            {bids.map((bid, i) => (
              <View key={bid.id} style={[styles.feedItem, i === 0 && styles.feedItemTop]}>
                <View style={styles.feedTime}>
                  <Text style={styles.timeText}>{new Date(bid.placed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                </View>
                <View style={styles.feedLineCol}>
                  <View style={[styles.feedDot, i === 0 && styles.feedDotActive]} />
                  {i < bids.length - 1 && <View style={styles.feedLine} />}
                </View>
                <View style={styles.feedContent}>
                  <Text style={styles.feedUser}>{bid.customers?.full_name}</Text>
                  <Text style={[styles.feedAmount, i === 0 && { color: '#10B981' }]}>
                    Discount: ₹{(bid.bid_amount / 100).toLocaleString()}
                  </Text>
                </View>
                {i === 0 && <View style={styles.winnerTag}><Text style={styles.winnerTagText}>WINNER</Text></View>}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  header: { 
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, height: 70, 
    backgroundColor: '#1E293B', borderBottomWidth: 1, borderBottomColor: '#334155' 
  },
  avatarContainer: {
    width: 32,
    height: 32,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatar: { width: '100%', height: '100%' },
  backBtn: { padding: 8, marginLeft: -8, marginRight: 4 },
  headerInfo: { flex: 1 },
  groupName: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 18, color: '#FFFFFF' },
  groupCode: { fontFamily: 'Inter_500Medium', fontSize: 12, color: '#94A3B8', marginTop: 2 },
  statusBox: { 
    flexDirection: 'row', alignItems: 'center', gap: 6, 
    backgroundColor: 'rgba(239, 68, 68, 0.1)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 100 
  },
  pulseIndicator: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' },
  statusText: { fontFamily: 'Inter_700Bold', fontSize: 10, color: '#EF4444', letterSpacing: 1 },

  scrollContent: { padding: 20, paddingBottom: 100 },
  biddingCard: { 
    backgroundColor: '#1E293B', borderRadius: 28, padding: 24, marginBottom: 32,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 10
  },
  timerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  timerBadge: { gap: 4 },
  timerLabel: { fontFamily: 'Inter_700Bold', fontSize: 10, color: '#94A3B8', letterSpacing: 0.5 },
  timerVal: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 24, color: '#EF4444' },
  bidCountBadge: { alignItems: 'center', backgroundColor: '#334155', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16 },
  bidCountVal: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 20, color: '#FFFFFF' },
  bidCountLabel: { fontFamily: 'Inter_700Bold', fontSize: 8, color: '#94A3B8' },

  lowestBidLabel: { fontFamily: 'Inter_700Bold', fontSize: 10, color: '#64748B', letterSpacing: 0.8, textAlign: 'center' },
  lowestBidVal: { 
    fontFamily: 'SpaceGrotesk_700Bold', fontSize: 44, color: '#FFFFFF', 
    textAlign: 'center', marginVertical: 12, letterSpacing: -1 
  },
  
  statsGrid: { flexDirection: 'row', gap: 12, marginTop: 12, marginBottom: 24 },
  statItem: { flex: 1, backgroundColor: 'rgba(255,255,255,0.03)', padding: 16, borderRadius: 20, alignItems: 'center' },
  statLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 10, color: '#94A3B8', marginBottom: 4 },
  statVal: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 16, color: '#FFFFFF' },

  leaderBox: { 
    flexDirection: 'row', alignItems: 'center', gap: 12, 
    backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: 16, borderRadius: 20,
    borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.2)'
  },
  leaderAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#10B981', alignItems: 'center', justifyContent: 'center' },
  leaderAvatarText: { fontFamily: 'Inter_700Bold', fontSize: 18, color: '#FFFFFF' },
  leaderLabel: { fontFamily: 'Inter_700Bold', fontSize: 9, color: '#10B981', letterSpacing: 0.5 },
  leaderName: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: '#FFFFFF' },
  rankBadge: { backgroundColor: '#10B981', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  rankText: { fontFamily: 'Inter_700Bold', fontSize: 10, color: '#FFFFFF' },

  sectionHeader: { marginBottom: 16 },
  sectionTitle: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 20, color: '#FFFFFF' },
  sectionSub: { fontFamily: 'Inter_500Medium', fontSize: 13, color: '#64748B', marginTop: 4 },

  controlsRow: { flexDirection: 'row', gap: 12, marginBottom: 40 },
  controlBtn: { flex: 1, height: 60, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  btnSettle: { backgroundColor: '#005E7D' },
  btnStop: { backgroundColor: '#EF4444' },
  btnDisabled: { opacity: 0.5 },
  btnText: { fontFamily: 'Inter_700Bold', fontSize: 12, color: '#FFFFFF', letterSpacing: 1 },

  feedHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  feedBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981' },
  feedBadgeText: { fontFamily: 'Inter_700Bold', fontSize: 10, color: '#10B981' },

  emptyFeed: { alignItems: 'center', padding: 40, backgroundColor: '#1E293B', borderRadius: 20 },
  emptyFeedText: { fontFamily: 'Inter_500Medium', fontSize: 14, color: '#64748B' },

  feedList: { paddingLeft: 12 },
  feedItem: { flexDirection: 'row', minHeight: 70 },
  feedItemTop: { minHeight: 90 },
  feedTime: { width: 60, paddingTop: 4 },
  timeText: { fontFamily: 'Inter_500Medium', fontSize: 11, color: '#475569' },
  feedLineCol: { width: 30, alignItems: 'center' },
  feedDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#334155', zIndex: 2, borderWidth: 2, borderColor: '#0F172A' },
  feedDotActive: { backgroundColor: '#10B981', transform: [{ scale: 1.4 }] },
  feedLine: { width: 2, flex: 1, backgroundColor: '#1E293B', marginTop: -4, marginBottom: -4, zIndex: 1 },
  feedContent: { flex: 1, paddingLeft: 12, paddingBottom: 24 },
  feedUser: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#FFFFFF' },
  feedAmount: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 16, color: '#64748B', marginTop: 2 },
  winnerTag: { backgroundColor: '#10B981', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, height: 24 },
  winnerTagText: { fontFamily: 'Inter_700Bold', fontSize: 9, color: '#FFFFFF' },
});
