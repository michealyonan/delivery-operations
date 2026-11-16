import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { ActionButton, Body, Heading, Notice, Page, StatusTag } from '../../components/ui';
import { useApp } from '../../state/app-context';
import { colors, spacing } from '../../theme';
import type { DeliveryOrder } from '../../types';

function OrderItem({ order }: { order: DeliveryOrder }) {
  const { profile, couriers, isDemo, assignOrder } = useApp();
  const [busy, setBusy] = useState(false);

  const assign = async (courierId: number) => {
    setBusy(true);
    try {
      await assignOrder(order.id, courierId);
      Alert.alert('تم الإسناد', 'أُسند الطلب للمندوب.');
    } catch (error) {
      Alert.alert('تعذر الإسناد', error instanceof Error ? error.message : 'حاول مرة أخرى.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.order}>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push({ pathname: '/orders/[id]', params: { id: order.id } })}
        style={styles.orderHeader}
      >
        <View style={styles.orderTitle}>
          <Text style={styles.code}>{order.code}</Text>
          <Text style={styles.restaurant}>{order.restaurantName}</Text>
        </View>
        <MaterialCommunityIcons name="chevron-left" color={colors.muted} size={22} />
      </Pressable>
      <View style={styles.orderInfo}>
        <Body>{order.customerAddress}</Body>
        <StatusTag status={order.status} />
      </View>
      <Text style={styles.money}>
        المبلغ المطلوب من العميل: {(order.amountDuePiasters / 100).toLocaleString('ar-EG')} ج.م
      </Text>
      {profile?.role === 'admin' && order.status === 'pending' && (
        <View style={styles.assignArea}>
          <Text style={styles.assignLabel}>إسناد سريع إلى:</Text>
          {couriers.filter((courier) => courier.isOnShift).length === 0 ? (
            <Notice tone="warning">لا يوجد مندوب على الشيفت حاليًا.</Notice>
          ) : (
            couriers
              .filter((courier) => courier.isOnShift)
              .map((courier) => (
                <ActionButton
                  key={courier.id}
                  disabled={busy}
                  loading={busy}
                  onPress={() => assign(courier.id)}
                  tone="outline"
                >
                  {courier.fullName} · {courier.code}
                </ActionButton>
              ))
          )}
          {isDemo && <Text style={styles.demoHint}>الإسناد في المعاينة غير متاح بين أجهزة.</Text>}
        </View>
      )}
    </View>
  );
}

export default function OrdersScreen() {
  const { profile, orders, isDemo } = useApp();
  const visibleOrders = orders.filter((order) => {
    if (profile?.role === 'restaurant') return order.restaurantId === profile.restaurantId;
    if (profile?.role === 'courier') return order.courierId === profile.courierId;
    return true;
  });

  return (
    <Page>
      <Heading>
        {profile?.role === 'courier'
          ? 'طلباتي'
          : profile?.role === 'restaurant'
            ? 'طلبات المطعم'
            : 'كل الطلبات'}
      </Heading>
      {isDemo && <Notice tone="warning">بيانات تجريبية داخل هذا الجهاز فقط.</Notice>}
      {profile?.role === 'restaurant' && (
        <ActionButton onPress={() => router.push('/orders/new')}>إرسال طلب جديد</ActionButton>
      )}
      {visibleOrders.length === 0 ? (
        <Notice>لا توجد طلبات في هذه القائمة.</Notice>
      ) : (
        visibleOrders.map((order) => <OrderItem key={order.id} order={order} />)
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  order: {
    paddingVertical: spacing.md,
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.outline,
  },
  orderHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  orderTitle: { flex: 1, gap: 4 },
  code: { color: colors.primaryDark, fontSize: 16, fontWeight: '800', textAlign: 'right' },
  restaurant: { color: colors.muted, fontSize: 13, textAlign: 'right' },
  orderInfo: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  money: { color: colors.text, fontSize: 14, fontWeight: '600', textAlign: 'right' },
  assignArea: { gap: 8, marginTop: 4 },
  assignLabel: { color: colors.text, fontWeight: '700', textAlign: 'right' },
  demoHint: { color: colors.warning, fontSize: 12, textAlign: 'right' },
});
