import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import DatePicker from '../../components/date-picker';
import { ActionButton, Body, Heading, Notice, Page, Section } from '../../components/ui';
import { useApp } from '../../state/app-context';
import { colors, spacing } from '../../theme';
import type { DeliveryOrder } from '../../types';

function dayStart(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
}

function dayEndExclusive(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate() + 1).getTime();
}

function isWithinRange(timestamp: string | undefined, start: number, end: number) {
  if (!timestamp) return false;
  const value = new Date(timestamp).getTime();
  return Number.isFinite(value) && value >= start && value < end;
}

function formatDate(value: string | undefined) {
  return value
    ? new Date(value).toLocaleString('ar-EG', {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : 'غير متاح';
}

function OrderRow({ order, cancelled }: { order: DeliveryOrder; cancelled?: boolean }) {
  return (
    <View style={styles.orderRow}>
      <Text style={styles.orderCode}>{order.code}</Text>
      <Body>{order.restaurantName}</Body>
      <Body>تاريخ الطلب: {formatDate(order.createdAt)}</Body>
      {cancelled ? (
        <>
          <Body>تاريخ الإلغاء: {formatDate(order.cancelledAt)}</Body>
          <Body>هذا الطلب ملغى ولا يدخل في إجمالي الدفعات.</Body>
        </>
      ) : (
        <>
          <Body>تاريخ التوصيل: {formatDate(order.deliveredAt)}</Body>
          <Body>رسوم التوصيل للمندوب: {money(order.deliveryFeePiasters ?? 0)}</Body>
        </>
      )}
    </View>
  );
}

export default function PaymentsScreen() {
  const { profile, couriers, orders } = useApp();
  const today = new Date();
  const [startDate, setStartDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [endDate, setEndDate] = useState(today);
  const [selectedCourierId, setSelectedCourierId] = useState<number | null>(null);
  const activeCourierId =
    selectedCourierId ??
    (profile?.role === 'admin' ? couriers[0]?.id ?? null : profile?.courierId ?? null);

  const rangeStart = dayStart(startDate);
  const rangeEnd = dayEndExclusive(endDate);
  const rangeValid = rangeStart < rangeEnd;
  const selectedCourier = couriers.find((courier) => courier.id === activeCourierId);
  const deliveredOrders = useMemo(
    () =>
      orders
        .filter(
          (order) =>
            order.status === 'delivered' &&
            order.courierId === activeCourierId &&
            isWithinRange(order.deliveredAt ?? order.createdAt, rangeStart, rangeEnd),
        )
        .sort((a, b) => new Date(b.deliveredAt ?? b.createdAt).getTime() - new Date(a.deliveredAt ?? a.createdAt).getTime()),
    [activeCourierId, orders, rangeEnd, rangeStart],
  );
  const cancelledOrders = useMemo(
    () =>
      orders
        .filter(
          (order) =>
            order.status === 'cancelled' &&
            (profile?.role === 'admin' || order.courierId === profile?.courierId) &&
            isWithinRange(order.cancelledAt ?? order.createdAt, rangeStart, rangeEnd),
        )
        .sort((a, b) => new Date(b.cancelledAt ?? b.createdAt).getTime() - new Date(a.cancelledAt ?? a.createdAt).getTime()),
    [orders, profile?.courierId, profile?.role, rangeEnd, rangeStart],
  );
  const payoutPiasters = deliveredOrders.reduce(
    (total, order) => total + (order.deliveryFeePiasters ?? 0),
    0,
  );

  if (profile?.role !== 'admin' && profile?.role !== 'courier') {
    return (
      <Page>
        <Heading>الدفعات</Heading>
        <Notice tone="danger">الدفعات متاحة للإدارة والمندوب فقط.</Notice>
      </Page>
    );
  }

  return (
    <Page>
      <Heading>الدفعات</Heading>
      {profile.role === 'admin' ? (
        <Section title="اختيار المندوب">
          {couriers.length === 0 ? (
            <Notice>لا توجد حسابات مندوبين.</Notice>
          ) : (
            couriers.map((courier) => (
              <ActionButton
                key={courier.id}
                onPress={() => setSelectedCourierId(courier.id)}
                tone={activeCourierId === courier.id ? 'secondary' : 'outline'}
              >
                {courier.fullName}{'\n'}{courier.code}
              </ActionButton>
            ))
          )}
        </Section>
      ) : null}

      <Section title="الفترة">
        <DatePicker label="من تاريخ" value={startDate} onChange={setStartDate} />
        <DatePicker label="إلى تاريخ" value={endDate} onChange={setEndDate} />
      </Section>

      {!rangeValid ? (
        <Notice tone="warning">تاريخ البداية يجب أن يكون قبل تاريخ النهاية أو مساويًا له.</Notice>
      ) : null}
      {profile.role === 'admin' && !selectedCourier ? (
        <Notice>اختر المندوب لعرض دفعاته.</Notice>
      ) : null}
      {activeCourierId != null && rangeValid ? (
        <>
          <Section title={`دفعات ${selectedCourier?.fullName ?? profile.name}`}>
            <View style={styles.summary}>
              <Text style={styles.total}>{money(payoutPiasters)}</Text>
              <Text style={styles.caption}>إجمالي رسوم توصيل الطلبات المكتملة</Text>
              <Text style={styles.caption}>عدد الطلبات المكتملة: {deliveredOrders.length}</Text>
            </View>
            {deliveredOrders.length === 0 ? (
              <Notice>لا توجد طلبات مكتملة لهذا المندوب في الفترة المحددة.</Notice>
            ) : (
              deliveredOrders.map((order) => <OrderRow key={order.id} order={order} />)
            )}
          </Section>

          <Section title={`الطلبات الملغاة خلال الفترة · ${cancelledOrders.length}`}>
            <Notice>الطلبات الملغاة تظهر للمراجعة فقط ولا تدخل في إجمالي الدفعات.</Notice>
            {cancelledOrders.length === 0 ? (
              <Body>لا توجد طلبات ملغاة في الفترة المحددة.</Body>
            ) : (
              cancelledOrders.map((order) => (
                <OrderRow key={order.id} order={order} cancelled />
              ))
            )}
          </Section>
        </>
      ) : null}
    </Page>
  );
}

function money(piasters: number) {
  return `${(piasters / 100).toLocaleString('ar-EG', { maximumFractionDigits: 2 })} ج.م`;
}

const styles = StyleSheet.create({
  summary: {
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  total: {
    color: colors.primaryDark,
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'right',
  },
  caption: {
    color: colors.muted,
    fontSize: 14,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  orderRow: {
    gap: 4,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.outline,
  },
  orderCode: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'right',
  },
});
