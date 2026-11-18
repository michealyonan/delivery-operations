import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Redirect, router, Tabs, type Href } from 'expo-router';
import { useEffect, useState, type ComponentProps } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionButton, Notice } from '../../components/ui';
import { useApp } from '../../state/app-context';
import { colors } from '../../theme';

type MenuItem = {
  name: string;
  href: Href;
  title: string;
  icon: ComponentProps<typeof MaterialCommunityIcons>['name'];
  visible: boolean;
  badge?: number;
};

export default function TabLayout() {
  const {
    profile,
    couriers,
    orderAssignmentAttempts,
    orderReturns,
    orderTransferRequests,
    courierNotifications,
    shiftSlots,
    shiftBookings,
    shiftRecords,
    refresh,
    refreshError,
  } = useApp();
  const insets = useSafeAreaInsets();
  const [now, setNow] = useState<number | null>(null);
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
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
  const unreadNotificationCount = courierNotifications.filter(
    (notification) => !notification.readAt,
  ).length;
  const lateShiftCount = shiftBookings.filter((booking) => {
    if (booking.status !== 'booked' && booking.status !== 'swap_listed') return false;
    const slot = shiftSlots.find((item) => item.id === booking.slotId);
    return Boolean(
      slot &&
        new Date(slot.startsAt).getTime() <= (now ?? 0) &&
        !shiftRecords.some(
          (record) => record.bookingId === booking.id && record.startedAt,
        ),
    );
  }).length;

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

  const menuItems = ([
    { name: 'index', href: '/(tabs)', title: 'الرئيسية', icon: 'view-dashboard-outline', visible: !supportOnly },
    { name: 'orders', href: '/(tabs)/orders', title: 'الطلبات', icon: 'clipboard-list-outline', visible: !supportOnly },
    {
      name: 'unaccepted-orders',
      href: '/(tabs)/unaccepted-orders',
      title: 'عدم القبول',
      icon: 'clipboard-alert-outline',
      visible: admin || profile.role === 'courier',
      badge: unacceptedCount,
    },
    {
      name: 'transfers',
      href: '/(tabs)/transfers',
      title: 'التحويلات',
      icon: 'swap-horizontal',
      visible: admin || supportOnly,
      badge: admin || supportOnly ? pendingTransferCount : 0,
    },
    { name: 'payments', href: '/(tabs)/payments', title: 'الدفعات', icon: 'cash-multiple', visible: !supportOnly },
    {
      name: 'shift-requests',
      href: '/(tabs)/shift-requests',
      title: 'طلبات الشيفت',
      icon: 'account-clock-outline',
      visible: admin,
      badge: pendingShiftCloseCount,
    },
    { name: 'admin-shifts', href: '/(tabs)/admin-shifts', title: 'الشفتات', icon: 'calendar-clock-outline', visible: admin },
    {
      name: 'shift-delays',
      href: '/(tabs)/shift-delays',
      title: 'التأخيرات',
      icon: 'account-alert-outline',
      visible: admin,
      badge: lateShiftCount,
    },
    { name: 'my-shifts', href: '/(tabs)/my-shifts', title: 'شيفتاتي', icon: 'calendar-check-outline', visible: profile.role === 'courier' },
    {
      name: 'notifications',
      href: '/(tabs)/notifications',
      title: 'إشعارات',
      icon: 'bell-outline',
      visible: admin || profile.role === 'courier',
      badge: profile.role === 'courier' ? unreadNotificationCount : 0,
    },
    {
      name: 'break-returns',
      href: '/(tabs)/break-returns',
      title: 'فك البريكات',
      icon: 'account-arrow-left-outline',
      visible: admin,
      badge: activeBreakCount,
    },
    {
      name: 'return-operations',
      href: '/(tabs)/return-operations',
      title: 'المرتجعات',
      icon: 'keyboard-return',
      visible: admin,
      badge: openReturnCount,
    },
    { name: 'support', href: '/(tabs)/support', title: 'الدعم', icon: 'message-text-outline', visible: true },
    { name: 'couriers', href: '/(tabs)/couriers', title: 'المندوبون', icon: 'motorbike', visible: admin },
    { name: 'restaurants', href: '/(tabs)/restaurants', title: 'المطاعم', icon: 'storefront-outline', visible: admin },
    { name: 'reports', href: '/(tabs)/reports', title: 'التقارير', icon: 'chart-box-outline', visible: admin },
    { name: 'profile', href: '/(tabs)/profile', title: 'حسابي', icon: 'account-circle-outline', visible: !admin },
  ] satisfies MenuItem[]).filter((item) => item.visible);

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
      <View style={[styles.tabsHost, { paddingBottom: 76 + insets.bottom }]}>
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarStyle: { display: 'none' },
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
        name="admin-shifts"
        options={{
          title: 'الشفتات',
          href: admin ? undefined : null,
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="calendar-clock-outline" color={String(color)} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="shift-delays"
        options={{
          title: 'التأخيرات',
          href: admin ? undefined : null,
          tabBarBadge: admin && lateShiftCount > 0 ? lateShiftCount : undefined,
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="account-alert-outline" color={String(color)} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="my-shifts"
        options={{
          title: 'شيفتاتي',
          href: profile.role === 'courier' ? undefined : null,
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="calendar-check-outline" color={String(color)} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'إشعارات',
          href: admin || profile.role === 'courier' ? undefined : null,
          tabBarBadge:
            profile.role === 'courier' && unreadNotificationCount > 0
              ? unreadNotificationCount
              : undefined,
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="bell-outline" color={String(color)} size={size} />
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
        name="order-details/[id]"
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
      {menuOpen ? (
        <View style={styles.menuOverlay}>
          <Pressable
            accessibilityLabel="إغلاق قائمة التنقل"
            onPress={() => setMenuOpen(false)}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.menuPanel, { bottom: Math.max(insets.bottom, 8) + 72 }]}>
            <ScrollView contentContainerStyle={styles.menuList}>
              {menuItems.map((item) => (
                <Pressable
                  accessibilityRole="button"
                  key={item.name}
                  onPress={() => {
                    setMenuOpen(false);
                    router.navigate(item.href);
                  }}
                  style={styles.menuItem}
                >
                  <MaterialCommunityIcons
                    color={colors.primary}
                    name={item.icon}
                    size={22}
                  />
                  <Text style={styles.menuItemText}>{item.title}</Text>
                  {item.badge && item.badge > 0 ? (
                    <Text style={styles.menuBadge}>{item.badge}</Text>
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: menuOpen }}
        onPress={() => setMenuOpen((open) => !open)}
        style={[styles.menuToggle, { bottom: Math.max(insets.bottom, 8) + 10 }]}
      >
        <MaterialCommunityIcons
          color={colors.white}
          name={menuOpen ? 'close' : 'menu'}
          size={22}
        />
        <Text style={styles.menuToggleText}>{menuOpen ? 'إغلاق القائمة' : 'القائمة'}</Text>
        <MaterialCommunityIcons
          color={colors.white}
          name={menuOpen ? 'chevron-down' : 'chevron-up'}
          size={20}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  tabsHost: { flex: 1 },
  refreshBanner: {
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 8,
    backgroundColor: colors.background,
  },
  menuOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 20,
  },
  menuPanel: {
    position: 'absolute',
    left: 12,
    right: 12,
    maxHeight: 420,
    overflow: 'hidden',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outline,
    backgroundColor: colors.surface,
    elevation: 12,
  },
  menuList: {
    paddingVertical: 6,
  },
  menuItem: {
    minHeight: 50,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.outline,
  },
  menuItemText: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'right',
  },
  menuBadge: {
    minWidth: 22,
    overflow: 'hidden',
    borderRadius: 11,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: colors.danger,
    color: colors.white,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  menuToggle: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 21,
    minHeight: 52,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 16,
    paddingHorizontal: 16,
    backgroundColor: colors.primary,
    elevation: 10,
  },
  menuToggleText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '800',
  },
});
