import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionButton, Notice } from '../../components/ui';
import { useApp } from '../../state/app-context';
import { colors } from '../../theme';

export default function TabLayout() {
  const {
    profile,
    couriers,
    orderAssignmentAttempts,
    orderReturns,
    orderTransferRequests,
    refresh,
    refreshError,
  } = useApp();
  const insets = useSafeAreaInsets();
  const [now, setNow] = useState<number | null>(null);
  const [refreshBusy, setRefreshBusy] = useState(false);
  useEffect(() => {
    const firstUpdate = setTimeout(() => setNow(Date.now()), 0);
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      clearTimeout(firstUpdate);
      clearInterval(timer);
    };
  }, []);
  if (!profile) return <Redirect href="/login" />;

  const admin = profile.role === 'admin';
  const supportOnly = profile.role === 'support';
  const pendingShiftCloseCount = couriers.filter((courier) => courier.shiftCloseRequestedAt).length;
  const activeBreakCount = couriers.filter(
    (courier) => now !== null && courier.breakUntil && new Date(courier.breakUntil).getTime() > now,
  ).length;
  const openReturnCount = orderReturns.filter((orderReturn) => orderReturn.status !== 'closed').length;
  const unacceptedCount = orderAssignmentAttempts.filter(
    (attempt) =>
      (attempt.status === 'awaiting' || attempt.status === 'not_accepted') &&
      (admin || attempt.courierId === profile.courierId),
  ).length;
  const pendingTransferCount = orderTransferRequests.filter(
    (request) => request.status === 'pending',
  ).length;

  const retryRefresh = async () => {
    setRefreshBusy(true);
    try {
      await refresh();
    } catch (error) {
      console.error('تعذر إعادة تحميل بيانات التطبيق:', error);
    } finally {
      setRefreshBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      {refreshError ? (
        <View style={styles.refreshBanner}>
          <Notice tone="danger">{refreshError}</Notice>
          <ActionButton
            disabled={refreshBusy}
            loading={refreshBusy}
            onPress={() => void retryRefresh()}
            tone="outline"
          >
            إعادة تحميل البيانات
          </ActionButton>
        </View>
      ) : null}
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.muted,
          tabBarStyle: {
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: colors.surface,
            borderTopColor: colors.outline,
            borderTopWidth: StyleSheet.hairlineWidth,
            height: 70 + insets.bottom,
            paddingBottom: Math.max(insets.bottom, 8),
            paddingTop: 6,
            elevation: 8,
            zIndex: 10,
          },
          tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
        }}
      >
      <Tabs.Screen
        name="index"
        options={{
          title: 'الرئيسية',
          href: supportOnly ? null : undefined,
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="view-dashboard-outline" color={String(color)} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: 'الطلبات',
          href: supportOnly ? null : undefined,
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="clipboard-list-outline" color={String(color)} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="unaccepted-orders"
        options={{
          title: 'عدم القبول',
          href: admin || profile.role === 'courier' ? undefined : null,
          tabBarBadge: unacceptedCount > 0 ? unacceptedCount : undefined,
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="clipboard-alert-outline" color={String(color)} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="transfers"
        options={{
          title: 'التحويلات',
          href: admin || supportOnly ? undefined : null,
          tabBarBadge: (admin || supportOnly) && pendingTransferCount > 0
            ? pendingTransferCount
            : undefined,
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="swap-horizontal" color={String(color)} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="payments"
        options={{
          title: 'الدفعات',
          href: supportOnly ? null : undefined,
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="cash-multiple" color={String(color)} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="shift-requests"
        options={{
          title: 'طلبات الشيفت',
          href: admin ? undefined : null,
          tabBarBadge: admin && pendingShiftCloseCount > 0 ? pendingShiftCloseCount : undefined,
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="account-clock-outline" color={String(color)} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="break-returns"
        options={{
          title: 'فك البريكات',
          href: admin ? undefined : null,
          tabBarBadge: admin && activeBreakCount > 0 ? activeBreakCount : undefined,
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="account-arrow-left-outline" color={String(color)} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="return-operations"
        options={{
          title: 'المرتجعات',
          href: admin ? undefined : null,
          tabBarBadge: admin && openReturnCount > 0 ? openReturnCount : undefined,
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="keyboard-return" color={String(color)} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="restaurant-new-order"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="restaurant-menu"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="support"
        options={{
          title: 'الدعم',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="message-text-outline" color={String(color)} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="couriers"
        options={{
          title: 'المندوبون',
          href: admin ? undefined : null,
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="motorbike" color={String(color)} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="restaurants"
        options={{
          title: 'المطاعم',
          href: admin ? undefined : null,
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="storefront-outline" color={String(color)} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: 'التقارير',
          href: admin ? undefined : null,
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="chart-box-outline" color={String(color)} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'حسابي',
          href: admin ? null : undefined,
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="account-circle-outline" color={String(color)} size={size} />
          ),
        }}
      />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  refreshBanner: {
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 8,
    backgroundColor: colors.background,
  },
});
