import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import Svg, { Path, Circle } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';

export default function AdminAuctionsIndex() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'Foreclosures' | 'Schedule'>('Foreclosures');
  const [refreshing, setRefreshing] = useState(false);

  // Foreclosure state
  const [requests, setRequests] = useState<any[]>([]);
  const [requestStats, setRequestStats] = useState({ total: 0, high_risk: 0 });
  const [loadingRequests, setLoadingRequests] = useState(true);

  // Auction schedule state
  const [auctions, setAuctions] = useState<any[]>([]);
  const [loadingAuctions, setLoadingAuctions] = useState(true);

  // Live auction (if any)
  const [liveAuction, setLiveAuction] = useState<any | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchForeclosures = async () => {
    try {
      const { data, error } = await supabase
        .from('foreclosure_requests')
        .select(`
          *,
          chit_members (
            user_id,
            bid_status,
            chit_groups ( name, group_code )
          )
        `)
        .eq('status', 'pending')
        .order('risk_score', { ascending: false });

      if (error) throw error;

      const total = data?.length || 0;
      const high_risk = data?.filter((r: any) => r.risk_score >= 70).length || 0;
      setRequestStats({ total, high_risk });
      setRequests(data || []);
    } catch (err) {
      console.error('Error fetching foreclosures:', err);
    } finally {
      setLoadingRequests(false);
    }
  };

  const fetchAuctions = async () => {
    try {
      const { data, error } = await supabase
        .from('v_upcoming_auctions')
        .select('*')
        .order('scheduled_at', { ascending: true });

      if (error) {
        // fallback if view doesn't exist yet
        const { data: fallback } = await supabase
          .from('auctions')
          .select('*, chit_groups(name, group_code, capacity)')
          .order('scheduled_at', { ascending: true });
        setAuctions(fallback || []);
      } else {
        setAuctions(data || []);
      }

      const live = (data || []).find((a: any) => a.status === 'live');
      setLiveAuction(live || null);
    } catch (err) {
      console.error('Error fetching auctions:', err);
    } finally {
      setLoadingAuctions(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchForeclosures(), fetchAuctions()]);
    setRefreshing(false);
  }, []);

  const scheduleRefresh = () => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      fetchForeclosures();
      fetchAuctions();
    }, 300);
  };

  useEffect(() => {
    fetchForeclosures();
    fetchAuctions();
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel('admin-auctions-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'foreclosure_requests' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'auctions' }, scheduleRefresh)
      .subscribe();

    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      supabase.removeChannel(channel);
    };
  }, []);

  const handleForeclosureAction = async (requestId: string, action: 'approved' | 'denied', penaltyRate: number) => {
    const label = action === 'approved' ? `Approve with ${penaltyRate}% Penalty` : 'Deny Request';
    Alert.alert(
      label,
      `Are you sure you want to ${action === 'approved' ? 'approve' : 'deny'} this foreclosure request?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          style: action === 'denied' ? 'destructive' : 'default',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('foreclosure_requests')
                .update({
                  status: action,
                  penalty_rate: penaltyRate,
                  reviewed_at: new Date().toISOString(),
                })
                .eq('id', requestId);

              if (error) throw error;
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              fetchForeclosures();
            } catch (err) {
              console.error('Update error:', err);
              Alert.alert('Error', 'Failed to update request.');
            }
          },
        },
      ]
    );
  };

  const getRiskColor = (score: number) => {
    if (score >= 70) return { ring: '#EF4444', bg: '#FEE2E2', text: '#991B1B', label: 'High Default Risk' };
    if (score >= 40) return { ring: '#F59E0B', bg: '#FEF3C7', text: '#B45309', label: 'Moderate Risk' };
    return { ring: '#10B981', bg: '#D1FAE5', text: '#065F46', label: 'Low Risk' };
  };

  const formatDate = (d: string) => {
    if (!d) return 'TBD';
    return new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* App Bar */}
      <View style={styles.appBar}>
        <View style={styles.appBarLeft}>
          <View style={styles.avatarContainer}>
            <Image
              source={require('../../../assets/cropped_logo.png')}
              style={styles.avatar}
              contentFit="contain"
            />
          </View>
          <Text style={styles.appBarTitle}>Auctions & Requests</Text>
        </View>
        <TouchableOpacity
          style={[styles.liveBtn, !liveAuction && styles.liveBtnDim]}
          onPress={() => { Haptics.selectionAsync(); router.push('/(admin)/auctions/live'); }}
          activeOpacity={0.8}
        >
          <View style={[styles.liveIndicator, { backgroundColor: liveAuction ? '#FFFFFF' : '#94A3B8' }]} />
          <Text style={styles.liveBtnText}>{liveAuction ? 'Join Live' : 'Live Auction'}</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        {(['Foreclosures', 'Schedule'] as const).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => { setActiveTab(tab); Haptics.selectionAsync(); }}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'Foreclosures' ? 'Foreclosure Queue' : 'Auction Schedule'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#005E7D" />}
      >

        {/* ── FORECLOSURE TAB ── */}
        {activeTab === 'Foreclosures' && (
          <View>
            {/* Stats */}
            <View style={styles.statsRow}>
              <View style={[styles.statBox, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
                <Text style={styles.statBoxTitle}>Pending Requests</Text>
                <Text style={[styles.statBoxVal, { color: '#1E3A8A' }]}>
                  {loadingRequests ? '—' : requestStats.total}
                </Text>
              </View>
              <View style={[styles.statBox, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
                <Text style={styles.statBoxTitle}>High Risk (≥70)</Text>
                <Text style={[styles.statBoxVal, { color: '#991B1B' }]}>
                  {loadingRequests ? '—' : requestStats.high_risk}
                </Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>Pending Requests</Text>

            {loadingRequests ? (
              <ActivityIndicator color="#005E7D" size="large" style={{ marginTop: 40 }} />
            ) : requests.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No pending foreclosure requests.</Text>
              </View>
            ) : (
              requests.map((req) => {
                const risk = getRiskColor(req.risk_score || 0);
                const initials = (req.chit_members?.user_id || 'U').substring(0, 2).toUpperCase();
                const groupName = req.chit_members?.chit_groups?.name || 'Unknown Group';
                const groupCode = req.chit_members?.chit_groups?.group_code || '';
                const penaltyRate = req.risk_score >= 70 ? 5 : req.risk_score >= 40 ? 2 : 1;
                const outstanding = ((req.outstanding_amount || 0) / 100).toLocaleString('en-IN');
                const dashOffset = 100 - (req.risk_score || 0);

                return (
                  <View key={req.id} style={styles.requestCard}>
                    <View style={styles.cardHeader}>
                      <View style={styles.userInfo}>
                        <View style={styles.avatarMini}>
                          <Text style={styles.avatarMiniText}>{initials}</Text>
                        </View>
                        <View>
                          <Text style={styles.userName}>Member • {groupCode || groupName}</Text>
                          <Text style={styles.userId}>{groupName}</Text>
                        </View>
                      </View>
                      <Text style={styles.timeAgo}>
                        {req.created_at ? new Date(req.created_at).toLocaleDateString('en-IN') : 'N/A'}
                      </Text>
                    </View>

                    <View style={styles.reasonBox}>
                      <Text style={styles.reasonLabel}>EXIT REASON</Text>
                      <Text style={styles.reasonText}>
                        "{req.reason || 'No reason provided.'}"
                      </Text>
                    </View>

                    <View style={styles.riskRow}>
                      <View style={styles.riskScoreBox}>
                        <View style={styles.riskProgress}>
                          <Svg width={40} height={40} viewBox="0 0 40 40">
                            <Circle cx="20" cy="20" r="16" stroke={risk.bg} strokeWidth="4" fill="none" />
                            <Circle cx="20" cy="20" r="16" stroke={risk.ring} strokeWidth="4" fill="none"
                              strokeDasharray="100" strokeDashoffset={String(dashOffset)}
                              strokeLinecap="round" transform="rotate(-90 20 20)" />
                          </Svg>
                          <View style={styles.riskInner}>
                            <Text style={styles.riskVal}>{req.risk_score || 0}</Text>
                          </View>
                        </View>
                        <View>
                          <Text style={styles.riskTitle}>AI Risk Score</Text>
                          <Text style={[styles.riskSub, { color: risk.text }]}>{risk.label}</Text>
                        </View>
                      </View>
                      <View style={styles.amountsBox}>
                        <Text style={styles.amountLabel}>Outstanding</Text>
                        <Text style={styles.amountVal}>₹{outstanding}</Text>
                      </View>
                    </View>

                    <View style={styles.actionsRow}>
                      <TouchableOpacity
                        style={styles.actionBtnOutline}
                        onPress={() => handleForeclosureAction(req.id, 'denied', 0)}
                      >
                        <Text style={styles.actionBtnOutlineText}>Deny</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.actionBtnSolid}
                        onPress={() => handleForeclosureAction(req.id, 'approved', penaltyRate)}
                      >
                        <Text style={styles.actionBtnSolidText}>Approve ({penaltyRate}% Penalty)</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* ── SCHEDULE TAB ── */}
        {activeTab === 'Schedule' && (
          <View>
            <Text style={styles.sectionTitle}>Upcoming Auctions</Text>
            {loadingAuctions ? (
              <ActivityIndicator color="#005E7D" size="large" style={{ marginTop: 40 }} />
            ) : auctions.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No auctions scheduled. Initialize a Chit Group first.</Text>
              </View>
            ) : (
              auctions.map((auction) => {
                const statusColor = auction.status === 'live'
                  ? '#10B981' : auction.status === 'upcoming'
                    ? '#005E7D' : '#94A3B8';
                return (
                  <View key={auction.id} style={styles.scheduleCard}>
                    <View style={styles.scheduleTop}>
                      <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={styles.scheduleGroup}>
                          {auction.group_name || auction.chit_groups?.name || 'Unknown Group'}
                        </Text>
                        <Text style={styles.scheduleCode}>
                          {auction.group_code || auction.chit_groups?.group_code || ''} •{' '}
                          Auction #{auction.auction_number || '—'}
                        </Text>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: statusColor + '20', borderColor: statusColor + '40' }]}>
                        <Text style={[styles.statusBadgeText, { color: statusColor }]}>
                          {(auction.status || 'upcoming').toUpperCase()}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.scheduleDetails}>
                      <View style={styles.scheduleDetail}>
                        <Text style={styles.sdLabel}>SCHEDULED</Text>
                        <Text style={styles.sdVal}>{formatDate(auction.scheduled_at)}</Text>
                      </View>
                      <View style={styles.scheduleDetail}>
                        <Text style={styles.sdLabel}>PRIZE POOL</Text>
                        <Text style={styles.sdVal}>
                          ₹{((Number(auction.prize_pool || auction.min_bid || 0)) / 100).toLocaleString('en-IN')}
                        </Text>
                      </View>
                      <View style={styles.scheduleDetail}>
                        <Text style={styles.sdLabel}>MEMBERS</Text>
                        <Text style={styles.sdVal}>
                          {auction.enrolled_members || 0} / {auction.capacity || auction.chit_groups?.capacity || 50}
                        </Text>
                      </View>
                      <View style={styles.scheduleDetail}>
                        <Text style={styles.sdLabel}>BIDS</Text>
                        <Text style={styles.sdVal}>{auction.total_bids || 0}</Text>
                      </View>
                    </View>

                    {auction.status === 'live' && (
                      <TouchableOpacity
                        style={styles.joinLiveBtn}
                        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push('/(admin)/auctions/live'); }}
                      >
                        <Text style={styles.joinLiveBtnText}>JOIN LIVE AUCTION →</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })
            )}
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FF' },
  appBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, height: 64, backgroundColor: '#FFFFFF',
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  appBarLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarContainer: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatar: { width: '100%', height: '100%' },
  appBarTitle: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 20, color: '#0F172A', letterSpacing: -0.5 },
  liveBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#00D1C1', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 100,
  },
  liveBtnDim: { backgroundColor: '#E2E8F0' },
  liveIndicator: { width: 8, height: 8, borderRadius: 4 },
  liveBtnText: { fontFamily: 'Inter_700Bold', fontSize: 12, color: '#00201E' },

  tabContainer: { flexDirection: 'row', backgroundColor: '#FFFFFF', paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  tab: { paddingVertical: 16, marginRight: 24, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: '#01789E' },
  tabText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#64748B' },
  tabTextActive: { color: '#01789E' },

  scrollContent: { padding: 20, paddingBottom: 120 },

  statsRow: { flexDirection: 'row', gap: 16, marginBottom: 24 },
  statBox: { flex: 1, padding: 16, borderRadius: 16, borderWidth: 1 },
  statBoxTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: '#475569', marginBottom: 4 },
  statBoxVal: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 28 },

  sectionTitle: { fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 18, color: '#164E63', marginBottom: 16 },

  emptyState: { alignItems: 'center', marginTop: 48 },
  emptyText: { fontFamily: 'Inter_400Regular', fontSize: 16, color: '#94A3B8', textAlign: 'center' },

  requestCard: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20, marginBottom: 16,
    borderWidth: 1, borderColor: '#F1F5F9',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  userInfo: { flexDirection: 'row', gap: 12 },
  avatarMini: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  avatarMiniText: { fontFamily: 'Inter_700Bold', fontSize: 14, color: '#0B1C30' },
  userName: { fontFamily: 'Inter_700Bold', fontSize: 16, color: '#0B1C30' },
  userId: { fontFamily: 'Inter_500Medium', fontSize: 12, color: '#64748B' },
  timeAgo: { fontFamily: 'Inter_500Medium', fontSize: 12, color: '#94A3B8' },

  reasonBox: { backgroundColor: '#F8FAFC', padding: 16, borderRadius: 12, marginBottom: 16 },
  reasonLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 10, color: '#64748B', letterSpacing: 0.5, marginBottom: 4 },
  reasonText: { fontFamily: 'Inter_400Regular', fontSize: 14, color: '#0B1C30', fontStyle: 'italic' },

  riskRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  riskScoreBox: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  riskProgress: { width: 40, height: 40, position: 'relative', justifyContent: 'center', alignItems: 'center' },
  riskInner: { position: 'absolute' },
  riskVal: { fontFamily: 'Inter_700Bold', fontSize: 12, color: '#0B1C30' },
  riskTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: '#0B1C30' },
  riskSub: { fontFamily: 'Inter_500Medium', fontSize: 10 },

  amountsBox: { alignItems: 'flex-end' },
  amountLabel: { fontFamily: 'Inter_500Medium', fontSize: 10, color: '#64748B' },
  amountVal: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 18, color: '#005E7D' },

  actionsRow: { flexDirection: 'row', gap: 12 },
  actionBtnOutline: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center' },
  actionBtnOutlineText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#64748B' },
  actionBtnSolid: { flex: 2, paddingVertical: 12, borderRadius: 12, backgroundColor: '#01789E', alignItems: 'center' },
  actionBtnSolidText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#FFFFFF' },

  scheduleCard: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20, marginBottom: 16,
    borderWidth: 1, borderColor: '#F1F5F9',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2,
  },
  scheduleTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  scheduleGroup: { fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 16, color: '#0B1C30' },
  scheduleCode: { fontFamily: 'Inter_500Medium', fontSize: 12, color: '#64748B', marginTop: 2 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 100, borderWidth: 1 },
  statusBadgeText: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.5 },
  scheduleDetails: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12 },
  scheduleDetail: { minWidth: '45%' },
  sdLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 10, color: '#94A3B8', letterSpacing: 0.5, marginBottom: 2 },
  sdVal: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#0B1C30' },
  joinLiveBtn: { backgroundColor: '#10B981', padding: 14, borderRadius: 12, alignItems: 'center' },
  joinLiveBtnText: { fontFamily: 'Inter_700Bold', fontSize: 13, color: '#FFFFFF', letterSpacing: 0.5 },
});
