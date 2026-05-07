import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Dimensions, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { Colors, Shadows } from '../../../lib/constants';

const { width } = Dimensions.get('window');

export default function ForeclosureScreen() {
  const router = useRouter();
  const [reason, setReason] = useState('');

  const handleSubmit = () => {
    if (!reason.trim()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Required', 'Please provide a reason for early exit.');
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      'Submit Foreclosure Request?',
      'You are about to request an early exit. This will be reviewed by the admin and may incur processing fees.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Submit', 
          style: 'destructive',
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Alert.alert('Request Submitted', 'Our team will review your request and get back to you shortly.', [
              { text: 'OK', onPress: () => router.back() }
            ]);
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {/* App Bar */}
      <View style={s.appBar}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Svg width={24} height={24} viewBox="0 0 24 24" fill={Colors.primary}>
            <Path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
          </Svg>
        </TouchableOpacity>
        <Text style={s.appBarTitle}>Exit & Foreclosure</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Warning Banner */}
        <View style={s.warningBanner}>
          <View style={s.warningIcon}>
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="#B91C1C">
              <Path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
            </Svg>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.warningTitle}>High Impact Action</Text>
            <Text style={s.warningSub}>Premature closure of chits may result in the forfeiture of dividends and a deduction of a 2% processing fee.</Text>
          </View>
        </View>

        {/* Current Status */}
        <View style={s.card}>
          <Text style={s.cardLabel}>CURRENT ELIGIBILITY</Text>
          <Text style={s.cardTitle}>Eligible with Penalty</Text>
          <Text style={s.cardSub}>You have completed 12 out of 20 months in your active chit groups.</Text>
          
          <View style={s.feeBox}>
            <Text style={s.feeLabel}>Estimated Processing Fee</Text>
            <Text style={s.feeVal}>~₹4,500.00</Text>
          </View>
        </View>

        {/* Request Form */}
        <View style={s.form}>
          <Text style={s.formLabel}>Reason for early exit</Text>
          <TextInput
            style={s.input}
            placeholder="Please explain why you need to exit the chit early..."
            placeholderTextColor="#94A3B8"
            multiline
            numberOfLines={4}
            value={reason}
            onChangeText={setReason}
            textAlignVertical="top"
          />
          <Text style={s.formHint}>Providing a valid reason helps expedite the review process.</Text>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Fixed Footer */}
      <View style={s.footer}>
        <TouchableOpacity style={s.submitBtn} activeOpacity={0.9} onPress={handleSubmit}>
          <Text style={s.submitTxt}>SUBMIT REQUEST</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  appBar: { height: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, backgroundColor: 'rgba(255,255,255,0.92)', borderBottomWidth: 1, borderBottomColor: 'rgba(226,232,240,0.5)' },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  appBarTitle: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 20, color: Colors.primary },
  
  scroll: { padding: 20, gap: 24 },
  
  warningBanner: { flexDirection: 'row', backgroundColor: '#FEF2F2', padding: 16, borderRadius: 16, gap: 12, borderWidth: 1, borderColor: '#FECACA' },
  warningIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center' },
  warningTitle: { fontFamily: 'Inter_700Bold', fontSize: 15, color: '#B91C1C', marginBottom: 4 },
  warningSub: { fontFamily: 'Inter_400Regular', fontSize: 13, color: '#7F1D1D', lineHeight: 20 },

  card: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: '#F1F5F9', ...Shadows.subtle },
  cardLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 11, color: '#64748B', letterSpacing: 1, marginBottom: 8 },
  cardTitle: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 24, color: Colors.primary, marginBottom: 4 },
  cardSub: { fontFamily: 'Inter_400Regular', fontSize: 14, color: '#64748B', lineHeight: 22, marginBottom: 20 },
  feeBox: { backgroundColor: '#F8FAFC', padding: 16, borderRadius: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  feeLabel: { fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.primary },
  feeVal: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 16, color: '#EF4444' },

  form: { gap: 8 },
  formLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.primary, marginLeft: 4 },
  input: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 16, padding: 16, minHeight: 120, fontFamily: 'Inter_400Regular', fontSize: 15, color: Colors.primary, ...Shadows.subtle },
  formHint: { fontFamily: 'Inter_400Regular', fontSize: 12, color: '#94A3B8', marginLeft: 4 },

  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 24, backgroundColor: 'rgba(248,250,252,0.95)', borderTopWidth: 1, borderTopColor: 'rgba(226,232,240,0.5)' },
  submitBtn: { backgroundColor: '#EF4444', paddingVertical: 18, borderRadius: 16, alignItems: 'center', shadowColor: '#EF4444', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
  submitTxt: { fontFamily: 'Inter_700Bold', fontSize: 14, color: '#FFFFFF', letterSpacing: 1 },
});
