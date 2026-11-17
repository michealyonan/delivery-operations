import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useApp } from '../../state/app-context';
import { colors } from '../../theme';

export default function TabLayout() {
  const { profile, couriers } = useApp();
  const insets = useSafeAreaInsets();
  if (!profile) return <Redirect href="/login" />;

  const admin = profile.role === 'admin';
  const supportOnly = profile.role === 'support';
  const pendingShiftCloseCount = couriers.filter((courier) => courier.shiftCloseRequestedAt).length;

  return (
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
        name="couriers/[id]"
        options={{ href: null }}
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
  );
}
