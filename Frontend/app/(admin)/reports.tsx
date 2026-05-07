import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Platform, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import Svg, { Path, Rect } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../lib/supabase';

export default function AdminReports() {
  const [activeTab, setActiveTab] = useState('Overview');
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState({ revenue: 0, dividend: 0, profit: 0 });
  const [chartData, setChartData] = useState<{ labels: string[], data: { target: number, actual: number }[] }>({ labels: [], data: [] });
  const [defaulters, setDefaulters] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchReportsData = async () => {
    try {
      // 1. P&L Summary
      const { data: deposits } = await supabase.from('wallet_transactions').select('amount, created_at').eq('type', 'credit');
      const totalRev = deposits ? deposits.reduce((sum, d) => sum + Number(d.amount || 0), 0) : 0;

      const { data: dividendsTx } = await supabase.from('wallet_transactions').select('amount').ilike('description', '%dividend%');
      const totalDiv = dividendsTx ? dividendsTx.reduce((sum, d) => sum + Number(d.amount || 0), 0) : 0;

      const { data: groups } = await supabase.from('chit_groups').select('value');
      const totalGroupValue = groups ? groups.reduce((sum, g) => sum + Number(g.value || 0) / 100, 0) : 0;
      const totalProfit = totalGroupValue * 0.05; // Assuming 5% standard foreman commission on total group value

      setSummary({ revenue: totalRev, dividend: totalDiv, profit: totalProfit });

      // 2. Monthly Trends Chart (Last 6 Months)
      const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
      const now = new Date();
      const last6Months = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        last6Months.push({
          label: monthNames[d.getMonth()],
          year: d.getFullYear(),
          month: d.getMonth(),
          actual: 0,
          target: 0
        });
      }

      if (deposits) {
        deposits.forEach(d => {
          const date = new Date(d.created_at);
          const m = last6Months.find(m => m.month === date.getMonth() && m.year === date.getFullYear());
          if (m) m.actual += Number(d.amount || 0);
        });
      }

      const avgActual = last6Months.reduce((sum, m) => sum + m.actual, 0) / 6 || 50000;
      last6Months.forEach(m => {
        m.target = m.actual > 0 ? m.actual * 1.15 : avgActual; // Target is slightly higher than actual or avg
      });

      setChartData({
        labels: last6Months.map(m => m.label),
        data: last6Months.map(m => ({ target: m.target, actual: m.actual }))
      });

      // 3. Defaulters
      const { data: unpaidSchedules } = await supabase
        .from('payment_schedules')
        .select(`
          amount,
          due_date,
          chit_members (
            user_id,
            chit_groups ( name )
          )
        `)
        .eq('paid', false)
        .lt('due_date', new Date().toISOString());

      if (unpaidSchedules && unpaidSchedules.length > 0) {
        const userGroups = new Map();
        unpaidSchedules.forEach((s: any) => {
          const userId = s.chit_members?.user_id;
          if (!userId) return;

          if (!userGroups.has(userId)) {
            userGroups.set(userId, {
              id: userId,
              groupName: s.chit_members?.chit_groups?.name || 'Unknown Group',
              overdueAmount: 0,
              monthsOverdue: 0,
            });
          }

          const u = userGroups.get(userId);
          u.overdueAmount += Number(s.amount) / 100;
          u.monthsOverdue += 1;
        });
        setDefaulters(Array.from(userGroups.values()));
      } else {
        setDefaulters([]);
      }

      // 4. Audit Logs (Recent System Activity)
      const { data: txLogs } = await supabase
        .from('wallet_transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(15);

      if (txLogs) setLogs(txLogs);

    } catch (error) {
      console.error('Error fetching reports data:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchReportsData();
    setRefreshing(false);
  };

  const scheduleRefresh = () => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      fetchReportsData();
    }, 300);
  };

  useEffect(() => {
    fetchReportsData();
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel('admin-reports-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallet_transactions' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_schedules' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chit_groups' }, scheduleRefresh)
      .subscribe();

    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      supabase.removeChannel(channel);
    };
  }, []);

  const formatCurrency = (amount: number) => {
    return `₹${Math.round(amount).toLocaleString('en-IN')}`;
  };

  // Helper for rendering chart bars dynamically based on max value
  const maxChartVal = Math.max(...chartData.data.map(d => Math.max(d.actual, d.target)), 1000);
  const chartHeight = 120; // Maximum bar height
  
  const router = require('expo-router').useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Top App Bar */}
      <View style={styles.appBar}>
        <View style={styles.appBarLeft}>
          <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12 }}>
            <Svg width={24} height={24} viewBox="0 0 24 24" fill="#01789E">
              <Path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
            </Svg>
          </TouchableOpacity>
          <Text style={styles.appBarTitle}>Reports & Analytics</Text>
        </View>
        <View style={styles.appBarRight}>
          <TouchableOpacity style={styles.exportBtn} onPress={() => Haptics.selectionAsync()}>
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="#005E7D">
              <Path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
            </Svg>
            <Text style={styles.exportBtnText}>Export</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabScroll}>
          {['Overview', 'Defaulters', 'Audit Logs'].map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => { setActiveTab(tab); Haptics.selectionAsync(); }}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#005E7D" />}
      >

        {activeTab === 'Overview' && (
          <View>
            {/* Profit & Loss Summary */}
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>P&L Summary (YTD)</Text>

              <View style={styles.summaryRow}>
                <View style={styles.summaryCol}>
                  <Text style={styles.summaryLabel}>Total Revenue</Text>
                  <Text style={[styles.summaryVal, { color: '#005E7D' }]}>{formatCurrency(summary.revenue)}</Text>
                </View>
                <View style={styles.summaryCol}>
                  <Text style={styles.summaryLabel}>Total Dividend</Text>
                  <Text style={[styles.summaryVal, { color: '#0B1C30' }]}>{formatCurrency(summary.dividend)}</Text>
                </View>
              </View>

              <View style={styles.netProfitBox}>
                <Text style={styles.netProfitLabel}>Est. Commission Profit</Text>
                <Text style={styles.netProfitVal}>{formatCurrency(summary.profit)}</Text>
              </View>
            </View>

            {/* Monthly Trends Chart */}
            <View style={styles.chartCard}>
              <View style={styles.chartHeader}>
                <Text style={styles.chartTitle}>Monthly Collections</Text>
                <Text style={styles.chartSubtitle}>Target vs Actual</Text>
              </View>

              <View style={styles.chartContainer}>
                <Svg width="100%" height={160} viewBox="0 0 300 160" preserveAspectRatio="none">
                  {/* Grid */}
                  <Path d="M0 40h300M0 80h300M0 120h300" stroke="#F1F5F9" strokeWidth="1" />

                  {/* Dynamic Bars */}
                  {chartData.data.map((d, index) => {
                    const xOffset = 20 + (index * 50);
                    // Invert height calculation (SVG y goes downwards from 0)
                    const targetHeight = (d.target / maxChartVal) * chartHeight;
                    const actualHeight = (d.actual / maxChartVal) * chartHeight;
                    const targetY = 160 - targetHeight;
                    const actualY = 160 - actualHeight;

                    return (
                      <React.Fragment key={index}>
                        <Rect x={xOffset} y={targetY} width="16" height={targetHeight} fill="#E2E8F0" rx="4" />
                        <Rect x={xOffset} y={actualY} width="16" height={actualHeight} fill={d.actual >= d.target ? "#00D1C1" : "#005E7D"} rx="4" />
                      </React.Fragment>
                    );
                  })}
                </Svg>
              </View>
              <View style={styles.chartLabels}>
                {chartData.labels.map(m => (
                  <Text key={m} style={styles.chartLabelText}>{m}</Text>
                ))}
              </View>

              <View style={styles.legendRow}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: '#E2E8F0' }]} />
                  <Text style={styles.legendText}>Target</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: '#005E7D' }]} />
                  <Text style={styles.legendText}>Actual</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {activeTab === 'Defaulters' && (
          <View>
            <View style={styles.defaultersHeaderRow}>
              <Text style={styles.sectionTitle}>High Risk Accounts</Text>
              <View style={styles.badgeDanger}>
                <Text style={styles.badgeDangerText}>{defaulters.length} Total</Text>
              </View>
            </View>

            {defaulters.length === 0 ? (
              <Text style={{ fontFamily: 'Inter_400Regular', color: '#64748B', textAlign: 'center', marginTop: 32 }}>No overdue accounts found.</Text>
            ) : (
              defaulters.map((d, i) => (
                <View key={i} style={styles.defaulterCard}>
                  <View style={styles.defaulterTop}>
                    <View>
                      <Text style={styles.defaulterName}>Member ID: {d.id.substring(0, 8)}</Text>
                      <Text style={styles.defaulterSub}>Group {d.groupName} • {d.monthsOverdue} Months Overdue</Text>
                    </View>
                    <View style={[styles.riskBadge, { backgroundColor: d.monthsOverdue > 2 ? '#FEE2E2' : '#FEF3C7', borderColor: d.monthsOverdue > 2 ? '#FECACA' : '#FDE68A' }]}>
                      <Text style={[styles.riskBadgeText, { color: d.monthsOverdue > 2 ? '#991B1B' : '#B45309' }]}>
                        {d.monthsOverdue > 2 ? 'CRITICAL' : 'WARNING'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.defaulterMid}>
                    <View>
                      <Text style={styles.defLabel}>OVERDUE AMOUNT</Text>
                      <Text style={styles.defVal}>{formatCurrency(d.overdueAmount)}</Text>
                    </View>
                  </View>
                  <View style={styles.defaulterBottom}>
                    <TouchableOpacity style={[styles.defActionBtn, d.monthsOverdue <= 2 && { backgroundColor: '#F1F5F9' }]}>
                      <Text style={[styles.defActionText, d.monthsOverdue <= 2 && { color: '#475569' }]}>
                        {d.monthsOverdue > 2 ? 'Send Legal Notice' : 'Send Reminder SMS'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {activeTab === 'Audit Logs' && (
          <View>
            <Text style={styles.sectionTitle}>System Activity Logs</Text>

            {logs.length === 0 ? (
              <Text style={{ fontFamily: 'Inter_400Regular', color: '#64748B', textAlign: 'center', marginTop: 32 }}>No recent system logs.</Text>
            ) : (
              <View style={styles.timeline}>
                {logs.map((log, i) => (
                  <View key={log.id || i} style={styles.timelineItem}>
                    <View style={styles.timelineDotBox}>
                      <View style={[styles.timelineDot, { backgroundColor: log.type === 'credit' ? '#00D1C1' : '#F59E0B' }]} />
                      <View style={[styles.timelineLine, i === logs.length - 1 && { opacity: 0 }]} />
                    </View>
                    <View style={styles.timelineContent}>
                      <Text style={styles.tlTime}>{new Date(log.created_at).toLocaleString()}</Text>
                      <Text style={styles.tlTitle}>{log.category}</Text>
                      <Text style={styles.tlDesc}>{log.description}</Text>
                    </View>
                  </View>
                ))}
              </View>
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
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9', zIndex: 40,
  },
  appBarLeft: { flexDirection: 'row', alignItems: 'center' },
  appBarTitle: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 20, color: '#0F172A' },
  appBarRight: {},
  exportBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#EFF6FF', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12,
  },
  exportBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: '#005E7D' },

  tabContainer: { backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  tabScroll: { paddingHorizontal: 20 },
  tab: { paddingVertical: 16, marginRight: 32, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: '#005E7D' },
  tabText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#64748B' },
  tabTextActive: { color: '#005E7D' },

  scrollContent: { padding: 20, paddingBottom: 120 },

  summaryCard: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 24, marginBottom: 24, borderWidth: 1, borderColor: '#F1F5F9', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  summaryTitle: { fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 18, color: '#0B1C30', marginBottom: 20 },
  summaryRow: { flexDirection: 'row', marginBottom: 20 },
  summaryCol: { flex: 1 },
  summaryLabel: { fontFamily: 'Inter_500Medium', fontSize: 12, color: '#64748B', marginBottom: 4 },
  summaryVal: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 24 },
  netProfitBox: { backgroundColor: '#F0FDF4', padding: 16, borderRadius: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  netProfitLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#166534' },
  netProfitVal: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 20, color: '#16A34A' },

  chartCard: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 24, borderWidth: 1, borderColor: '#F1F5F9', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  chartHeader: { marginBottom: 24 },
  chartTitle: { fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 18, color: '#0B1C30' },
  chartSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 12, color: '#64748B' },
  chartContainer: { height: 160, marginBottom: 12 },
  chartLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  chartLabelText: { fontFamily: 'Inter_600SemiBold', fontSize: 10, color: '#94A3B8' },
  legendRow: { flexDirection: 'row', justifyContent: 'center', gap: 24 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendDot: { width: 12, height: 12, borderRadius: 4 },
  legendText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: '#64748B' },

  defaultersHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionTitle: { fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 18, color: '#164E63' },
  badgeDanger: { backgroundColor: '#FEF2F2', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100 },
  badgeDangerText: { fontFamily: 'Inter_700Bold', fontSize: 10, color: '#EF4444' },

  defaulterCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: '#F1F5F9', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  defaulterTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  defaulterName: { fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 18, color: '#0B1C30' },
  defaulterSub: { fontFamily: 'Inter_500Medium', fontSize: 12, color: '#64748B', marginTop: 2 },
  riskBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100, borderWidth: 1 },
  riskBadgeText: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.5 },
  defaulterMid: { marginBottom: 20 },
  defLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 10, color: '#64748B', letterSpacing: 0.5, marginBottom: 4 },
  defVal: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 20, color: '#EF4444' },
  defaulterBottom: { borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: 16 },
  defActionBtn: { backgroundColor: '#EF4444', paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  defActionText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#FFFFFF' },

  timeline: { paddingLeft: 8, marginTop: 16 },
  timelineItem: { flexDirection: 'row', minHeight: 80 },
  timelineDotBox: { width: 30, alignItems: 'center' },
  timelineDot: { width: 12, height: 12, borderRadius: 6, marginTop: 4, zIndex: 1 },
  timelineLine: { width: 2, flex: 1, backgroundColor: '#E2E8F0', marginTop: -8, marginBottom: 4 },
  timelineContent: { flex: 1, paddingBottom: 32, paddingLeft: 8 },
  tlTime: { fontFamily: 'Inter_500Medium', fontSize: 12, color: '#94A3B8', marginBottom: 4 },
  tlTitle: { fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 16, color: '#0B1C30', marginBottom: 6 },
  tlDesc: { fontFamily: 'Inter_400Regular', fontSize: 14, color: '#475569', lineHeight: 20 },
});
