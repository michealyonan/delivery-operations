import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import DatePicker from '../../components/date-picker';
import { ActionButton, Body, Field, Heading, Notice, Page, Section } from '../../components/ui';
import { parsePiasters, useApp } from '../../state/app-context';
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
  const fee = order.deliveryFeePiasters ?? 0;
  const remitted = Math.min(fee, order.deliveryFeeRemittedPiasters ?? 0);
  const outstanding = Math.max(0, fee - remitted);
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
          <Body>رسوم التوصيل: {money(fee)}</Body>
          <Body>
            {fee === 0
              ? 'لا توجد رسوم توصيل على هذا الطلب.'
              : outstanding === 0
                ? `حالة التوريد: تم توريدها بالكامل · ${money(remitted)}`
                : remitted > 0
                  ? `حالة التوريد: تم توريد جزء · ${money(remitted)} من ${money(fee)}`
                  : `حالة التوريد: لم تورد · المتبقي ${money(outstanding)}`}
          </Body>
        </>
      )}
    </View>
  );
}

export default function PaymentsScreen() {
  const {
    profile,
    couriers,
    orders,
    courierFeeRemittances,
    recordCourierFeeRemittance,
  } = useApp();
  const today = new Date();
  const [startDate, setStartDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [endDate, setEndDate] = useState(today);
  const [selectedCourierId, setSelectedCourierId] = useState<number | null>(null);
  const [courierSearch, setCourierSearch] = useState('');
  const [remittanceInput, setRemittanceInput] = useState('');
  const [remittanceBusy, setRemittanceBusy] = useState(false);
  const [remittanceError, setRemittanceError] = useState('');
  const [remittanceSuccess, setRemittanceSuccess] = useState('');
  const activeCourierId =
    selectedCourierId ??
    (profile?.role === 'admin' ? couriers[0]?.id ?? null : profile?.courierId ?? null);

  const rangeStart = dayStart(startDate);
  const rangeEnd = dayEndExclusive(endDate);
  const rangeValid = rangeStart < rangeEnd;
  const selectedCourier = couriers.find((courier) => courier.id === activeCourierId);
  const filteredCouriers = useMemo(() => {
    const query = courierSearch.trim().toLocaleLowerCase();
    return query
      ? couriers.filter((courier) => courier.code.toLocaleLowerCase().includes(query))
      : couriers;
  }, [courierSearch, couriers]);
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
  const lifetimeDeliveredOrders = orders.filter(
    (order) => order.status === 'delivered' && order.courierId === activeCourierId,
  );
  const lifetimeFeePiasters = lifetimeDeliveredOrders.reduce(
    (total, order) => total + (order.deliveryFeePiasters ?? 0),
    0,
  );
  const lifetimeRemittedPiasters = lifetimeDeliveredOrders.reduce(
    (total, order) =>
      total +
      Math.min(
        order.deliveryFeePiasters ?? 0,
        order.deliveryFeeRemittedPiasters ?? 0,
      ),
    0,
  );
  const outstandingPiasters = Math.max(
    0,
    lifetimeFeePiasters - lifetimeRemittedPiasters,
  );
  const periodRemittances = courierFeeRemittances.filter(
    (remittance) =>
      remittance.courierId === activeCourierId &&
      isWithinRange(remittance.receivedAt, rangeStart, rangeEnd),
  );
  const periodRemittedPiasters = periodRemittances.reduce(
    (total, remittance) => total + remittance.amountPiasters,
    0,
  );

  const recordRemittance = async () => {
    if (profile?.role !== 'admin' || activeCourierId == null) return;
    setRemittanceBusy(true);
    setRemittanceError('');
    setRemittanceSuccess('');
    try {
      const amountPiasters = parsePiasters(remittanceInput);
      if (amountPiasters <= 0) throw new Error('أدخل مبلغًا أكبر من صفر.');
      const remittance = await recordCourierFeeRemittance(activeCourierId, amountPiasters);
      setRemittanceInput('');
      setRemittanceSuccess(
        `تم تسجيل استلام ${money(remittance.amountPiasters)} من ${selectedCourier?.fullName ?? 'المندوب'}.`,
      );
    } catch (error) {
      setRemittanceError(error instanceof Error ? error.message : 'تعذر تسجيل التوريد.');
    } finally {
      setRemittanceBusy(false);
    }
  };

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
            <>
              <Field
                autoCapitalize="characters"
                autoCorrect={false}
                label="ابحث برقم المندوب"
                onChangeText={setCourierSearch}
                placeholder="مثال: CR-000001"
                value={courierSearch}
              />
              {filteredCouriers.length === 0 ? (
                <Notice tone="warning">لا يوجد مندوب بهذا الرقم.</Notice>
              ) : (
                filteredCouriers.map((courier) => (
                  <ActionButton
                    key={courier.id}
                    onPress={() => {
                      setSelectedCourierId(courier.id);
                      setRemittanceInput('');
                      setRemittanceError('');
                      setRemittanceSuccess('');
                    }}
                    tone={activeCourierId === courier.id ? 'secondary' : 'outline'}
                  >
                    {courier.fullName}{'\n'}{courier.code}
                  </ActionButton>
                ))
              )}
            </>
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
      {activeCourierId != null ? (
        <Section title={`محفظة ${selectedCourier?.fullName ?? profile.name}`}>
          <View style={styles.summary}>
            <Text style={styles.total}>{money(outstandingPiasters)}</Text>
            <Text style={styles.caption}>مديونية رسوم التوصيل التي لم تورد للإدارة</Text>
            <Text style={styles.caption}>إجمالي رسوم التوصيل المكتسبة: {money(lifetimeFeePiasters)}</Text>
            <Text style={styles.caption}>إجمالي ما استلمته الإدارة: {money(lifetimeRemittedPiasters)}</Text>
          </View>
          {profile.role === 'admin' ? (
            <>
              {outstandingPiasters > 0 ? (
                <>
                  <Notice>
                    المبلغ الذي تدخله سيُخصم من المديونية ويُحتسب أولًا على أقدم الطلبات غير الموردة.
                  </Notice>
                  <Field
                    keyboardType="decimal-pad"
                    label="المبلغ الذي استلمته الإدارة · جنيه"
                    onChangeText={setRemittanceInput}
                    value={remittanceInput}
                  />
                  <ActionButton
                    disabled={!remittanceInput.trim()}
                    loading={remittanceBusy}
                    onPress={recordRemittance}
                  >
                    تسجيل التوريد
                  </ActionButton>
                </>
              ) : (
                <Notice>لا توجد مديونية رسوم توصيل غير موردة.</Notice>
              )}
              {remittanceError ? <Notice tone="danger">{remittanceError}</Notice> : null}
              {remittanceSuccess ? <Notice tone="info">{remittanceSuccess}</Notice> : null}
            </>
          ) : null}
        </Section>
      ) : null}

      {activeCourierId != null && rangeValid ? (
        <>
          <Section title={`دفعات ${selectedCourier?.fullName ?? profile.name}`}>
            <View style={styles.summary}>
              <Text style={styles.total}>{money(payoutPiasters)}</Text>
              <Text style={styles.caption}>رسوم توصيل الطلبات المكتملة خلال الفترة</Text>
              <Text style={styles.caption}>عدد الطلبات المكتملة: {deliveredOrders.length}</Text>
            </View>
            {deliveredOrders.length === 0 ? (
              <Notice>لا توجد طلبات مكتملة لهذا المندوب في الفترة المحددة.</Notice>
            ) : (
              deliveredOrders.map((order) => <OrderRow key={order.id} order={order} />)
            )}
          </Section>

          <Section title={`توريدات الإدارة خلال الفترة · ${periodRemittances.length}`}>
            <View style={styles.summary}>
              <Text style={styles.total}>{money(periodRemittedPiasters)}</Text>
              <Text style={styles.caption}>إجمالي ما سجلته الإدارة كمبالغ مستلمة</Text>
            </View>
            {periodRemittances.length === 0 ? (
              <Body>لا توجد توريدات مسجلة في الفترة المحددة.</Body>
            ) : (
              periodRemittances.map((remittance) => (
                <View key={remittance.id} style={styles.orderRow}>
                  <Text style={styles.orderCode}>استلام {money(remittance.amountPiasters)}</Text>
                  <Body>التاريخ: {formatDate(remittance.receivedAt)}</Body>
                </View>
              ))
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
