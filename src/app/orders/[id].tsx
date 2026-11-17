import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';

import { ActionButton, Body, Field, Heading, Notice, Page, Section, StatusTag, Subheading } from '../../components/ui';
import { useApp, parsePiasters } from '../../state/app-context';
import { colors, spacing } from '../../theme';

function money(piasters: number | undefined) {
  return `${((piasters ?? 0) / 100).toLocaleString('ar-EG', { maximumFractionDigits: 2 })} ج.م`;
}

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    profile,
    orders,
    couriers,
    isDemo,
    acceptOrder,
    advanceOrder,
    assignOrder,
    recordCash,
    getCourierContact,
  } = useApp();
  const order = useMemo(() => orders.find((item) => item.id === id), [id, orders]);
  const [contactResult, setContactResult] = useState<{
    orderId: string;
    contact: { name: string; phone: string } | null;
  } | null>(null);
  const [collected, setCollected] = useState('');
  const [paid, setPaid] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    if (profile?.role === 'restaurant' && order && ['accepted', 'picked_up', 'delivered'].includes(order.status)) {
      getCourierContact(order.id)
        .then((value) => {
          if (active) setContactResult({ orderId: order.id, contact: value });
        })
        .catch((error: unknown) => {
          if (active) {
            Alert.alert('تعذر تحميل بيانات المندوب', error instanceof Error ? error.message : 'حاول مرة أخرى.');
          }
        });
    }
    return () => {
      active = false;
    };
  }, [getCourierContact, order, profile?.role]);
  const contact =
    contactResult && order && contactResult.orderId === order.id
      ? contactResult.contact
      : null;

  if (!order) {
    return (
      <Page>
        <Heading>الطلب غير موجود</Heading>
        <ActionButton onPress={() => router.back()} tone="outline">رجوع</ActionButton>
      </Page>
    );
  }

  const run = async (action: () => Promise<void>, success?: string) => {
    setBusy(true);
    try {
      await action();
      if (success) Alert.alert('تم', success);
    } catch (error) {
      Alert.alert('تعذر تنفيذ الإجراء', error instanceof Error ? error.message : 'حاول مرة أخرى.');
    } finally {
      setBusy(false);
    }
  };

  const openRestaurantMap = async () => {
    const query =
      order.restaurantLatitude != null && order.restaurantLongitude != null
        ? `${order.restaurantLatitude},${order.restaurantLongitude}`
        : `${order.restaurantName} ${order.restaurantAddress}`;
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
    await Linking.openURL(url);
  };

  const saveCash = async () => {
    try {
      await run(
        () =>
          recordCash(
            order.id,
            parsePiasters(collected),
            parsePiasters(paid),
          ),
        'تم حفظ مبالغ الكاش للطلب.',
      );
    } catch (error) {
      Alert.alert('مبلغ غير صحيح', error instanceof Error ? error.message : 'راجع المبالغ.');
    }
  };

  return (
    <Page>
      <Heading>تفاصيل الطلب</Heading>
      {isDemo && <Notice tone="warning">بيانات توضيحية فقط.</Notice>}
      <View style={styles.titleRow}>
        <Subheading>{order.code}</Subheading>
        <StatusTag status={order.status} />
      </View>

      <Section title="المطعم">
        <Body>{order.restaurantName}</Body>
        <Body>{order.restaurantAddress || 'لم يُسجل عنوان المطعم بعد.'}</Body>
        <ActionButton onPress={() => run(openRestaurantMap)} tone="outline">
          عرض موقع المطعم في الخرائط
        </ActionButton>
      </Section>

      <Section title="العميل">
        <Body>{order.customerName}</Body>
        <Body>{order.customerPhone}</Body>
        <Body>{order.customerAddress}</Body>
      </Section>

      <Section title="أصناف الطلب">
        {order.itemsText.split(/\r?\n/).filter(Boolean).map((item, index) => (
          <View key={`${index}-${item}`} style={styles.itemRow}>
            <Text style={styles.itemIndex}>{index + 1}</Text>
            <Text style={styles.itemText}>{item}</Text>
          </View>
        ))}
        {order.notes ? <Notice>ملاحظات: {order.notes}</Notice> : null}
      </Section>

      <Section title="المبالغ">
        <Body>المطلوب من العميل: {money(order.amountDuePiasters)}</Body>
        <Body>المطلوب دفعه للمطعم: {money(order.restaurantDuePiasters)}</Body>
      </Section>

      {profile?.role === 'restaurant' && contact && (
        <Section title="بيانات المندوب">
          <Notice tone="info">قبل المندوب هذا الطلب؛ يمكنك التواصل معه مباشرة.</Notice>
          <Body>{contact.name}</Body>
          <Body>{contact.phone}</Body>
          <ActionButton
            onPress={() => run(() => Linking.openURL(`tel:${contact.phone}`))}
            tone="secondary"
          >
            اتصال بالمندوب
          </ActionButton>
        </Section>
      )}

      {profile?.role === 'restaurant' && !contact && ['assigned', 'pending'].includes(order.status) && (
        <Notice>ستظهر بيانات المندوب بعد قبوله الطلب.</Notice>
      )}

      {profile?.role === 'admin' &&
        ['pending', 'assigned', 'accepted', 'picked_up'].includes(order.status) && (
        <Section title={order.courierId ? 'تحويل الطلب لمندوب آخر' : 'إسناد لمندوب'}>
          {order.courierId ? (
            <Body>
              المندوب الحالي: {couriers.find((item) => item.id === order.courierId)?.fullName ?? 'مندوب'}
            </Body>
          ) : null}
          {order.status === 'picked_up' ? (
            <Notice tone="warning">
              بعد التحويل، يؤكد المندوب الجديد استلام الطلب من المندوب السابق قبل إكمال التوصيل.
            </Notice>
          ) : null}
          {couriers.filter((item) => item.isActive && item.isOnShift && item.id !== order.courierId).length === 0 ? (
            <Notice tone="warning">لا يوجد مندوب آخر نشط وعلى الشيفت.</Notice>
          ) : (
            couriers
              .filter((item) => item.isActive && item.isOnShift && item.id !== order.courierId)
              .map((courier) => (
                <ActionButton
                  key={courier.id}
                  disabled={busy}
                  loading={busy}
                  onPress={() =>
                    run(
                      () => assignOrder(order.id, courier.id),
                      `تم تحويل الطلب إلى ${courier.fullName}. سيؤكد المندوب الجديد استلامه قبل إكمال التوصيل.`,
                    )
                  }
                  tone="outline"
                >
                  {order.courierId ? 'تحويل إلى' : 'إسناد إلى'} {courier.fullName} · {courier.code}
                </ActionButton>
              ))
          )}
        </Section>
      )}

      {profile?.role === 'courier' && order.status === 'assigned' && (
        <ActionButton
          disabled={busy}
          loading={busy}
          onPress={() => run(() => acceptOrder(order.id), 'أصبح المطعم يرى اسمك ورقم تليفونك لهذا الطلب.')}
        >
          قبول واستلام الطلب
        </ActionButton>
      )}
      {profile?.role === 'courier' && order.status === 'accepted' && (
        <ActionButton
          disabled={busy}
          loading={busy}
          onPress={() => run(() => advanceOrder(order.id, 'picked_up'), 'تم تسجيل استلام الطلب وبدء التوصيل.')}
        >
          استلمت الطلب وأبدأ التوصيل
        </ActionButton>
      )}
      {profile?.role === 'courier' && order.status === 'picked_up' && (
        <ActionButton
          disabled={busy}
          loading={busy}
          onPress={() => run(() => advanceOrder(order.id, 'delivered'), 'تم تسجيل توصيل الطلب.')}
        >
          تم التوصيل للعميل
        </ActionButton>
      )}

      {profile?.role === 'courier' && order.status === 'delivered' && (
        <Section title="تسجيل كاش الطلب">
          {order.collectedPiasters == null ? (
            <>
              <Field
                keyboardType="decimal-pad"
                label="المبلغ الذي قبضته من العميل · جنيه"
                onChangeText={setCollected}
                value={collected}
              />
              <Field
                keyboardType="decimal-pad"
                label="المبلغ الذي دفعته للمطعم · جنيه"
                onChangeText={setPaid}
                value={paid}
              />
              <ActionButton disabled={busy} loading={busy} onPress={saveCash}>
                حفظ مبالغ الكاش
              </ActionButton>
            </>
          ) : (
            <>
              <Body>المقبوض من العميل: {money(order.collectedPiasters)}</Body>
              <Body>المدفوع للمطعم: {money(order.paidToRestaurantPiasters)}</Body>
            </>
          )}
        </Section>
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  itemRow: { flexDirection: 'row-reverse', gap: spacing.sm, alignItems: 'flex-start' },
  itemIndex: { color: colors.primary, fontWeight: '800', width: 22, textAlign: 'center' },
  itemText: { flex: 1, color: colors.text, fontSize: 15, lineHeight: 23, textAlign: 'right', writingDirection: 'rtl' },
});
