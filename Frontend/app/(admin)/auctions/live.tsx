import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Circle } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';

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
      // Get the most recent live or upcoming auction
      const { data: auctionData, error } = await supabase
        .from('auctions')
        .select('*, chit_groups(name, group_code, value, capacity)')
        .in('status', ['live', 'upcoming'])
        .order('scheduled_at', { ascending: true })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      setAuction(auctionData || null);

      if (auctionData?.id) {
        fetchBids(auctionData.id);
        startTimer(auctionData.scheduled_at, auctionData.time_limit_mins);
      }
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
        .select('*')
        .eq('auction_id', auctionId)
        .order('bid_amount', { ascending: false })
        .limit(20);
      setBids(data || []);
    } catch (err) {
      console.error('Error fetching bids:', err);
    }
  };

  const startTimer = (scheduledAt: string, limitMins: number = 60) => {
    if (timerRef.current) clearInterval(timerRef.current);

    const endTime = new Date(scheduledAt).getTime() + (limitMins * 60 * 1000);

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

    // Supabase Realtime subscription for live bids
    let bidsChannel: any;
    let auctionChannel: any;
    if (auction?.id) {
      bidsChannel = supabase
        .channel('live_bids')
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'auction_bids',
          filter: `auction_id=eq.${auction.id}`,
        }, (payload) => {
          setBids(prev => [payload.new, ...prev]);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        })
        .subscribe();
    }

    auctionChannel = supabase
      .channel('admin-live-auction-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'auctions' }, fetchLiveAuction)
      .subscribe();

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (bidsChannel) supabase.removeChannel(bidsChannel);
      if (auctionChannel) supabase.removeChannel(auctionChannel);
    };
  }, [auction?.id]);

  const handleDeclareWinner = async () => {
    if (!auction || bids.length === 0) {
      Alert.alert('No Bids', 'Cannot declare a winner — no bids have been placed.');
      return;
    }

    const topBid = bids[0];
    Alert.alert(
      'Declare Winner',
      `Declare ${topBid.bidder_name || 'Top Bidder'} as winner with a bid of ₹${((topBid.bid_amount || 0) / 100).toLocaleString('en-IN')}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Declare Winner',
          onPress: async () => {
            setDeclaring(true);
            try {
              const { error } = await supabase
                .from('auctions')
                .update({
                  status: 'completed',
                  winner_user_id: topBid.user_id,
                  current_bid: topBid.bid_amount,
                  ended_at: new Date().toISOString(),
                })
                .eq('id', auction.id);

              if (error) throw error;

              await supabase.from('auction_events').insert([{
                auction_id: auction.id,
                event_type: 'winner_declared',
                performed_by: 'Admin',
                notes: `Winner declared: Bid ₹${((topBid.bid_amount || 0) / 100).toLocaleString('en-IN')}`,
              }]);

              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              fetchLiveAuction();
            } catch (err) {
              console.error(err);
              Alert.alert('Error', 'Failed to declare winner.');
            } finally {
              setDeclaring(false);
            }
          },
        },
      ]
    );
  };

  const handlePauseAuction = async () => {
    if (!auction) return;
    const newStatus = auction.status === 'live' ? 'upcoming' : 'live';

    try {
      await supabase.from('auctions').update({ status: newStatus }).eq('id', auction.id);
      await supabase.from('auction_events').insert([{
        auction_id: auction.id,
        event_type: newStatus === 'live' ? 'resumed' : 'paused',
        performed_by: 'Admin',
      }]);
      Haptics.selectionAsync();
      fetchLiveAuction();
    } catch (err) {
      console.error(err);
    }
  };

  const topBid = bids[0];
  const prizePool = Number(auction?.chit_groups?.value || 0) / 100;
  const foregoneAmount = Number(topBid?.bid_amount || 0) / 100;
  const foremanCommission = prizePool * 0.05;
  const netDividend = foregoneAmount - foremanCommission;
  const membersCount = auction?.chit_groups?.capacity || 50;
  const dividendPerMember = membersCount > 0 ? netDividend / membersCount : 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Dark App Bar */}
      <View style={styles.appBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Svg width={24} height={24} viewBox="0 0 24 24" fill="#FFFFFF">
            <Path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
          </Svg>
        </TouchableOpacity>
        <View style={styles.headerTitleBox}>
          <Text style={styles.appBarTitle} numberOfLines={1}>
            {loading ? 'Loading...' : auction?.chit_groups?.name || 'No Active Auction'}
          </Text>
          <Text style={styles.appBarSubtitle}>
            {auction ? `Auction #${auction.auction_number || '—'} • Ends in ${timeLeft}` : 'No live or upcoming auction'}
          </Text>
        </View>
        <View style={[styles.liveBadge, { backgroundColor: auction?.status === 'live' ? 'rgba(239,68,68,0.2)' : 'rgba(100,116,139,0.2)' }]}>
          <View style={[styles.liveIndicator, { backgroundColor: auction?.status === 'live' ? '#EF4444' : '#64748B' }]} />
          <Text style={[styles.liveText, { color: auction?.status === 'live' ? '#EF4444' : '#64748B' }]}>
            {auction?.status === 'live' ? 'LIVE' : (auction?.status || 'NONE').toUpperCase()}
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color="#10D7CD" size="large" />
        </View>
      ) : !auction ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
          <Text style={{ color: '#94A3B8', fontFamily: 'Inter_400Regular', fontSize: 16, textAlign: 'center' }}>
            No live or upcoming auction found.{'\n'}Initialize a Chit Group to schedule auctions.
          </Text>
          <TouchableOpacity
            style={{ marginTop: 24, backgroundColor: '#005E7D', padding: 16, borderRadius: 12 }}
            onPress={() => router.push('/(admin)/groups')}
          >
            <Text style={{ color: '#FFFFFF', fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>Go to Chit Groups</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

          {/* Hero: Highest Bid */}
          <View style={styles.heroCard}>
            <View style={styles.heroTop}>
              <Text style={styles.heroLabel}>CURRENT HIGHEST BID (FOREGO AMOUNT)</Text>
              <View style={styles.timerBadge}>
                <Svg width={14} height={14} viewBox="0 0 24 24" fill="#FCA5A5">
                  <Path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z" />
                </Svg>
                <Text style={styles.timerText}>{timeLeft}</Text>
              </View>
            </View>

            <Text style={styles.heroValue}>
              {topBid ? `₹${foregoneAmount.toLocaleString('en-IN')}` : '₹ — Awaiting Bids'}
            </Text>

            {topBid && (
              <View style={styles.bidderRow}>
                <View style={styles.bidderInfo}>
                  <View style={styles.avatarMini}>
                    <Text style={styles.avatarMiniText}>
                      {(topBid.bidder_name || 'U').substring(0, 1).toUpperCase()}
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.bidderLabel}>PLACED BY</Text>
                    <Text style={styles.bidderName}>{topBid.bidder_name || `User #${topBid.user_id?.substring(0, 8)}`}</Text>
                  </View>
                </View>
              </View>
            )}

            {topBid && (
              <View style={styles.netInfoBox}>
                <Text style={styles.netLabel}>Est. Net Amount to Winner</Text>
                <Text style={styles.netVal}>
                  ₹{(prizePool - foregoneAmount).toLocaleString('en-IN')}
                </Text>
              </View>
            )}

            {/* Dividend Breakdown */}
            {topBid && (
              <View style={styles.breakdownBox}>
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>Total Forego Amount</Text>
                  <Text style={styles.breakdownVal}>₹{foregoneAmount.toLocaleString('en-IN')}</Text>
                </View>
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>Foreman Commission (5%)</Text>
                  <Text style={[styles.breakdownVal, { color: '#FCA5A5' }]}>- ₹{foremanCommission.toLocaleString('en-IN')}</Text>
                </View>
                <View style={[styles.breakdownRow, { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.15)', paddingTop: 8, marginTop: 4 }]}>
                  <Text style={[styles.breakdownLabel, { color: '#FFFFFF', fontFamily: 'Inter_700Bold' }]}>Net Distributable Dividend</Text>
                  <Text style={[styles.breakdownVal, { color: '#54FAEF', fontFamily: 'SpaceGrotesk_700Bold', fontSize: 18 }]}>₹{netDividend.toLocaleString('en-IN')}</Text>
                </View>
                <View style={styles.perMemberRow}>
                  <View>
                    <Text style={styles.perMemberLabel}>DIVIDEND PER MEMBER</Text>
                    <Text style={styles.perMemberVal}>₹{dividendPerMember.toLocaleString('en-IN')}</Text>
                  </View>
                  <TouchableOpacity style={styles.executeBtn} onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)}>
                    <Text style={styles.executeBtnText}>EXECUTE DISTRIBUTION</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

          {/* Foreman Controls */}
          <View style={styles.controlsSection}>
            <Text style={styles.sectionTitle}>Foreman Controls</Text>
            <View style={styles.controlRow}>
              <TouchableOpacity
                style={[styles.controlBtn, styles.controlBtnSuccess, (declaring || bids.length === 0) && styles.controlBtnDisabled]}
                onPress={handleDeclareWinner}
                disabled={declaring || bids.length === 0}
              >
                {declaring ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Svg width={20} height={20} viewBox="0 0 24 24" fill="#FFFFFF">
                      <Path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z" />
                    </Svg>
                    <Text style={styles.controlBtnText}>Declare Winner</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity style={[styles.controlBtn, styles.controlBtnWarning]} onPress={handlePauseAuction}>
                <Svg width={20} height={20} viewBox="0 0 24 24" fill="#FFFFFF">
                  <Path d={auction?.status === 'live' ? 'M6 19h4V5H6v14zm8-14v14h4V5h-4z' : 'M8 5v14l11-7z'} />
                </Svg>
                <Text style={styles.controlBtnText}>
                  {auction?.status === 'live' ? 'Pause Auction' : 'Resume Auction'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Live Bidding Log */}
          <View style={styles.logSection}>
            <View style={styles.logHeader}>
              <Text style={styles.sectionTitle}>Live Bidding Log</Text>
              <Text style={styles.logCount}>{bids.length} Bids</Text>
            </View>

            {bids.length === 0 ? (
              <Text style={{ color: '#64748B', fontFamily: 'Inter_400Regular', fontStyle: 'italic' }}>
                No bids placed yet.
              </Text>
            ) : (
              <View style={styles.logList}>
                {bids.map((bid, i) => (
                  <View key={bid.id || i} style={styles.logItem}>
                    <View style={styles.logTimeCol}>
                      <Text style={styles.logTime}>
                        {new Date(bid.placed_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </Text>
                    </View>
                    <View style={styles.logIconCol}>
                      <View style={[styles.logDot, { backgroundColor: i === 0 ? '#10D7CD' : '#64748B' }]} />
                      {i < bids.length - 1 && <View style={styles.logLine} />}
                    </View>
                    <View style={styles.logContent}>
                      <Text style={[styles.logAmount, { color: i === 0 ? '#10D7CD' : '#64748B' }]}>
                        ₹{((bid.bid_amount || 0) / 100).toLocaleString('en-IN')}
                      </Text>
                      <Text style={styles.logUser}>
                        {bid.bidder_name || `User #${bid.user_id?.substring(0, 8)}`}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>

        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  appBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, height: 64, backgroundColor: '#0B1221',
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)', zIndex: 40,
  },
  backBtn: { padding: 8, marginRight: 8 },
  headerTitleBox: { flex: 1 },
  appBarTitle: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 18, color: '#FFFFFF' },
  appBarSubtitle: { fontFamily: 'Inter_500Medium', fontSize: 12, color: '#94A3B8' },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100 },
  liveIndicator: { width: 8, height: 8, borderRadius: 4 },
  liveText: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1 },

  scrollContent: { padding: 20, paddingBottom: 120 },

  heroCard: {
    backgroundColor: '#005E7D', borderRadius: 24, padding: 24, marginBottom: 24,
    shadowColor: '#00D1C1', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.15, shadowRadius: 30, elevation: 10,
  },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  heroLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 10, color: '#A5F3FC', letterSpacing: 0.5 },
  timerBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.3)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100 },
  timerText: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 12, color: '#FCA5A5' },
  heroValue: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 40, color: '#FFFFFF', marginBottom: 24, letterSpacing: -1 },
  bidderRow: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', paddingTop: 20, marginBottom: 12 },
  bidderInfo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarMini: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#54FAEF', alignItems: 'center', justifyContent: 'center' },
  avatarMiniText: { fontFamily: 'Inter_700Bold', fontSize: 16, color: '#00201E' },
  bidderLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 10, color: '#A5F3FC', letterSpacing: 0.5, marginBottom: 2 },
  bidderName: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#FFFFFF' },
  netInfoBox: { backgroundColor: 'rgba(0,0,0,0.2)', padding: 12, borderRadius: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  netLabel: { fontFamily: 'Inter_500Medium', fontSize: 12, color: '#CBD5E1' },
  netVal: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 16, color: '#54FAEF' },

  breakdownBox: { backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 16, padding: 16, gap: 8 },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  breakdownLabel: { fontFamily: 'Inter_500Medium', fontSize: 13, color: '#CBD5E1' },
  breakdownVal: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#FFFFFF' },
  perMemberRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  perMemberLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 10, color: '#A5F3FC', letterSpacing: 0.5, marginBottom: 4 },
  perMemberVal: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 28, color: '#FFFFFF' },
  executeBtn: { backgroundColor: '#10D7CD', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12 },
  executeBtnText: { fontFamily: 'Inter_700Bold', fontSize: 11, color: '#00201E', letterSpacing: 0.5 },

  controlsSection: { marginBottom: 32 },
  sectionTitle: { fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 18, color: '#FFFFFF', marginBottom: 16 },
  controlRow: { flexDirection: 'row', gap: 16 },
  controlBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, borderRadius: 16 },
  controlBtnSuccess: { backgroundColor: '#10B981' },
  controlBtnWarning: { backgroundColor: '#F59E0B' },
  controlBtnDisabled: { opacity: 0.5 },
  controlBtnText: { fontFamily: 'Inter_700Bold', fontSize: 14, color: '#FFFFFF' },

  logSection: { backgroundColor: '#1E293B', borderRadius: 24, padding: 20 },
  logHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  logCount: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: '#94A3B8', backgroundColor: '#334155', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 100 },
  logList: { paddingLeft: 8 },
  logItem: { flexDirection: 'row', minHeight: 60 },
  logTimeCol: { width: 65, paddingTop: 4 },
  logTime: { fontFamily: 'Inter_500Medium', fontSize: 11, color: '#64748B' },
  logIconCol: { width: 30, alignItems: 'center' },
  logDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: '#1E293B', marginTop: 4, zIndex: 1 },
  logLine: { width: 2, flex: 1, backgroundColor: '#334155', marginTop: -8, marginBottom: 4 },
  logContent: { flex: 1, paddingBottom: 24 },
  logAmount: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 18, marginBottom: 2 },
  logUser: { fontFamily: 'Inter_500Medium', fontSize: 12, color: '#94A3B8' },
});
