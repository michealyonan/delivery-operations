import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';

import { useApp } from '../../state/app-context';
import { colors } from '../../theme';

export default function TabLayout() {
  const { profile } = useApp();
  if (!profile) return <Redirect href="/login" />;

  const admin = profile.role === 'admin';
  const supportOnly = profile.role === 'support';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.outline,
          height: 70,
          paddingBottom: 8,
          paddingTop: 6,
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
