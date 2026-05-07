import { useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  FlatList,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Svg, { Path, Circle, Rect, G } from 'react-native-svg';
import { Colors, Spacing, Radii, Shadows } from '../../lib/constants';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Slide Data ──────────────────────────────────────────────
const SLIDES = [
  {
    key: 'slide1',
    step: '1 of 3',
    title: 'Automated Financial\nDiscipline',
    subtitle:
      'Harness the power of community savings to build your wealth systematically with zero market risk.',
    cta: 'Get Started',
  },
  {
    key: 'slide2',
    step: '2 of 3',
    title: 'Maximize Your\nReturns',
    subtitle:
      'Earn monthly dividends that often outperform fixed deposits and traditional savings accounts.',
    cta: 'Continue Journey',
  },
  {
    key: 'slide3',
    step: '3 of 3',
    title: 'Liquidity on Demand',
    subtitle:
      'Need funds fast? Bid in our transparent auctions to access your corpus exactly when you need it most.',
    cta: 'Get Started',
  },
];

// ─── Slide Visualizations ─────────────────────────────────────

function Slide1Visual() {
  return (
    <View style={styles.visualCard}>
      {/* Bar Chart */}
      <View style={styles.barChartContainer}>
        {[
          { h: '16%', color: '#E2E8F0' },
          { h: '33%', color: '#CBD5E1' },
          { h: '50%', color: 'rgba(1,120,158,0.2)' },
          { h: '66%', color: 'rgba(1,120,158,0.4)' },
          { h: '83%', color: Colors.primary },
          { h: '100%', color: '#54FAEF' },
        ].map((bar, i) => (
          <View key={i} style={[styles.bar, { height: bar.h as any, backgroundColor: bar.color }]}>
            {i === 4 && (
              <View style={styles.barTooltip}>
                <Text style={styles.barTooltipLabel}>SAVINGS</Text>
                <Text style={styles.barTooltipValue}>₹12k</Text>
              </View>
            )}
          </View>
        ))}
      </View>

      {/* Auto-Debit Floating Card */}
      <View style={[styles.floatingCard, { top: 16, left: 12 }]}>
        <View style={styles.floatingCardIcon}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill={Colors.secondary}>
            <Path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
          </Svg>
        </View>
        <View>
          <Text style={styles.floatingCardLabel}>AUTO-DEBIT</Text>
          <Text style={styles.floatingCardValue}>Active</Text>
        </View>
      </View>

      {/* Zero Risk Floating Card */}
      <View style={[styles.floatingCard, { bottom: 24, right: 12 }]}>
        <View style={[styles.floatingCardIcon, { backgroundColor: Colors.primary }]}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="#FFFFFF">
            <Path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
          </Svg>
        </View>
        <View>
          <Text style={styles.floatingCardLabel}>ZERO RISK</Text>
          <Text style={styles.floatingCardValue}>Guaranteed</Text>
        </View>
      </View>
    </View>
  );
}

function Slide2Visual() {
  return (
    <View style={styles.visualCard}>
      {/* Comparison Chart */}
      <View style={styles.comparisonChart}>
        {/* Savings Bar */}
        <View style={styles.comparisonColumn}>
          <Text style={styles.comparisonLabel}>SAVINGS</Text>
          <View style={[styles.comparisonBar, { backgroundColor: '#E2E8F0', flex: 1, maxHeight: 96 }]}>
            <View style={StyleSheet.absoluteFillObject}>
              <View style={{ flex: 1, backgroundColor: '#CBD5E1', opacity: 0.5 }} />
            </View>
          </View>
          <Text style={[styles.comparisonPct, { color: '#94A3B8' }]}>4.2%</Text>
        </View>

        {/* Chit Bar */}
        <View style={styles.comparisonColumn}>
          <Text style={[styles.comparisonLabel, { color: Colors.primary }]}>CHIT YIELD</Text>
          <View style={[styles.comparisonBar, {
            flex: 1,
            maxHeight: 224,
            backgroundColor: Colors.primary,
          }]}>
            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(16,215,205,0.3)', borderRadius: 12 }]} />
          </View>
          <Text style={[styles.comparisonPct, { color: Colors.primary }]}>8.5%</Text>
        </View>
      </View>

      {/* Divider */}
      <View style={styles.divider} />

      {/* Insight Card */}
      <View style={styles.insightCard}>
        <View style={styles.insightIcon}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="#FFFFFF">
            <Path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z" />
          </Svg>
        </View>
        <View>
          <Text style={styles.insightTitle}>2x Average Performance</Text>
          <Text style={styles.insightSub}>Historical dividend average vs FD</Text>
        </View>
      </View>

      {/* Benefits Grid */}
      <View style={styles.benefitsGrid}>
        <View style={styles.benefitCard}>
          <Svg width={24} height={24} viewBox="0 0 24 24" fill={Colors.secondary}>
            <Path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z" />
          </Svg>
          <Text style={styles.benefitLabel}>MONTHLY</Text>
          <Text style={styles.benefitTitle}>Regular Payouts</Text>
        </View>
        <View style={styles.benefitCard}>
          <Svg width={24} height={24} viewBox="0 0 24 24" fill={Colors.secondary}>
            <Path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
          </Svg>
          <Text style={styles.benefitLabel}>SECURE</Text>
          <Text style={styles.benefitTitle}>Regulated Growth</Text>
        </View>
      </View>
    </View>
  );
}

function Slide3Visual() {
  return (
    <View style={styles.visualCard}>
      {/* Auction Header */}
      <View style={styles.auctionHeader}>
        <View style={styles.auctionBadge}>
          <View style={styles.auctionPulse} />
          <Text style={styles.auctionBadgeText}>ACTIVE AUCTION</Text>
        </View>
        <Text style={styles.auctionTimer}>04:59:21</Text>
      </View>

      {/* Progress Bar */}
      <View style={styles.auctionProgressContainer}>
        <View style={styles.auctionProgressTrack}>
          <View style={[styles.auctionProgressFill, { width: '75%' }]} />
        </View>
        <View style={styles.auctionProgressLabels}>
          <Text style={styles.auctionProgressLabel}>MIN BID: ₹1,200</Text>
          <Text style={styles.auctionProgressLabel}>GOAL: ₹10,000</Text>
        </View>
      </View>

      {/* Liquidity Nodes Grid */}
      <View style={styles.liquidityGrid}>
        <View style={styles.liquidityCard}>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill={Colors.secondary}>
            <Path d="M7 2v11h3v9l7-12h-4l4-8z" />
          </Svg>
          <Text style={styles.liquidityLabel}>Instant Payout</Text>
          <Text style={styles.liquidityValue}>₹2,450</Text>
        </View>
        <View style={styles.liquidityCard}>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill={Colors.primary}>
            <Path d="M21 18v1c0 1.1-.9 2-2 2H5c-1.11 0-2-.9-2-2V5c0-1.1.89-2 2-2h14c1.1 0 2 .9 2 2v1h-9c-1.11 0-2 .9-2 2v8c0 1.1.89 2 2 2h9zm-9-2h10V8H12v8zm4-2.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" />
          </Svg>
          <Text style={styles.liquidityLabel}>Available Funds</Text>
          <Text style={styles.liquidityValue}>92%</Text>
        </View>
      </View>

      {/* Last Bid Row */}
      <View style={styles.lastBidRow}>
        <View style={styles.lastBidAvatar}>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="#FFFFFF">
            <Path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
          </Svg>
        </View>
        <View>
          <Text style={styles.lastBidTitle}>Last Bid Received</Text>
          <Text style={styles.lastBidSub}>Just now by User #842</Text>
        </View>
      </View>
    </View>
  );
}

const VISUALS = [Slide1Visual, Slide2Visual, Slide3Visual];

// ─── Main Component ───────────────────────────────────────────
export default function OnboardingScreen() {
  const router = useRouter();
  const flatListRef = useRef<FlatList>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const [currentIndex, setCurrentIndex] = useState(0);

  const goNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (currentIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1 });
      setCurrentIndex(currentIndex + 1);
    } else {
      router.replace('/(tabs)');
    }
  };

  const goBack = () => {
    Haptics.selectionAsync();
    if (currentIndex > 0) {
      flatListRef.current?.scrollToIndex({ index: currentIndex - 1 });
      setCurrentIndex(currentIndex - 1);
    }
  };

  const skip = () => {
    Haptics.selectionAsync();
    router.replace('/(tabs)');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Top App Bar */}
      <View style={styles.appBar}>
        {currentIndex > 0 ? (
          <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
            <Svg width={24} height={24} viewBox="0 0 24 24" fill={Colors.primary}>
              <Path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
            </Svg>
          </TouchableOpacity>
        ) : (
          <View style={styles.backBtn} />
        )}

        <Text style={styles.stepText}>{SLIDES[currentIndex].step}</Text>

        <TouchableOpacity onPress={skip} activeOpacity={0.7}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>

      {/* Slides Carousel */}
      <Animated.FlatList
        ref={flatListRef}
        data={SLIDES}
        keyExtractor={(item) => item.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false }
        )}
        renderItem={({ item, index }) => {
          const Visual = VISUALS[index];
          return (
            <View style={styles.slide}>
              {/* Visualization */}
              <Visual />

              {/* Text Content */}
              <View style={styles.textSection}>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.subtitle}>{item.subtitle}</Text>
              </View>
            </View>
          );
        }}
      />

      {/* Bottom Section: Dots + CTA */}
      <View style={styles.bottomSection}>
        {/* Pagination Dots */}
        <View style={styles.dotsRow}>
          {SLIDES.map((_, i) => {
            const isActive = i === currentIndex;
            return (
              <View
                key={i}
                style={[
                  styles.dot,
                  isActive ? styles.dotActive : styles.dotInactive,
                ]}
              />
            );
          })}
        </View>

        {/* CTA Button */}
        <TouchableOpacity
          style={styles.ctaBtn}
          onPress={goNext}
          activeOpacity={0.9}
        >
          <Text style={styles.ctaBtnText}>{SLIDES[currentIndex].cta}</Text>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="#FFFFFF">
            <Path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8-8-8z" />
          </Svg>
        </TouchableOpacity>

        {currentIndex === SLIDES.length - 1 && (
          <TouchableOpacity style={styles.secondaryBtn} onPress={skip} activeOpacity={0.8}>
            <Text style={styles.secondaryBtnText}>Learn More About Auctions</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8F9FF',
  },
  appBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#F8FAFC',
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 13,
    color: '#94A3B8',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  skipText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 14,
    color: Colors.primary,
    letterSpacing: 0.5,
  },
  slide: {
    width: SCREEN_WIDTH,
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
  },

  // ── Visualization Card ──
  visualCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 40,
    padding: 20,
    marginBottom: 24,
    minHeight: 280,
    borderWidth: 1,
    borderColor: 'rgba(190,200,206,0.3)',
    overflow: 'hidden',
    ...Shadows.blueTint,
  },

  // ── Slide 1 ──
  barChartContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    height: 160,
    gap: 8,
    marginBottom: 8,
  },
  bar: {
    width: 36,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  barTooltip: {
    position: 'absolute',
    top: -52,
    left: '50%',
    transform: [{ translateX: -44 }],
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center',
    minWidth: 80,
    borderWidth: 1,
    borderColor: 'rgba(190,200,206,0.4)',
    ...Shadows.subtle,
  },
  barTooltipLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    color: Colors.primary,
    letterSpacing: 0.8,
  },
  barTooltipValue: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 18,
    color: Colors.primary,
  },
  floatingCard: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    ...Shadows.subtle,
  },
  floatingCardIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#54FAEF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingCardLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    color: '#64748B',
    letterSpacing: 0.8,
  },
  floatingCardValue: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 13,
    color: '#0B1C30',
  },

  // ── Slide 2 ──
  comparisonChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    height: 240,
    gap: 24,
    paddingHorizontal: 16,
  },
  comparisonColumn: {
    flex: 1,
    alignItems: 'center',
    gap: 10,
    height: '100%',
    justifyContent: 'flex-end',
  },
  comparisonBar: {
    width: '100%',
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    overflow: 'hidden',
  },
  comparisonLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    color: '#94A3B8',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  comparisonPct: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 22,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(190,200,206,0.5)',
    marginVertical: 12,
  },
  insightCard: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  insightIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  insightTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: '#FFFFFF',
  },
  insightSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 2,
  },
  benefitsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  benefitCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(190,200,206,0.2)',
    gap: 4,
    ...Shadows.subtle,
  },
  benefitLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    color: Colors.primary,
    letterSpacing: 0.8,
  },
  benefitTitle: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: '#0B1C30',
  },

  // ── Slide 3 ──
  auctionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  auctionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EBF8FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 100,
    gap: 6,
  },
  auctionPulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10D7CD',
  },
  auctionBadgeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    color: Colors.primary,
    letterSpacing: 0.5,
  },
  auctionTimer: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 16,
    color: '#94A3B8',
  },
  auctionProgressContainer: {
    marginBottom: 16,
  },
  auctionProgressTrack: {
    height: 8,
    backgroundColor: '#E5EEFF',
    borderRadius: 100,
    overflow: 'hidden',
  },
  auctionProgressFill: {
    height: '100%',
    backgroundColor: '#10D7CD',
    borderRadius: 100,
  },
  auctionProgressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  auctionProgressLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    color: '#64748B',
    letterSpacing: 0.3,
  },
  liquidityGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  liquidityCard: {
    flex: 1,
    backgroundColor: '#EFF4FF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(190,200,206,0.2)',
    gap: 4,
  },
  liquidityLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  liquidityValue: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 18,
    color: '#0B1C30',
  },
  lastBidRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(190,200,206,0.4)',
  },
  lastBidAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lastBidTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: '#0B1C30',
  },
  lastBidSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },

  // ── Text Content ──
  textSection: {
    alignItems: 'center',
    paddingHorizontal: 8,
    gap: 12,
  },
  title: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 30,
    lineHeight: 38,
    color: '#0B1C30',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    lineHeight: 24,
    color: '#3F484E',
    textAlign: 'center',
    maxWidth: 300,
  },

  // ── Bottom Section ──
  bottomSection: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 16,
    alignItems: 'center',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  dot: {
    height: 6,
    borderRadius: 100,
  },
  dotActive: {
    width: 32,
    backgroundColor: Colors.primary,
  },
  dotInactive: {
    width: 8,
    backgroundColor: '#CBD5E1',
  },
  ctaBtn: {
    width: '100%',
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: 100,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    ...Shadows.premium,
  },
  ctaBtnText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 17,
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  secondaryBtn: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: '#BEC8CE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    color: Colors.primary,
  },
});
