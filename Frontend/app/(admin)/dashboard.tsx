import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Platform, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import Svg, { Path, Circle, Line, Defs, LinearGradient, Stop } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../lib/supabase';
import { useRouter } from 'expo-router';
import { formatPaise } from '../../lib/hooks/useDashboard';

export default function AdminDashboard() {
  const router = useRouter();
  const [metrics, setMetrics] = useState({
    totalAUM: 0,
    members: 0,
    collection: 0,
    auctions: 0,
    dividends: 0,
  });
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [showAllActivity, setShowAllActivity] = useState(false);
  const [chartData, setChartData] = useState<{
    labels: string[],
    points: { x: number, y: number, amount: number }[],
    pathArea: string,
    pathLine: string,
    lastPoint: { x: number, y: number, amount: number } | null
  }>({
    labels: ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN'],
    points: [],
    pathArea: 'M0 160 L400 160 Z',
    pathLine: 'M0 160 L400 160',
    lastPoint: null
  });
  const [refreshing, setRefreshing] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchDashboardData = async () => {
    try {
      // AUM (Value in paise, so divide by 100)
      const { data: groups } = await supabase.from('chit_groups').select('value');
      const aum = groups ? groups.reduce((acc, g) => acc + Number(g.value || 0), 0) / 100 : 0;

      // Members
      const { count: memberCount } = await supabase.from('customers').select('*', { count: 'exact', head: true });

      // Collection (Sum of chit_member_transactions where payment_type=installment and status=completed)
      const { data: deposits } = await supabase
        .from('chit_member_transactions')
        .select('amount, transaction_date')
        .eq('payment_type', 'installment')
        .eq('status', 'completed');
        
      const collection = deposits ? deposits.reduce((acc, d) => acc + Number(d.amount || 0), 0) : 0;

      // Auctions
      const { count: auctionCount } = await supabase.from('auctions').select('*', { count: 'exact', head: true }).in('status', ['upcoming', 'live']);

      // Dividends (payment_type=dividend and status=completed)
      const { data: dividendTx } = await supabase
        .from('chit_member_transactions')
        .select('amount')
        .eq('payment_type', 'dividend')
        .eq('status', 'completed');
        
      const dividends = dividendTx ? dividendTx.reduce((acc, d) => acc + Number(d.amount || 0), 0) : 0;

      setMetrics({
        totalAUM: aum,
        members: memberCount || 0,
        collection: collection,
        auctions: auctionCount || 0,
        dividends: dividends,
      });

      // Recent Activity
      const { data: rawActivity } = await supabase
        .from('chit_member_transactions')
        .select('*, chit_members(chit_groups(name), customers(full_name))')
        .eq('status', 'completed')
        .order('transaction_date', { ascending: false })
        .limit(20);

      if (rawActivity) {
        const mappedActivity = rawActivity.map((tx: any) => {
          const customerName = tx.chit_members?.customers?.full_name || 'Member';
          const groupName = tx.chit_members?.chit_groups?.name || 'Group';
          return {
            id: tx.id,
            amount: tx.amount,
            type: tx.payment_type === 'dividend' ? 'debit' : 'credit', // Debit from admin's perspective for dividend, credit for installment
            description: `${tx.payment_type === 'dividend' ? 'Dividend to' : 'Installment from'} ${customerName}`,
            category: groupName,
            created_at: tx.transaction_date,
          };
        });
        setRecentActivity(mappedActivity);
      }

      // --- Process Chart Data (Last 6 Months Collection Trends) ---
      const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
      const now = new Date();
      const last6Months: any[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        last6Months.push({
          label: monthNames[d.getMonth()],
          year: d.getFullYear(),
          month: d.getMonth(),
          amount: 0
        });
      }

      if (deposits) {
        deposits.forEach(d => {
          const date = new Date(d.transaction_date);
          const m = last6Months.find(m => m.month === date.getMonth() && m.year === date.getFullYear());
          if (m) {
            m.amount += Number(d.amount || 0);
          }
        });
      }

      const maxAmount = Math.max(...last6Months.map(m => m.amount), 1); // Avoid div by 0
      const width = 400;
      const height = 160;
      const paddingTop = 30;
      const paddingBottom = 20;
      const graphHeight = height - paddingTop - paddingBottom;

      const points = last6Months.map((m, index) => {
        const x = (index / 5) * width;
        // Map amount to Y coordinate (inverted since SVG Y goes down)
        const y = height - paddingBottom - (m.amount / maxAmount) * graphHeight;
        return { x, y, amount: m.amount };
      });

      const pathArea = `M0 160 ${points.map(p => `L${p.x} ${p.y}`).join(' ')} L400 160 Z`;
      const pathLine = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');

      setChartData({
        labels: last6Months.map(m => m.label),
        points,
        pathArea,
        pathLine,
        lastPoint: points[points.length - 1]
      });

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    }
  };

  const scheduleRefresh = () => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      fetchDashboardData();
    }, 300);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchDashboardData();
    setRefreshing(false);
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel('admin-dashboard-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chit_groups' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chit_member_transactions' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'auctions' }, scheduleRefresh)
      .subscribe();

    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      supabase.removeChannel(channel);
    };
  }, []);

  const formatCurrency = (amount: number) => {
    return `₹${Math.round(amount).toLocaleString('en-IN')}`;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Top App Bar */}
      <View style={styles.appBar}>
        <View style={styles.appBarLeft}>
          <View style={styles.avatarContainer}>
            <Image
              source={{ uri: 'https://lh3.googleusercontent.com/aida-public/AB6AXuA3srOZezt7unaryShZPYC9qZFJXeb_dEEE3_bBz11fGPJiUPFjlyyJU_EI4_4BdnKliW-iYsROZHcJY8b30tSrOOUv-58aSwgiowMeVpHwMY8qiionwiVFYwg6VPEGRsxPv8z7gKIfOvr3lzFmldC4ftE8hJ91UGI0HaCMGVBkbd_6_YQxZQDIYQC-A1OsPS76BAI9wtZ0oSC8DVUE2REo8rnGOR_HVE--4QodRTHLTOpOrNkvu1oq-mUvcmp5qBzY8voj6J8_84I' }}
              style={styles.avatar}
            />
          </View>
          <Text style={styles.appBarTitle}>VSYK Admin</Text>
        </View>
        <TouchableOpacity style={styles.iconButton} onPress={() => Haptics.selectionAsync()}>
          <Svg width={24} height={24} viewBox="0 0 24 24" fill="#64748B">
            <Path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z" />
          </Svg>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#005E7D" />}
      >
        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnPrimary]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/(admin)/customers'); }}
          >
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="#FFFFFF">
              <Path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
            </Svg>
            <Text style={styles.actionBtnPrimaryText}>New Customer</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnSecondary]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/(admin)/groups'); }}
          >
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="#006A65">
              <Path d="M4 10h3v7H4zM10.5 10h3v7h-3zM2 19h20v3H2zM17 10h3v7h-3zM12 1L2 6v2h20V6z" />
            </Svg>
            <Text style={styles.actionBtnSecondaryText}>Chit Groups</Text>
          </TouchableOpacity>
        </View>

        {/* Bento KPI Grid */}
        <View style={styles.bentoGrid}>
          {/* Total AUM */}
          <View style={[styles.card, styles.cardFull, styles.blueTintShadow]}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardLabel}>TOTAL AUM</Text>
              <View style={styles.iconBoxPrimary}>
                <Svg width={20} height={20} viewBox="0 0 24 24" fill="#005E7D">
                  <Path d="M21 18v1c0 1.1-.9 2-2 2H5c-1.11 0-2-.9-2-2V5c0-1.1.89-2 2-2h14c1.1 0 2 .9 2 2v1h-9c-1.11 0-2 .9-2 2v8c0 1.1.89 2 2 2h9zm-9-2h10V8H12v8zm4-2.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" />
                </Svg>
              </View>
            </View>
            <Text style={styles.headlineLg}>{formatCurrency(metrics.totalAUM)}</Text>
            <View style={styles.trendRow}>
              <Svg width={14} height={14} viewBox="0 0 24 24" fill="#006A65">
                <Path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z" />
              </Svg>
              <Text style={styles.trendText}>Live from DB</Text>
            </View>
          </View>

          {/* Active Members */}
          <View style={[styles.card, styles.cardHalf]}>
            <Text style={styles.cardLabel}>MEMBERS</Text>
            <Text style={styles.headlineMd}>{metrics.members.toLocaleString('en-IN')}</Text>
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: '100%', backgroundColor: '#006A65' }]} />
            </View>
          </View>

          {/* Monthly Collection */}
          <View style={[styles.card, styles.cardHalf]}>
            <Text style={styles.cardLabel}>COLLECTION</Text>
            <Text style={styles.headlineMd}>{formatCurrency(metrics.collection)}</Text>
            <View style={styles.trendRow}>
              <Svg width={14} height={14} viewBox="0 0 24 24" fill="#005E7D">
                <Path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
              </Svg>
              <Text style={styles.trendTextPrimary}>TOTAL DEPOSITS</Text>
            </View>
          </View>

          {/* Pending Auctions */}
          <View style={[styles.card, styles.cardHalf]}>
            <Text style={styles.cardLabel}>AUCTIONS</Text>
            <Text style={styles.headlineMd}>{metrics.auctions}</Text>
            <Text style={styles.subtitleItalic}>Active/Upcoming</Text>
          </View>

          {/* Dividend Payouts */}
          <View style={[styles.card, styles.cardHalf]}>
            <Text style={styles.cardLabel}>DIVIDENDS</Text>
            <Text style={styles.headlineMd}>{formatCurrency(metrics.dividends)}</Text>
            <View style={styles.trendRow}>
              <Svg width={14} height={14} viewBox="0 0 24 24" fill="#006A65">
                <Path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z" />
              </Svg>
              <Text style={styles.trendTextSecondary}>PROCESSED</Text>
            </View>
          </View>
        </View>

        {/* Collection Trends Chart Placeholder */}
        <View style={[styles.chartCard, styles.blueTintShadow]}>
          <View style={styles.chartHeader}>
            <View>
              <Text style={styles.chartTitle}>Collection Trends</Text>
              <Text style={styles.chartSubtitle}>Last 6 Months Performance</Text>
            </View>
            <TouchableOpacity>
              <Svg width={24} height={24} viewBox="0 0 24 24" fill="#94A3B8">
                <Path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
              </Svg>
            </TouchableOpacity>
          </View>

          {/* SVG Chart */}
          <View style={styles.chartContainer}>
            <Svg style={StyleSheet.absoluteFill} viewBox="0 0 400 160" preserveAspectRatio="none">
              <Defs>
                <LinearGradient id="gradient-chart" x1="0" x2="0" y1="0" y2="1">
                  <Stop offset="0%" stopColor="#005E7D" stopOpacity="0.2" />
                  <Stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
                </LinearGradient>
              </Defs>
              {/* Grid Lines */}
              <Line x1="0" y1="40" x2="400" y2="40" stroke="#F1F5F9" strokeWidth="1" />
              <Line x1="0" y1="80" x2="400" y2="80" stroke="#F1F5F9" strokeWidth="1" />
              <Line x1="0" y1="120" x2="400" y2="120" stroke="#F1F5F9" strokeWidth="1" />

              {/* Dynamic Area Fill */}
              <Path d={chartData.pathArea} fill="url(#gradient-chart)" />

              {/* Dynamic Trend Line */}
              <Path d={chartData.pathLine} fill="none" stroke="#005E7D" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

              {/* Dynamic Data Points */}
              {chartData.points.map((p, i) => (
                <Circle key={i} cx={p.x} cy={p.y} r="4" fill={i === chartData.points.length - 1 ? "#10D7CD" : "#FFFFFF"} stroke="#005E7D" strokeWidth={i === chartData.points.length - 1 ? 0 : 2} />
              ))}
            </Svg>

            {/* Floating Indicator (Last Point) */}
            {chartData.lastPoint && (
              <View style={[styles.floatingIndicator, { right: 0, top: Math.max(0, chartData.lastPoint.y - 30) }]}>
                <Text style={styles.floatingIndicatorText}>{formatCurrency(chartData.lastPoint.amount)}</Text>
              </View>
            )}
          </View>

          <View style={styles.chartLabels}>
            {chartData.labels.map(month => (
              <Text key={month} style={styles.chartLabelText}>{month}</Text>
            ))}
          </View>
        </View>

        {/* Live Activity */}
        <View style={styles.activitySection}>
          <Text style={styles.activityTitle}>Live Activity</Text>

          {recentActivity.length === 0 ? (
            <Text style={{ fontFamily: 'Inter_400Regular', color: '#64748B', fontStyle: 'italic' }}>No recent activity to display.</Text>
          ) : (
            <>
              {(showAllActivity ? recentActivity : recentActivity.slice(0, 3)).map((activity, index) => (
                <View key={activity.id || index} style={styles.activityCard}>
                  <View style={[styles.activityIconBox, { backgroundColor: activity.type === 'credit' ? '#C1E8FF' : '#54FAEF' }]}>
                    {activity.type === 'credit' ? (
                      <Svg width={20} height={20} viewBox="0 0 24 24" fill="#001E2B"><Path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" /></Svg>
                    ) : (
                      <Svg width={20} height={20} viewBox="0 0 24 24" fill="#00201E"><Path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z" /></Svg>
                    )}
                  </View>
                  <View style={styles.activityContent}>
                    <Text style={styles.activityName} numberOfLines={1}>{activity.description}</Text>
                    <Text style={styles.activityDesc}>{activity.category || 'Transaction'}</Text>
                  </View>
                  <Text style={[styles.activityAmount, { color: activity.type === 'credit' ? '#006A65' : '#BA1A1A' }]}>
                    {activity.type === 'credit' ? '+' : '-'}{formatPaise(activity.amount)}
                  </Text>
                </View>
              ))}
              {recentActivity.length > 3 && (
                <TouchableOpacity 
                  style={{ alignSelf: 'center', marginTop: 8, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, backgroundColor: '#F1F5F9' }}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setShowAllActivity(!showAllActivity);
                  }}
                >
                  <Text style={{ fontFamily: 'Inter_600SemiBold', color: '#005E7D', fontSize: 14 }}>
                    {showAllActivity ? 'View Less' : 'View More'}
                  </Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FF',
  },
  appBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    height: 64,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    zIndex: 40,
  },
  appBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#005E7D',
    overflow: 'hidden',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  appBarTitle: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 20,
    color: '#155E75', // cyan-800
    letterSpacing: -0.5,
  },
  iconButton: {
    padding: 8,
    borderRadius: 20,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 120, // space for tab bar
  },
  quickActions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 32,
  },
  actionBtn: {
    flex: 1,
    height: 56,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  actionBtnPrimary: {
    backgroundColor: '#005E7D',
    shadowColor: '#01789E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
  },
  actionBtnSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#006A65',
  },
  actionBtnPrimaryText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  actionBtnSecondaryText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: '#006A65',
    letterSpacing: 0.5,
  },
  bentoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 32,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  cardFull: {
    width: '100%',
  },
  cardHalf: {
    width: '47.5%', // approximate to handle gap
    shadowColor: '#01789E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 15,
    elevation: 2,
  },
  blueTintShadow: {
    shadowColor: '#01789E',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 5,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  cardLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: '#64748B',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  iconBoxPrimary: {
    padding: 8,
    backgroundColor: 'rgba(0, 94, 125, 0.1)',
    borderRadius: 8,
  },
  headlineLg: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 32,
    color: '#0B1C30',
  },
  headlineMd: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 24,
    color: '#0B1C30',
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  trendText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: '#006A65',
  },
  trendTextPrimary: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    color: '#005E7D',
  },
  trendTextSecondary: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    color: '#006A65',
  },
  progressBarBg: {
    width: '100%',
    height: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: 3,
    marginTop: 12,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  subtitleItalic: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: '#94A3B8',
    fontStyle: 'italic',
    marginTop: 4,
  },
  errorCard: {
    backgroundColor: 'rgba(255, 218, 214, 0.3)',
    borderColor: 'rgba(186, 26, 26, 0.1)',
  },
  errorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  errorLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: '#BA1A1A',
    letterSpacing: 0.5,
  },
  errorHeadline: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 24,
    color: '#BA1A1A',
  },
  errorBtn: {
    backgroundColor: '#BA1A1A',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  errorBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    color: '#FFFFFF',
  },
  chartCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    marginBottom: 32,
    overflow: 'hidden',
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  chartTitle: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 20,
    color: '#0B1C30',
  },
  chartSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: '#64748B',
  },
  chartContainer: {
    height: 160,
    width: '100%',
    position: 'relative',
  },
  floatingIndicator: {
    position: 'absolute',
    top: 8,
    right: 48,
    backgroundColor: '#0B1C30',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  floatingIndicatorText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
  },
  chartLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  chartLabelText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    color: '#94A3B8',
  },
  activitySection: {
    marginBottom: 32,
  },
  activityTitle: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 20,
    color: '#0B1C30',
    marginBottom: 16,
  },
  activityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    marginBottom: 12,
    shadowColor: '#01789E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  activityIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  activityContent: {
    flex: 1,
  },
  activityName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: '#0B1C30',
  },
  activityDesc: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: '#64748B',
  },
  activityAmount: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    color: '#006A65',
  },
});
