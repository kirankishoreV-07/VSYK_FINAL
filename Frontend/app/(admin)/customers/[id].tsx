import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../../lib/supabase';
import { formatPaise, formatShortDate } from '../../../lib/hooks/useDashboard';

export default function CustomerDetailsScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  
  const [customer, setCustomer] = useState<any>(null);
  const [memberships, setMemberships] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [selectedMembership, setSelectedMembership] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCustomerData();
  }, [id]);

  const fetchCustomerData = async () => {
    try {
      setLoading(true);
      // Fetch Customer Details
      const { data: custData } = await supabase
        .from('customers')
        .select('*')
        .eq('id', id)
        .single();
      
      if (custData) setCustomer(custData);

      // Fetch Groups they are in
      const { data: memData } = await supabase
        .from('chit_members')
        .select(`
          id, 
          chit_group_id, 
          participation_type, 
          chit_groups (name, value, monthly_installment, duration_months, status)
        `)
        .eq('customer_id', id);

      if (memData) setMemberships(memData);

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTransactions = async (chitMemberId: string) => {
    setSelectedMembership(chitMemberId);
    try {
      const { data: txData } = await supabase
        .from('chit_member_transactions')
        .select('*')
        .eq('chit_member_id', chitMemberId)
        .order('transaction_date', { ascending: false });
        
      setTransactions(txData || []);
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color="#01789E" style={{ marginTop: 100 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* App Bar */}
      <View style={styles.appBar}>
        <View style={styles.appBarLeft}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
            <Svg width={24} height={24} viewBox="0 0 24 24" fill="#01789E">
              <Path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
            </Svg>
          </TouchableOpacity>
          <Text style={styles.appBarTitle}>Customer Details</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Profile Card */}
        {customer && (
          <View style={styles.profileCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{customer.full_name?.substring(0, 2).toUpperCase()}</Text>
            </View>
            <View>
              <Text style={styles.profileName}>{customer.full_name}</Text>
              <Text style={styles.profileId}>ID: {customer.customer_id} • {customer.customer_type}</Text>
              <Text style={styles.profileContact}>{customer.mobile} • {customer.email}</Text>
            </View>
          </View>
        )}

        <Text style={styles.sectionTitle}>Participating Groups</Text>

        {memberships.length === 0 ? (
          <Text style={styles.emptyText}>Not participating in any groups.</Text>
        ) : (
          memberships.map((mem) => {
            const group = mem.chit_groups;
            const isSelected = selectedMembership === mem.id;
            
            return (
              <View key={mem.id} style={styles.groupCard}>
                <TouchableOpacity 
                  style={styles.groupHeader} 
                  activeOpacity={0.7}
                  onPress={() => {
                    Haptics.selectionAsync();
                    if (isSelected) {
                      setSelectedMembership(null);
                    } else {
                      fetchTransactions(mem.id);
                    }
                  }}
                >
                  <View>
                    <Text style={styles.groupName}>{group.name}</Text>
                    <Text style={styles.groupDetails}>
                      Value: {formatPaise(group.value)} • {group.duration_months} Months
                    </Text>
                  </View>
                  <Svg width={24} height={24} viewBox="0 0 24 24" fill="#64748B" style={{ transform: [{ rotate: isSelected ? '180deg' : '0deg' }] }}>
                    <Path d="M7 10l5 5 5-5H7z" />
                  </Svg>
                </TouchableOpacity>

                {isSelected && (
                  <View style={styles.transactionsContainer}>
                    <Text style={styles.txTitle}>Timeline</Text>
                    {transactions.length === 0 ? (
                      <Text style={styles.emptyTxText}>No transactions yet.</Text>
                    ) : (
                      <View style={styles.timelineContainer}>
                        {transactions.map((tx, index) => {
                          const isLast = index === transactions.length - 1;
                          const isDividend = tx.payment_type === 'dividend';
                          const isPartial = !isDividend && tx.amount < group.monthly_installment;
                          
                          let nodeColor = '#3B82F6'; // Blue for Full Installment
                          let title = 'FULL INSTALLMENT';
                          let desc = `Successfully paid ${formatPaise(tx.amount)} towards the chit group.`;
                          
                          if (isDividend) {
                            nodeColor = '#10B981'; // Green for Dividend
                            title = 'DIVIDEND DISTRIBUTED';
                            desc = `Received dividend payout of ${formatPaise(tx.amount)} directly.`;
                          } else if (isPartial) {
                            nodeColor = '#F59E0B'; // Orange for Partial
                            title = 'PARTIAL PAYMENT';
                            desc = `Paid ${formatPaise(tx.amount)} out of ${formatPaise(group.monthly_installment)} expected.`;
                          }
                          
                          // Format date nicely (e.g., OCT 14, 2026)
                          const d = new Date(tx.transaction_date);
                          const dateString = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();

                          return (
                            <View key={tx.id} style={styles.timelineItem}>
                              <View style={styles.timelineGraphics}>
                                <View style={[styles.timelineDot, { borderColor: nodeColor }]}>
                                  <View style={[styles.timelineInnerDot, { backgroundColor: nodeColor }]} />
                                </View>
                                {!isLast && <View style={styles.timelineLine} />}
                              </View>

                              <View style={[styles.timelineContent, isLast && { paddingBottom: 0 }]}>
                                <Text style={[styles.timelineDate, { color: nodeColor }]}>{dateString}</Text>
                                <Text style={[styles.timelineTitle, { color: nodeColor }]}>{title}</Text>
                                <Text style={styles.timelineDesc}>{desc}</Text>
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  appBar: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, height: 64,
    backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  appBarLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconButton: { padding: 8, borderRadius: 20, backgroundColor: '#F1F5F9' },
  appBarTitle: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 20, color: '#164E63' },
  scrollContent: { padding: 20, paddingBottom: 60 },

  profileCard: {
    backgroundColor: '#FFFFFF', padding: 20, borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0',
    flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 24,
  },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#01789E', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 20, color: '#FFFFFF' },
  profileName: { fontFamily: 'Inter_700Bold', fontSize: 18, color: '#0B1C30' },
  profileId: { fontFamily: 'Inter_500Medium', fontSize: 12, color: '#64748B', marginTop: 2 },
  profileContact: { fontFamily: 'Inter_400Regular', fontSize: 12, color: '#94A3B8', marginTop: 4 },

  sectionTitle: { fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 18, color: '#164E63', marginBottom: 16 },
  emptyText: { fontFamily: 'Inter_400Regular', color: '#64748B', fontStyle: 'italic' },
  emptyTxText: { fontFamily: 'Inter_400Regular', color: '#94A3B8', fontSize: 12, marginTop: 8 },

  groupCard: {
    backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0',
    marginBottom: 12, overflow: 'hidden',
  },
  groupHeader: {
    padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  groupName: { fontFamily: 'Inter_600SemiBold', fontSize: 16, color: '#0B1C30' },
  groupDetails: { fontFamily: 'Inter_400Regular', fontSize: 12, color: '#64748B', marginTop: 4 },

  transactionsContainer: {
    backgroundColor: '#FAFAFA', padding: 20, borderTopWidth: 1, borderTopColor: '#F1F5F9',
  },
  txTitle: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 16, color: '#164E63', marginBottom: 20 },
  
  timelineContainer: { paddingLeft: 4, marginTop: 8 },
  timelineItem: { flexDirection: 'row' },
  timelineGraphics: { alignItems: 'center', width: 24, marginRight: 20 },
  timelineDot: { 
    width: 20, height: 20, borderRadius: 10, borderWidth: 2, 
    alignItems: 'center', justifyContent: 'center', zIndex: 2,
    backgroundColor: '#FFFFFF'
  },
  timelineInnerDot: { width: 10, height: 10, borderRadius: 5 },
  timelineLine: { width: 2, flex: 1, backgroundColor: '#334155', marginTop: -2, marginBottom: -2 },
  
  timelineContent: { flex: 1, paddingBottom: 32, paddingTop: 0 },
  timelineDate: { 
    fontFamily: 'SpaceGrotesk_700Bold', fontSize: 24, letterSpacing: -0.5, 
    lineHeight: 28, marginBottom: 8,
    borderBottomWidth: 1, borderBottomColor: '#CBD5E1', borderStyle: 'dashed', paddingBottom: 8
  },
  timelineTitle: { 
    fontFamily: 'Inter_700Bold', fontSize: 12, letterSpacing: 1.5, 
    marginBottom: 4, marginTop: 4 
  },
  timelineDesc: { 
    fontFamily: 'Inter_400Regular', fontSize: 13, color: '#64748B', lineHeight: 20 
  },
});
