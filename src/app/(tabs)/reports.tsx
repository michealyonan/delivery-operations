import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Body, Field, Heading, Notice, Page, Section } from '../../components/ui';
import { useApp } from '../../state/app-context';
import { colors, spacing } from '../../theme';
import type { DeliveryOrder } from '../../types';

function inRange(order: DeliveryOrder, mode: 'day' | 'month', filter: string) {
  const timestamp = order.deliveredAt ?? order.createdAt;
  const date = new Date(timestamp);
  if (mode === 'day') {
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return value === filter;
  }
  const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  return value === filter;
}

export default function ReportsScreen() {
  const { orders, couriers } = useApp();
  const now = new Date();
  const [mode, setMode] = useState<'day' | 'month'>('day');
  const [filter, setFilter] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
  );

  const selectedOrders = useMemo(
    () => orders.filter((order) => inRange(order, mode, filter)),
    [filter, mode, orders],
  );
  const delivered = selectedOrders.filter((order) => order.status === 'delivered');
  const cancelled = selectedOrders.filter((order) => order.status === 'cancelled');

  const rows = couriers.map((courier) => {
    const courierOrders = delivered.filter((order) => order.courierId === courier.id);
    return {
      courier,
      count: courierOrders.length,
      collected: courierOrders.reduce((total, order) => total + (order.collectedPiasters ?? 0), 0),
      paid: courierOrders.reduce((total, order) => total + (order.paidToRestaurantPiasters ?? 0), 0),
    };
  });

  return (
    <Page>
      <Heading>تقارير المندوبين</Heading>
      <View style={styles.modeRow}>
        <Text
          accessibilityRole="button"
          onPress={() => {
            setMode('day');
            setFilter(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`);
          }}
          style={[styles.mode, mode === 'day' && styles.activeMode]}
        >
          يوم محدد
        </Text>
        <Text
          accessibilityRole="button"
          onPress={() => {
            setMode('month');
            setFilter(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
          }}
          style={[styles.mode, mode === 'month' && styles.activeMode]}
        >
          شهر كامل
        </Text>
      </View>
      <Field
        autoCapitalize="none"
        label={mode === 'day' ? 'التاريخ (YYYY-MM-DD)' : 'الشهر (YYYY-MM)'}
        onChangeText={setFilter}
        value={filter}
      />
      <Notice>يُحسب عدد الطلبات الموصّلة فقط؛ الطلبات الملغاة تظهر منفصلة.</Notice>
      <View style={styles.metrics}>
        <Metric value={String(delivered.length)} label="طلبات منجزة" />
        <Metric value={String(cancelled.length)} label="طلبات ملغاة" />
      </View>
      {rows.map(({ courier, count, collected, paid }) => (
        <Section key={courier.id} title={`${courier.fullName} · ${courier.code}`}>
          <View style={styles.row}>
            <Body>طلبات منجزة: {count}</Body>
            <Body>مقبوض من العملاء: {money(collected)}</Body>
            <Body>مدفوع للمطاعم: {money(paid)}</Body>
          </View>
        </Section>
      ))}
      {rows.length === 0 && <Notice>لا توجد بيانات مندوبين لهذا الحساب.</Notice>}
    </Page>
  );
}

function money(piasters: number) {
  return `${(piasters / 100).toLocaleString('ar-EG', { maximumFractionDigits: 2 })} ج.م`;
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  modeRow: { flexDirection: 'row-reverse', gap: 8 },
  mode: {
    flex: 1,
    minHeight: 48,
    textAlign: 'center',
    textAlignVertical: 'center',
    borderRadius: 14,
    backgroundColor: colors.surface,
    color: colors.muted,
    overflow: 'hidden',
    fontSize: 15,
    fontWeight: '700',
  },
  activeMode: { backgroundColor: colors.primary, color: colors.white },
  metrics: {
    flexDirection: 'row-reverse',
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 16,
    gap: spacing.sm,
  },
  metric: { flex: 1, alignItems: 'center', gap: 4 },
  value: { fontSize: 23, fontWeight: '800', color: colors.primaryDark },
  label: { fontSize: 12, color: colors.muted, textAlign: 'center', writingDirection: 'rtl' },
  row: { gap: 7, padding: spacing.md, backgroundColor: colors.surface, borderRadius: 14 },
});
