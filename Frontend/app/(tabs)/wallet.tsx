import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Platform, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Svg, { Path } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../lib/supabase';
import { Colors, Shadows } from '../../lib/constants';
import { formatPaise } from '../../lib/hooks/useDashboard';

type TransactionRow = {
  id: string;
  amount: number;
  type: 'credit' | 'debit';
  description: string;
  category: string;
  status: string;
  created_at: string;
};

// Group transactions by date
function groupTransactions(transactions: TransactionRow[]) {
  const groups: { [key: string]: TransactionRow[] } = {};

  transactions.forEach(t => {
    const date = new Date(t.created_at);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let dateStr = '';
    if (date.toDateString() === today.toDateString()) {
      dateStr = 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      dateStr = 'Yesterday';
    } else {
      dateStr = date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    if (!groups[dateStr]) groups[dateStr] = [];
    groups[dateStr].push(t);
  });

  return groups;
}

import { useMemberSession } from '../../lib/MemberSessionContext';

function useTransactions() {
  const { memberId } = useMemberSession();

  return useQuery<TransactionRow[]>({
    queryKey: ['transactions', memberId],
    queryFn: async () => {
      if (!memberId) return [];

      // 1. Get all chit memberships for this customer
      const { data: memberships } = await supabase
        .from('chit_members')
        .select('id, chit_group_id, chit_groups(name)')
        .eq('customer_id', memberId);

      if (!memberships || memberships.length === 0) return [];
      const memberIds = memberships.map(m => m.id);

      // 2. Fetch transactions for all their memberships
      const { data, error } = await supabase
        .from('chit_member_transactions')
        .select('*')
        .in('chit_member_id', memberIds)
        .order('transaction_date', { ascending: false });

      if (error) throw error;

      // 3. Map to TransactionRow format for UI compatibility
      return (data || []).map((t: any) => {
        const group: any = memberships.find((m: any) => m.id === t.chit_member_id)?.chit_groups;
        const groupName = Array.isArray(group) ? group[0]?.name : group?.name;
        
        return {
          id: t.id,
          amount: t.amount,
          type: t.payment_type === 'dividend' ? 'credit' : 'debit',
          description: `${t.payment_type === 'dividend' ? 'Dividend Earned' : 'Installment Paid'} - ${groupName || 'Chit Group'}`,
          category: 'chit',
          status: t.status,
          created_at: t.transaction_date,
        };
      }) as TransactionRow[];
    },
    enabled: !!memberId,
  });
}

const CAT_ICONS: Record<string, string> = {
  scanned: 'qr_code_scanner',
  chit: 'account_balance',
  auto: 'payments',
  bank: 'account_balance_wallet',
};

function TransactionCard({ t }: { t: TransactionRow }) {
  const isCredit = t.type === 'credit';
  const icon = CAT_ICONS[t.category] || 'receipt';
  const time = new Date(t.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  return (
    <TouchableOpacity style={s.card} activeOpacity={0.8} onPress={() => Haptics.selectionAsync()}>
      <View style={s.cardLeft}>
        <View style={[s.iconBox, { backgroundColor: isCredit ? `${Colors.primary}15` : `${Colors.secondary}15` }]}>
          <Svg width={24} height={24} viewBox="0 0 24 24" fill={isCredit ? Colors.primary : Colors.secondary}>
            {/* Fallback simple icon if mapping isn't implemented */}
            <Path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
          </Svg>
        </View>
        <View style={s.cardDetails}>
          <Text style={s.cardTitle} numberOfLines={1}>{t.description}</Text>
          <Text style={s.cardSub}>{time} • {t.category}</Text>
        </View>
      </View>
      <View style={s.cardRight}>
        <Text style={[s.cardAmt, { color: isCredit ? Colors.primary : '#0B1C30' }]}>
          {isCredit ? '+' : '-'} {formatPaise(t.amount)}
        </Text>
        <View style={[s.statusBadge, { backgroundColor: isCredit ? `${Colors.primary}10` : `${Colors.secondary}10` }]}>
          <Text style={[s.statusTxt, { color: isCredit ? Colors.primary : Colors.secondary }]}>{t.status}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function WalletScreen() {
  const { data: transactions, isLoading } = useTransactions();
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchActive, setIsSearchActive] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    };

    const channel = supabase
      .channel('member-wallet-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallet_transactions' }, invalidate)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const filteredTransactions = transactions?.filter(t =>
    t.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const grouped = filteredTransactions ? groupTransactions(filteredTransactions) : {};

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {/* App Bar */}
      <View style={s.appBar}>
        {isSearchActive ? (
          <TextInput
            style={s.searchInput}
            placeholder="Search transactions..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
          />
        ) : (
          <Text style={s.appBarTitle}>History</Text>
        )}
        <View style={s.appBarActions}>
          <TouchableOpacity
            style={[s.iconBtn, isSearchActive && { backgroundColor: Colors.primary }]}
            onPress={() => {
              Haptics.selectionAsync();
              setIsSearchActive(!isSearchActive);
              if (isSearchActive) setSearchQuery('');
            }}
          >
            <Svg width={20} height={20} viewBox="0 0 24 24" fill={isSearchActive ? '#FFF' : Colors.primary}>
              <Path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
            </Svg>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <Text style={s.headerSub}>Manage and track your fund activity</Text>
        </View>

        {isLoading ? (
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            <ActivityIndicator color={Colors.primary} size="large" />
          </View>
        ) : (
          Object.entries(grouped).map(([dateStr, items]) => (
            <View key={dateStr} style={s.group}>
              <Text style={s.dateHeader}>{dateStr}</Text>
              <View style={s.groupItems}>
                {items.map(t => <TransactionCard key={t.id} t={t} />)}
              </View>
            </View>
          ))
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  appBar: { height: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, backgroundColor: 'rgba(255,255,255,0.92)', borderBottomWidth: 1, borderBottomColor: 'rgba(226,232,240,0.5)', ...Shadows.subtle },
  appBarTitle: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 20, color: Colors.primary },
  appBarActions: { flexDirection: 'row', gap: 8 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },

  scroll: { paddingHorizontal: 20, paddingTop: 16, gap: 24 },
  header: { gap: 4, marginBottom: -8 },
  headerSub: { fontFamily: 'Inter_400Regular', fontSize: 14, color: '#64748B' },

  group: { gap: 12 },
  dateHeader: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: Colors.primary, letterSpacing: 1.5, textTransform: 'uppercase' },
  groupItems: { gap: 12 },

  card: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#F1F5F9', ...Shadows.subtle },
  cardLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  iconBox: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardDetails: { flex: 1 },
  cardTitle: { fontFamily: 'Inter_700Bold', fontSize: 15, color: '#0B1C30' },
  cardSub: { fontFamily: 'Inter_400Regular', fontSize: 12, color: '#64748B', marginTop: 2 },

  cardRight: { alignItems: 'flex-end', gap: 4 },
  cardAmt: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 16 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 100 },
  statusTxt: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 0.5, textTransform: 'uppercase' },
  searchInput: { flex: 1, height: 40, backgroundColor: '#F1F5F9', borderRadius: 20, paddingHorizontal: 16, fontFamily: 'Inter_400Regular', fontSize: 15, color: '#0B1C30', marginRight: 12 },
});
