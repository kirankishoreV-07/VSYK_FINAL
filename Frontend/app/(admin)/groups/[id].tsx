import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Modal, TextInput, Alert, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Circle } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../../lib/supabase';

export default function AdminGroupDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const [group, setGroup] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Add Member Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [participation, setParticipation] = useState<'full' | 'half'>('full');

  // Transaction History Modal State
  const [selectedMemberForTx, setSelectedMemberForTx] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [auctions, setAuctions] = useState<any[]>([]);
  const [showLogPayment, setShowLogPayment] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [selectedAuctionId, setSelectedAuctionId] = useState<string>('');
  const [loggingPayment, setLoggingPayment] = useState(false);

  const fetchGroup = async () => {
    try {
      const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(String(id));
      let query = supabase.from('chit_groups').select('*');

      if (isUuid) {
        query = query.eq('id', id);
      } else {
        query = query.eq('group_code', id);
      }

      const { data, error } = await query.single();
      if (error) throw error;
      if (data) setGroup(data);
    } catch (err) {
      console.error('Error fetching group:', err);
    }
  };

  const fetchMembers = async () => {
    if (!group?.id) return;
    try {
      const { data } = await supabase
        .from('chit_members')
        .select('*, customers(full_name, phone, customer_id)')
        .eq('chit_group_id', group.id)
        .order('ticket_number', { ascending: true });
      setMembers(data || []);
    } catch (err) {
      console.error('Error fetching members:', err);
    }
  };

  const fetchCustomers = async () => {
    try {
      const { data } = await supabase.from('customers').select('id, full_name, phone, customer_id').order('full_name');
      setCustomers(data || []);
    } catch (err) {
      console.error('Error fetching customers:', err);
    }
  };

  const fetchAuctions = async () => {
    if (!group?.id) return;
    try {
      const { data } = await supabase
        .from('auctions')
        .select('*')
        .eq('chit_group_id', group.id)
        .order('auction_number', { ascending: false });
      setAuctions(data || []);
    } catch (err) {
      console.error('Error fetching auctions:', err);
    }
  };

  useEffect(() => { fetchGroup(); }, [id]);
  useEffect(() => {
    if (group?.id) {
      fetchMembers();
      fetchAuctions();
    }
  }, [group?.id]);

  useEffect(() => {
    if (!group?.id) return;

    const channel = supabase
      .channel('admin-group-detail-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chit_groups', filter: `id=eq.${group.id}` }, fetchGroup)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chit_members', filter: `chit_group_id=eq.${group.id}` }, fetchMembers)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'auctions', filter: `chit_group_id=eq.${group.id}` }, fetchAuctions)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chit_member_transactions' }, () => {
        if (selectedMemberForTx?.id) fetchTransactions(selectedMemberForTx.id);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [group?.id, selectedMemberForTx?.id]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchGroup();
    await fetchMembers();
    await fetchAuctions();
    setRefreshing(false);
    setLoading(false);
  };

  useEffect(() => { onRefresh(); }, []);

  // --- ADD MEMBER LOGIC ---
  const handleSelectCustomer = (customer: any) => {
    setSelectedCustomer(customer);
    setParticipation('full');
  };

  const handleAddMemberConfirm = async () => {
    if (!group?.id || !selectedCustomer?.id) return;

    // Safety check on frontend
    const alreadyExists = members.some(m => m.customer_id === selectedCustomer.id);
    if (alreadyExists) {
      Alert.alert('Already Enrolled', 'This customer is already a member of this group.');
      return;
    }

    setAdding(true);
    try {
      const share = participation === 'full' ? 1.0 : 0.5;
      const { error } = await supabase.from('chit_members').insert([{
        chit_group_id: group.id,
        customer_id: selectedCustomer.id,
        participation_type: participation,
        participation_share: share,
      }]);

      if (error) {
        if (error.code === '23505') Alert.alert('Already Added', 'This member is already in the group.');
        else Alert.alert('Error', error.message);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        fetchMembers();
        setShowAddModal(false);
        setSelectedCustomer(null);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setAdding(false);
    }
  };

  const handleStartAuction = async () => {
    if (!group?.id) return;
    Alert.alert('Start Auction', `Create a new auction for ${group.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Start', onPress: async () => {
          try {
            const auctionNum = auctions.length + 1;
            const { error } = await supabase.from('auctions').insert([{
              chit_group_id: group.id,
              auction_number: auctionNum,
              status: 'live',
              min_bid: 0,
              current_bid: 0,
              prize_pool: group.value || 0,
              time_limit_mins: 60,
              scheduled_at: new Date().toISOString(),
            }]);
            if (error) throw error;
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            router.push('/(admin)/auctions/live');
          } catch (err: any) {
            Alert.alert('Error', err.message);
          }
        }
      },
    ]);
  };

  const handleRemoveMember = (member: any) => {
    if (!member?.id) return;
    Alert.alert(
      'Remove Member',
      `Are you sure you want to remove ${member?.customers?.full_name || 'this member'}? All their transaction history will be permanently deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase.from('chit_members').delete().eq('id', member.id);
              if (error) throw error;
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              setSelectedMemberForTx(null);
              fetchMembers();
            } catch (err: any) {
              Alert.alert('Error', err.message);
            }
          }
        }
      ]
    );
  };

  // --- TRANSACTION LOGIC ---
  const openMemberTransactions = async (member: any, displayTicket: number) => {
    const memberWithTicket = { ...member, display_ticket: displayTicket };
    setSelectedMemberForTx(memberWithTicket);
    fetchTransactions(member.id);
  };

  const fetchTransactions = async (chitMemberId: string) => {
    try {
      const { data } = await supabase
        .from('chit_member_transactions')
        .select('*, auctions(auction_number)')
        .eq('chit_member_id', chitMemberId)
        .order('transaction_date', { ascending: false });
      setTransactions(data || []);
    } catch (err) {
      console.error('Error fetching tx:', err);
    }
  };

  const handleLogPayment = async () => {
    if (!selectedMemberForTx || !selectedAuctionId || !paymentAmount) {
      Alert.alert('Error', 'Please enter amount and select an auction.');
      return;
    }

    const amountInPaise = Math.round(parseFloat(paymentAmount) * 100);
    if (isNaN(amountInPaise) || amountInPaise <= 0) {
      Alert.alert('Error', 'Invalid amount.');
      return;
    }

    setLoggingPayment(true);
    try {
      const { error } = await supabase.from('chit_member_transactions').insert([{
        chit_member_id: selectedMemberForTx.id,
        auction_id: selectedAuctionId,
        amount: amountInPaise,
        payment_type: 'installment',
        status: 'completed',
      }]);

      if (error) throw error;

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPaymentAmount('');
      setSelectedAuctionId('');
      setShowLogPayment(false);
      fetchTransactions(selectedMemberForTx.id);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setLoggingPayment(false);
    }
  };


  const prizePool = Number(group?.value || 0) / 100;
  const capacity = group?.capacity || 50;
  const totalShares = members.reduce((sum, m) => sum + (Number(m.participation_share) || 1), 0);

  const filteredCustomers = customers.filter(c => {
    const matchesSearch = c.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) || c.phone?.includes(searchQuery);
    const isAlreadyMember = members.some(m => m.customer_id === c.id);
    return matchesSearch && !isAlreadyMember;
  });

  const calculatedEmi = ((Number(group?.value) || 0) / (Number(group?.no_of_installments) || Number(group?.duration_months) || 1));
  const baseEmi = (Number(group?.emi_amount) || Number(group?.monthly_installment) || calculatedEmi) / 100;
  const displayEmi = participation === 'full' ? baseEmi : baseEmi / 2;

  if (loading && !group) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ActivityIndicator color="#005E7D" size="large" style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.appBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Svg width={24} height={24} viewBox="0 0 24 24" fill="#0F172A">
            <Path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
          </Svg>
        </TouchableOpacity>
        <View style={styles.headerTitleBox}>
          <Text style={styles.appBarTitle} numberOfLines={1}>{group?.name || 'Group'}</Text>
          <Text style={styles.appBarSubtitle}>{group?.group_code || id} • {group?.duration_months || 0} Months</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: group?.status === 'active' ? 'rgba(84,250,239,0.3)' : '#F1F5F9' }]}>
          <Text style={[styles.badgeText, { color: group?.status === 'active' ? '#00716b' : '#64748B' }]}>
            {(group?.status || 'ACTIVE').toUpperCase()}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#005E7D" />}
      >
        {/* Group Info Card */}
        <View style={styles.engineCard}>
          <View style={styles.glowBg} />
          <View style={styles.engineHeader}>
            <Text style={styles.engineTitle}>Group Overview</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={styles.statusDot} />
              <Text style={styles.engineSubtitle}>{group?.frequency || 'Monthly'} • EMI: ₹{baseEmi.toLocaleString('en-IN')}</Text>
            </View>
          </View>

          <View style={styles.engineStatsRow}>
            <View style={styles.engineStatCol}>
              <Text style={styles.engineStatLabel}>CHIT VALUE</Text>
              <Text style={styles.engineStatVal}>₹{prizePool.toLocaleString('en-IN')}</Text>
            </View>
            <View style={styles.engineDivider} />
            <View style={styles.engineStatCol}>
              <Text style={styles.engineStatLabel}>INSTALLMENTS</Text>
              <Text style={styles.engineStatVal}>{group?.no_of_installments || group?.duration_months || 0}</Text>
            </View>
            <View style={styles.engineDivider} />
            <View style={styles.engineStatCol}>
              <Text style={styles.engineStatLabel}>SHARES</Text>
              <Text style={[styles.engineStatVal, { color: '#54FAEF' }]}>{totalShares} / {capacity}</Text>
            </View>
          </View>

          {/* Quick Actions */}
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <TouchableOpacity style={styles.executeBtn} onPress={() => { setSelectedCustomer(null); setShowAddModal(true); fetchCustomers(); }}>
              <Text style={styles.executeBtnText}>+ ADD MEMBER</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.executeBtn, { backgroundColor: '#10B981' }]} onPress={handleStartAuction}>
              <Text style={styles.executeBtnText}>START AUCTION</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Collection Health */}
        <View style={styles.healthCard}>
          <View style={styles.healthLeft}>
            <Text style={styles.healthTitle}>Enrollment Status</Text>
            <Text style={styles.healthSub}>{totalShares} of {capacity} shares filled</Text>
            <View style={styles.healthLegendRow}>
              <View style={[styles.legendDot, { backgroundColor: '#10B981' }]} />
              <Text style={styles.legendText}>Enrolled ({totalShares})</Text>
            </View>
            <View style={styles.healthLegendRow}>
              <View style={[styles.legendDot, { backgroundColor: '#F59E0B' }]} />
              <Text style={styles.legendText}>Available ({capacity - totalShares})</Text>
            </View>
          </View>
          <View style={styles.progressCircle}>
            <Svg width={100} height={100} viewBox="0 0 100 100">
              <Circle cx="50" cy="50" r="40" stroke="#F1F5F9" strokeWidth="12" fill="none" />
              <Circle cx="50" cy="50" r="40" stroke="#10B981" strokeWidth="12" fill="none"
                strokeDasharray="251" strokeDashoffset={String(251 - (totalShares / capacity) * 251)}
                strokeLinecap="round" transform="rotate(-90 50 50)" />
            </Svg>
            <View style={styles.circleInner}>
              <Text style={styles.circleText}>{capacity > 0 ? Math.round((totalShares / capacity) * 100) : 0}%</Text>
            </View>
          </View>
        </View>

        {/* Enrolled Members */}
        <View style={styles.membersSection}>
          <Text style={styles.sectionTitle}>Enrolled Members ({members.length})</Text>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: '#64748B', marginBottom: 12, marginLeft: 4 }}>Tap a member to view transaction history.</Text>
          {members.length === 0 ? (
            <Text style={{ fontFamily: 'Inter_400Regular', color: '#94A3B8', textAlign: 'center', marginTop: 24 }}>
              No members enrolled yet. Tap "Add Member" above.
            </Text>
          ) : (
            members.map((m, index) => {
              const displayTicket = index + 1;
              const name = m.customers?.full_name || `Member #${displayTicket}`;
              const initial = name.charAt(0).toUpperCase();
              const isHalf = m.participation_type === 'half';

              return (
                <TouchableOpacity key={m.id} style={styles.memberCard} onPress={() => openMemberTransactions(m, displayTicket)}>
                  <View style={styles.memberInfo}>
                    <View style={styles.avatarMini}><Text style={styles.avatarMiniText}>{initial}</Text></View>
                    <View>
                      <Text style={styles.memberName}>{name}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        <Text style={styles.memberId}>Ticket #{displayTicket}</Text>
                        <View style={[styles.partBadge, { backgroundColor: isHalf ? '#FEF2F2' : '#EFF6FF' }]}>
                          <Text style={[styles.partBadgeText, { color: isHalf ? '#DC2626' : '#2563EB' }]}>
                            {isHalf ? '½ Share' : '1 Share'}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>
                  <Svg width={20} height={20} viewBox="0 0 24 24" fill="#CBD5E1">
                    <Path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
                  </Svg>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* --- ADD MEMBER MODAL --- */}
      <Modal visible={showAddModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => {
              if (selectedCustomer) setSelectedCustomer(null);
              else setShowAddModal(false);
            }} style={styles.closeBtn}>
              <Svg width={24} height={24} viewBox="0 0 24 24" fill="#64748B">
                <Path d={selectedCustomer ? "M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" : "M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"} />
              </Svg>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>
              {selectedCustomer ? 'Select Participation' : 'Select Customer'}
            </Text>
            <View style={{ width: 40 }} />
          </View>

          {!selectedCustomer ? (
            <>
              <View style={{ paddingHorizontal: 20, marginBottom: 16, marginTop: 16 }}>
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search by name or phone..."
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
              </View>
              <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}>
                {filteredCustomers.length === 0 ? (
                  <Text style={{ color: '#94A3B8', fontFamily: 'Inter_400Regular', textAlign: 'center', marginTop: 32 }}>
                    No customers found. Add customers first.
                  </Text>
                ) : (
                  filteredCustomers.map(c => (
                    <TouchableOpacity key={c.id} style={styles.customerRow} onPress={() => handleSelectCustomer(c)}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <View style={styles.avatarMini}>
                          <Text style={styles.avatarMiniText}>{(c.full_name || 'U').charAt(0)}</Text>
                        </View>
                        <View>
                          <Text style={styles.memberName}>{c.full_name}</Text>
                          <Text style={styles.memberId}>{c.customer_id} • {c.phone}</Text>
                        </View>
                      </View>
                      <Svg width={20} height={20} viewBox="0 0 24 24" fill="#94A3B8">
                        <Path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
                      </Svg>
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
            </>
          ) : (
            <View style={styles.participationContainer}>
              <View style={styles.selectedCustomerCard}>
                <View style={styles.avatarMini}>
                  <Text style={styles.avatarMiniText}>{(selectedCustomer.full_name || 'U').charAt(0)}</Text>
                </View>
                <View>
                  <Text style={styles.memberName}>{selectedCustomer.full_name}</Text>
                  <Text style={styles.memberId}>{selectedCustomer.customer_id} • {selectedCustomer.phone}</Text>
                </View>
              </View>

              <Text style={styles.sectionTitle}>Participation Type</Text>

              <View style={styles.partOptionsRow}>
                <TouchableOpacity style={[styles.partOption, participation === 'full' && styles.partOptionActive]} onPress={() => { setParticipation('full'); Haptics.selectionAsync(); }}>
                  <View style={styles.partRadioContainer}>
                    <View style={[styles.partRadio, participation === 'full' && styles.partRadioActive]}>
                      {participation === 'full' && <View style={styles.partRadioInner} />}
                    </View>
                  </View>
                  <Text style={[styles.partTitle, participation === 'full' && styles.partTitleActive]}>Full Share</Text>
                  <Text style={styles.partDesc}>Standard 100% EMI and dividend participation.</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.partOption, participation === 'half' && styles.partOptionActive]} onPress={() => { setParticipation('half'); Haptics.selectionAsync(); }}>
                  <View style={styles.partRadioContainer}>
                    <View style={[styles.partRadio, participation === 'half' && styles.partRadioActive]}>
                      {participation === 'half' && <View style={styles.partRadioInner} />}
                    </View>
                  </View>
                  <Text style={[styles.partTitle, participation === 'half' && styles.partTitleActive]}>Half Share</Text>
                  <Text style={styles.partDesc}>50% EMI contribution and 50% dividend.</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.emiPreviewBox}>
                <Text style={styles.emiPreviewLabel}>Estimated Monthly EMI</Text>
                <Text style={styles.emiPreviewVal}>₹{displayEmi.toLocaleString('en-IN')}</Text>
                <Text style={styles.emiPreviewSub}>* Before dividend deductions</Text>
              </View>

              <TouchableOpacity style={[styles.executeBtn, { flex: 0, marginTop: 'auto', marginBottom: 40 }]} onPress={handleAddMemberConfirm} disabled={adding}>
                {adding ? <ActivityIndicator color="#0F172A" /> : <Text style={styles.executeBtnText}>CONFIRM & ADD MEMBER</Text>}
              </TouchableOpacity>
            </View>
          )}
        </SafeAreaView>
      </Modal>

      {/* --- TRANSACTION HISTORY MODAL --- */}
      <Modal visible={!!selectedMemberForTx} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
          <View style={[styles.modalHeader, { backgroundColor: '#FFFFFF' }]}>
            <TouchableOpacity onPress={() => { setSelectedMemberForTx(null); setShowLogPayment(false); }} style={styles.closeBtn}>
              <Svg width={24} height={24} viewBox="0 0 24 24" fill="#64748B">
                <Path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
              </Svg>
            </TouchableOpacity>
            <View style={{ alignItems: 'center' }}>
              <Text style={styles.modalTitle}>Payment History</Text>
              <Text style={styles.appBarSubtitle}>{selectedMemberForTx?.customers?.full_name} • Ticket #{selectedMemberForTx?.display_ticket}</Text>
            </View>
            <TouchableOpacity onPress={() => handleRemoveMember(selectedMemberForTx)} style={[styles.closeBtn, { backgroundColor: '#FEF2F2' }]}>
              <Svg width={20} height={20} viewBox="0 0 24 24" fill="#EF4444">
                <Path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
              </Svg>
            </TouchableOpacity>
          </View>

          {!showLogPayment ? (
            <>
              <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }}>
                {/* Summary Card */}
                <View style={styles.txSummaryCard}>
                  <Text style={styles.txSummaryLabel}>Total Amount Paid</Text>
                  <Text style={styles.txSummaryValue}>
                    ₹{(transactions.reduce((sum, tx) => sum + (tx.amount || 0), 0) / 100).toLocaleString('en-IN')}
                  </Text>
                  <View style={styles.txSummaryDivider} />
                  <View style={styles.txSummaryRow}>
                    <Text style={styles.txSummarySubText}>{transactions.length} Transactions</Text>
                    <View style={styles.statusBadge}>
                      <Text style={[styles.statusText, { color: '#10B981' }]}>ACTIVE</Text>
                    </View>
                  </View>
                </View>

                <Text style={styles.sectionTitle}>Recent Transactions</Text>

                {transactions.length === 0 ? (
                  <View style={{ alignItems: 'center', marginTop: 40, padding: 30, backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#F1F5F9' }}>
                    <Svg width={48} height={48} viewBox="0 0 24 24" fill="#CBD5E1" style={{ marginBottom: 16 }}>
                      <Path d="M21 18v1c0 1.1-.9 2-2 2H5c-1.11 0-2-.9-2-2V5c0-1.1.89-2 2-2h14c1.1 0 2 .9 2 2v1h-9c-1.11 0-2 .9-2 2v8c0 1.1.89 2 2 2h9zm-9-2h10V8H12v8zm4-2.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" />
                    </Svg>
                    <Text style={{ fontFamily: 'SpaceGrotesk_600SemiBold', color: '#0F172A', fontSize: 16, marginBottom: 8 }}>No Payments Yet</Text>
                    <Text style={{ fontFamily: 'Inter_400Regular', color: '#64748B', fontSize: 13, textAlign: 'center' }}>This member hasn't made any payments for this group yet.</Text>
                  </View>
                ) : (
                  transactions.map(tx => (
                    <View key={tx.id} style={styles.txRow}>
                      <View style={styles.txIconBoxAlt}>
                        <Svg width={20} height={20} viewBox="0 0 24 24" fill="#005E7D">
                          <Path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
                        </Svg>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.txTitleAlt}>Auction #{tx.auctions?.auction_number || '?'}</Text>
                        <Text style={styles.txDateAlt}>
                          {new Date(tx.transaction_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} • {new Date(tx.transaction_date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.txAmountAlt}>+ ₹{(tx.amount / 100).toLocaleString('en-IN')}</Text>
                        <Text style={styles.txStatusAlt}>Success</Text>
                      </View>
                    </View>
                  ))
                )}
              </ScrollView>
              <View style={{ padding: 20, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#F1F5F9', position: 'absolute', bottom: 0, width: '100%' }}>
                <TouchableOpacity style={[styles.executeBtn, { flex: 0 }]} onPress={() => setShowLogPayment(true)}>
                  <Text style={styles.executeBtnText}>LOG NEW PAYMENT</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <ScrollView contentContainerStyle={{ padding: 20 }}>
              <TouchableOpacity onPress={() => setShowLogPayment(false)} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24 }}>
                <Svg width={20} height={20} viewBox="0 0 24 24" fill="#64748B"><Path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" /></Svg>
                <Text style={{ fontFamily: 'Inter_500Medium', color: '#64748B', marginLeft: 8 }}>Back to History</Text>
              </TouchableOpacity>

              <Text style={styles.sectionTitle}>Select Auction Cycle</Text>
              {auctions.length === 0 ? (
                <Text style={{ fontFamily: 'Inter_400Regular', color: '#94A3B8', marginBottom: 20 }}>No auctions exist for this group yet.</Text>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 24 }}>
                  {auctions.map(a => (
                    <TouchableOpacity
                      key={a.id}
                      style={[styles.auctionChip, selectedAuctionId === a.id && styles.auctionChipActive]}
                      onPress={() => setSelectedAuctionId(a.id)}
                    >
                      <Text style={[styles.auctionChipText, selectedAuctionId === a.id && styles.auctionChipTextActive]}>
                        Auction #{a.auction_number}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}

              <Text style={styles.sectionTitle}>Payment Amount (₹)</Text>
              <TextInput
                style={[styles.searchInput, { fontSize: 24, fontFamily: 'SpaceGrotesk_700Bold', paddingVertical: 16 }]}
                placeholder="0.00"
                keyboardType="numeric"
                value={paymentAmount}
                onChangeText={setPaymentAmount}
              />
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: '#64748B', marginTop: 8, marginBottom: 32 }}>
                Enter partial or full amount paid by the member.
              </Text>

              <TouchableOpacity
                style={[styles.executeBtn, (!selectedAuctionId || !paymentAmount) && { opacity: 0.5 }]}
                onPress={handleLogPayment}
                disabled={loggingPayment || !selectedAuctionId || !paymentAmount}
              >
                {loggingPayment ? <ActivityIndicator color="#0F172A" /> : <Text style={styles.executeBtnText}>SAVE PAYMENT</Text>}
              </TouchableOpacity>
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FF' },
  appBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 64, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  backBtn: { padding: 8, marginRight: 8 },
  headerTitleBox: { flex: 1 },
  appBarTitle: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 18, color: '#0F172A' },
  appBarSubtitle: { fontFamily: 'Inter_500Medium', fontSize: 12, color: '#64748B' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100 },
  badgeText: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.5 },
  scrollContent: { padding: 20, paddingBottom: 120 },
  engineCard: { backgroundColor: '#0F172A', borderRadius: 24, padding: 24, marginBottom: 24, position: 'relative', overflow: 'hidden' },
  glowBg: { position: 'absolute', top: -100, right: -100, width: 300, height: 300, backgroundColor: 'rgba(0,209,193,0.15)', borderRadius: 150 },
  engineHeader: { marginBottom: 24, zIndex: 1 },
  engineTitle: { fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 18, color: '#FFFFFF' },
  engineSubtitle: { fontFamily: 'Inter_500Medium', fontSize: 12, color: '#94A3B8' },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' },
  engineStatsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24, zIndex: 1 },
  engineStatCol: { flex: 1 },
  engineStatLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 10, color: '#64748B', marginBottom: 4 },
  engineStatVal: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 18, color: '#F8FAFC' },
  engineDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginHorizontal: 16 },
  executeBtn: { backgroundColor: '#00D1C1', paddingHorizontal: 16, paddingVertical: 16, borderRadius: 12, flex: 1, alignItems: 'center' },
  executeBtnText: { fontFamily: 'Inter_700Bold', fontSize: 14, color: '#0F172A', letterSpacing: 0.5 },
  healthCard: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20, marginBottom: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: '#F1F5F9' },
  healthLeft: { flex: 1 },
  healthTitle: { fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 18, color: '#0B1C30' },
  healthSub: { fontFamily: 'Inter_400Regular', fontSize: 12, color: '#64748B', marginBottom: 16 },
  healthLegendRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: '#475569' },
  progressCircle: { width: 100, height: 100, position: 'relative', justifyContent: 'center', alignItems: 'center' },
  circleInner: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  circleText: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 20, color: '#0B1C30' },
  membersSection: { marginBottom: 24 },
  sectionTitle: { fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 16, color: '#164E63', marginBottom: 16, marginLeft: 4 },
  memberCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFFFFF', padding: 16, borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: '#F1F5F9' },
  memberInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  avatarMini: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  avatarMiniText: { fontFamily: 'Inter_700Bold', fontSize: 16, color: '#005E7D' },
  memberName: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#0B1C30' },
  memberId: { fontFamily: 'Inter_500Medium', fontSize: 12, color: '#64748B' },
  partBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  partBadgeText: { fontFamily: 'Inter_600SemiBold', fontSize: 10 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#F1F5F9', backgroundColor: '#FFFFFF' },
  modalTitle: { fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 18, color: '#0B1C30' },
  closeBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center' },
  searchInput: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontFamily: 'Inter_400Regular', fontSize: 16, color: '#0B1C30' },
  customerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#FFFFFF', borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: '#F1F5F9' },
  participationContainer: { flex: 1, padding: 20 },
  selectedCustomerCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, backgroundColor: '#F8FAFC', borderRadius: 12, marginBottom: 24, borderWidth: 1, borderColor: '#E2E8F0' },
  partOptionsRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  partOption: { flex: 1, backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: '#E2E8F0', borderRadius: 16, padding: 16 },
  partOptionActive: { borderColor: '#005E7D', backgroundColor: '#F0F9FF' },
  partRadioContainer: { marginBottom: 12 },
  partRadio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center' },
  partRadioActive: { borderColor: '#005E7D' },
  partRadioInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#005E7D' },
  partTitle: { fontFamily: 'Inter_700Bold', fontSize: 16, color: '#0F172A', marginBottom: 4 },
  partTitleActive: { color: '#005E7D' },
  partDesc: { fontFamily: 'Inter_400Regular', fontSize: 12, color: '#64748B', lineHeight: 18 },
  emiPreviewBox: { backgroundColor: '#0F172A', borderRadius: 16, padding: 20, alignItems: 'center' },
  emiPreviewLabel: { fontFamily: 'Inter_500Medium', fontSize: 12, color: '#94A3B8', marginBottom: 8 },
  emiPreviewVal: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 32, color: '#54FAEF', marginBottom: 4 },
  emiPreviewSub: { fontFamily: 'Inter_400Regular', fontSize: 11, color: '#64748B', fontStyle: 'italic' },

  // Transaction Modal Styles
  txSummaryCard: { backgroundColor: '#0F172A', padding: 24, borderRadius: 20, marginBottom: 24, shadowColor: '#00D1C1', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 10 },
  txSummaryLabel: { fontFamily: 'Inter_500Medium', fontSize: 13, color: '#94A3B8', marginBottom: 8 },
  txSummaryValue: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 36, color: '#FFFFFF' },
  txSummaryDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginVertical: 16 },
  txSummaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  txSummarySubText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: '#94A3B8' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: 'rgba(16, 185, 129, 0.1)' },
  statusText: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.5 },
  txRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', padding: 16, borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: '#F1F5F9' },
  txIconBoxAlt: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F0F9FF', alignItems: 'center', justifyContent: 'center', marginRight: 16 },
  txTitleAlt: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: '#0F172A', marginBottom: 4 },
  txDateAlt: { fontFamily: 'Inter_400Regular', fontSize: 12, color: '#64748B' },
  txAmountAlt: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 16, color: '#10B981', marginBottom: 4 },
  txStatusAlt: { fontFamily: 'Inter_500Medium', fontSize: 11, color: '#64748B' },
  auctionChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 100, backgroundColor: '#F1F5F9', marginRight: 8, borderWidth: 1, borderColor: 'transparent' },
  auctionChipActive: { backgroundColor: '#F0F9FF', borderColor: '#005E7D' },
  auctionChipText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#64748B' },
  auctionChipTextActive: { color: '#005E7D' },
});
