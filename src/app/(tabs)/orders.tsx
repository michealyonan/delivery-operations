import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  ActionButton,
  Body,
  Field,
  Heading,
  Notice,
  Page,
  SegmentedSwitch,
  StatusTag,
} from '../../components/ui';
import { Alert } from '../../lib/platform-alert';
import { parsePiasters, useApp } from '../../state/app-context';
import { colors, spacing } from '../../theme';
import type { DeliveryOrder } from '../../types';

function OrderItem({ order }: { order: DeliveryOrder }) {
  const {
    profile,
    couriers,
    locations,
    orders,
    isDemo,
    acceptAdminOrder,
    assignOrder,
    assignOrderToNearestCourier,
  } = useApp();
  const [busy, setBusy] = useState(false);
  const [deliveryFeeInput, setDeliveryFeeInput] = useState(
    order.deliveryFeePiasters == null ? '' : (order.deliveryFeePiasters / 100).toFixed(2),
  );
  const acceptAdminOrderFromRestaurant = async () => {
    setBusy(true);
    try {
      const courierId = await acceptAdminOrder(order.id);
      const courier = couriers.find((item) => item.id === courierId);
      Alert.alert(
        'تم قبول الطلب',
        courier
          ? `تم قبول الطلب وإرساله تلقائيًا إلى ${courier.fullName}.`
          : 'تم قبول الطلب، لكن لا يوجد مندوب متاح بموقع حديث الآن. سيظل الطلب ظاهرًا للإدارة لإسناده.',
      );
    } catch (error) {
      Alert.alert('تعذر قبول الطلب', error instanceof Error ? error.message : 'حاول مرة أخرى.');
    } finally {
      setBusy(false);
    }
  };

  const assign = async (courierId: number) => {
    let deliveryFeePiasters: number | undefined;
    if (order.status === 'pending') {
      try {
        deliveryFeePiasters = parsePiasters(deliveryFeeInput);
      } catch (error) {
        Alert.alert('رسوم غير صحيحة', error instanceof Error ? error.message : 'راجع المبلغ.');
        return;
      }
    }
    setBusy(true);
    try {
      await assignOrder(order.id, courierId, deliveryFeePiasters);
      Alert.alert('تم الإسناد', 'أُرسل الطلب للمندوب مع رسوم التوصيل.');
    } catch (error) {
      Alert.alert('تعذر الإسناد', error instanceof Error ? error.message : 'حاول مرة أخرى.');
    } finally {
      setBusy(false);
    }
  };

  const assignToNearestCourier = async () => {
    let deliveryFeePiasters: number;
    try {
      deliveryFeePiasters = parsePiasters(deliveryFeeInput);
    } catch (error) {
      Alert.alert('رسوم غير صحيحة', error instanceof Error ? error.message : 'راجع المبلغ.');
      return;
    }

    setBusy(true);
    try {
      const courierId = await assignOrderToNearestCourier(order.id, deliveryFeePiasters);
      const courier = couriers.find((item) => item.id === courierId);
      Alert.alert(
        'تم الإسناد',
        `أُرسل الطلب إلى ${courier?.fullName ?? 'أقرب مندوب متاح'} مع رسوم التوصيل المحددة.`,
      );
    } catch (error) {
      Alert.alert('تعذر الإرسال لأقرب مندوب', error instanceof Error ? error.message : 'حاول مرة أخرى.');
    } finally {
      setBusy(false);
    }
  };

  const hasRestaurantLocation =
    Number.isFinite(order.restaurantLatitude) && Number.isFinite(order.restaurantLongitude);
  const hasNearestCourier = hasRestaurantLocation && couriers.some((courier) => {
    if (!isEligibleCourier(courier)) return false;
    if (orders.some((item) => item.courierId === courier.id && ['assigned', 'accepted', 'picked_up'].includes(item.status))) {
      return false;
    }
    const location = locations.find((item) => item.courierId === courier.id) ?? courier.location;
    return Boolean(location);
  });

  return (
    <View style={styles.order}>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push({ pathname: '/order-details/[id]', params: { id: order.id } })}
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
      {profile?.role === 'restaurant' && order.orderSource === 'admin' ? (
        <>
          <Notice tone="info">طلبته الإدارة من مطعمك؛ راجع التفاصيل ثم اقبله لإرساله للمندوب.</Notice>
          {order.status === 'pending' && !order.restaurantAcceptedAt ? (
            <ActionButton
              disabled={busy}
              loading={busy}
              onPress={() => void acceptAdminOrderFromRestaurant()}
            >
              قبول الطلب وإرساله للمندوب
            </ActionButton>
          ) : order.status === 'pending' && order.restaurantAcceptedAt ? (
            <Notice tone="warning">
              قبل المطعم الطلب؛ لا يوجد مندوب متاح بموقع حديث حتى الآن. تتابع الإدارة إسناده.
            </Notice>
          ) : order.status === 'assigned' || order.status === 'accepted' || order.status === 'picked_up' ? (
            <Notice tone="info">قبل المطعم الطلب وأُرسل للمندوب.</Notice>
          ) : null}
        </>
      ) : null}
      {profile?.role === 'admin' &&
      order.orderSource === 'admin' &&
      order.status === 'pending' &&
      !order.restaurantAcceptedAt ? (
        <Notice tone="warning">ينتظر الطلب قبول المطعم؛ سيُرسل تلقائيًا لأقرب مندوب متاح بعد القبول.</Notice>
      ) : null}
      {profile?.role === 'admin' &&
      order.orderSource === 'admin' &&
      order.status === 'pending' &&
      order.restaurantAcceptedAt ? (
        <Notice tone="warning">قبل المطعم الطلب، ولا يوجد مندوب متاح بموقع حديث حتى الآن؛ يمكنك إسناده يدويًا.</Notice>
      ) : null}
      <Text style={styles.money}>
        {order.deliveryFeePiasters == null
          ? order.status === 'pending'
            ? `قيمة الأصناف: ${(order.restaurantDuePiasters / 100).toLocaleString('ar-EG')} ج.م · تُضاف رسوم التوصيل عند الإسناد`
            : 'لم يتم تحديد رسوم توصيل لهذا الطلب'
          : `المبلغ المطلوب من العميل: ${(order.amountDuePiasters / 100).toLocaleString('ar-EG')} ج.م`}
      </Text>
      {profile?.role === 'courier' && order.deliveryFeePiasters != null ? (
        <Text style={styles.money}>
          أجر التوصيل المضاف لك: {(order.deliveryFeePiasters / 100).toLocaleString('ar-EG')} ج.م
        </Text>
      ) : null}
      {profile?.role === 'admin' && order.assignmentExpiredAt ? (
        <Notice tone="warning">
          {`المندوب ${couriers.find((courier) => courier.id === order.lastUnacceptedCourierId)?.fullName ?? 'المسند إليه'} لم يقبل الطلب خلال 120 ثانية؛ عاد الطلب إلى الإدارة.`}
        </Notice>
      ) : null}
      {profile?.role === 'admin' &&
        order.status === 'pending' &&
        (order.orderSource !== 'admin' || Boolean(order.restaurantAcceptedAt)) && (
        <View style={styles.assignArea}>
          <Field
            keyboardType="decimal-pad"
            label="رسوم التوصيل · جنيه (مطلوبة قبل الإرسال)"
            onChangeText={setDeliveryFeeInput}
            value={deliveryFeeInput}
          />
          {!deliveryFeeInput.trim() ? (
            <Notice tone="warning">أدخل رسوم التوصيل قبل إرسال الطلب لأي مندوب.</Notice>
          ) : null}
          <Body>
            يختار النظام الأقرب لموقع المطعم ممن لا يحمل طلبًا نشطًا، بشرط تحديث موقعه خلال آخر 5 دقائق.
          </Body>
          <ActionButton
            disabled={busy || !deliveryFeeInput.trim() || !hasNearestCourier}
            loading={busy}
            onPress={() => void assignToNearestCourier()}
          >
            إرسال الطلب إلى أقرب مندوب متاح
          </ActionButton>
          {!hasRestaurantLocation ? (
            <Notice tone="warning">حدد موقع المطعم أولًا لإرسال الطلب إلى أقرب مندوب.</Notice>
          ) : !hasNearestCourier ? (
            <Notice tone="warning">لا يوجد مندوب على الشيفت بلا طلب حالي ولديه موقع مسجل.</Notice>
          ) : null}
          <Text style={styles.assignLabel}>إسناد سريع إلى:</Text>
          {couriers.filter(isEligibleCourier).length === 0 ? (
            <Notice tone="warning">لا يوجد مندوب متاح على الشيفت حاليًا؛ يتم استبعاد الموجودين في بريك أو الذين طلبوا إغلاق الشيفت أو انتهت عقودهم.</Notice>
          ) : (
            couriers
              .filter(isEligibleCourier)
              .map((courier) => (
                <ActionButton
                  key={courier.id}
                  disabled={busy || !deliveryFeeInput.trim()}
                  loading={busy}
                  onPress={() => assign(courier.id)}
                  tone="outline"
                >
                  {courier.fullName}{'\n'}{courier.code}
                </ActionButton>
              ))
          )}
          {isDemo && <Text style={styles.demoHint}>الإسناد في المعاينة غير متاح بين أجهزة.</Text>}
        </View>
      )}
    </View>
  );
}

function isEligibleCourier(courier: ReturnType<typeof useApp>['couriers'][number]) {
  return (
    courier.isActive &&
    !courier.isTerminated &&
    courier.isOnShift &&
    !courier.shiftCloseRequestedAt &&
    !courier.isOnBreak &&
    courier.contractEndDate >= new Date().toISOString().slice(0, 10)
  );
}

export default function OrdersScreen() {
  const { profile, orders, restaurants, orderReturns, isDemo } = useApp();
  const { showHistory: showHistoryParam } = useLocalSearchParams<{ showHistory?: string }>();
  const showCourierHistory = showHistoryParam === 'true';
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<number | null>(null);
  const [selectedRestaurantTab, setSelectedRestaurantTab] = useState('admin');
  const adminRequestedCount = orders.filter(
    (order) =>
      order.restaurantId === profile?.restaurantId &&
      order.orderSource === 'admin' &&
      order.status !== 'cancelled',
  ).length;
  const restaurantOrderCount = orders.filter(
    (order) =>
      order.restaurantId === profile?.restaurantId &&
      order.orderSource === 'restaurant' &&
      order.status !== 'cancelled',
  ).length;
  const restaurantOptions = restaurants
    .filter((restaurant) => orders.some((order) => order.restaurantId === restaurant.id))
    .sort((first, second) => first.name.localeCompare(second.name, 'ar-EG'));
  const visibleOrders = orders.filter((order) => {
    if (
      profile?.role === 'admin' &&
      selectedRestaurantId !== null &&
      order.restaurantId !== selectedRestaurantId
    ) {
      return false;
    }
    if (profile?.role === 'restaurant') {
      return (
        order.restaurantId === profile.restaurantId &&
        order.orderSource === (selectedRestaurantTab === 'admin' ? 'admin' : 'restaurant')
      );
    }
    if (profile?.role === 'courier') {
      return (
        order.courierId === profile.courierId &&
        (showCourierHistory
          ? order.status === 'delivered' ||
            (order.status === 'cancelled' &&
              orderReturns.some((orderReturn) => orderReturn.orderId === order.id))
          : ['assigned', 'accepted', 'picked_up'].includes(order.status))
      );
    }
    return true;
  }).sort((first, second) => {
    if (profile?.role !== 'admin') return 0;
    const firstPending = first.status === 'pending';
    const secondPending = second.status === 'pending';
    if (firstPending !== secondPending) return firstPending ? -1 : 1;
    if (firstPending) {
      return new Date(first.createdAt).getTime() - new Date(second.createdAt).getTime();
    }
    return 0;
  });

  return (
    <Page>
      <Heading>
        {profile?.role === 'courier'
          ? showCourierHistory ? 'الطلبات السابقة' : 'طلباتي الحالية'
          : profile?.role === 'restaurant'
            ? 'طلبات المطعم'
            : 'كل الطلبات'}
      </Heading>
      {profile?.role === 'restaurant' ? (
        <SegmentedSwitch
          items={[
            { key: 'admin', label: `طلبات الإدارة (${adminRequestedCount})` },
            { key: 'restaurant', label: `طلبات المطعم (${restaurantOrderCount})` },
          ]}
          selected={selectedRestaurantTab}
          onSelect={setSelectedRestaurantTab}
        />
      ) : null}
      {profile?.role === 'courier' ? (
        <ActionButton
          onPress={() => router.setParams({ showHistory: showCourierHistory ? 'false' : 'true' })}
          tone="outline"
        >
          {showCourierHistory ? 'عرض الطلبات الحالية' : 'عرض الطلبات السابقة'}
        </ActionButton>
      ) : null}
      {profile?.role === 'admin' ? (
        <>
          <ActionButton onPress={() => router.push('/restaurant-new-order')}>
            إنشاء طلب باسم الإدارة
          </ActionButton>
          <View style={styles.restaurantFilterSection}>
            <Text style={styles.filterHeading}>تصفية حسب المطعم</Text>
            <View style={styles.restaurantFilters}>
              {[{ id: null, name: 'كل المطاعم' }, ...restaurantOptions].map((restaurant) => {
                const selected = selectedRestaurantId === restaurant.id;
                return (
                  <Pressable
                    key={restaurant.id ?? 'all'}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setSelectedRestaurantId(restaurant.id)}
                    style={[styles.restaurantFilter, selected && styles.restaurantFilterSelected]}
                  >
                    <Text style={[styles.restaurantFilterText, selected && styles.restaurantFilterTextSelected]}>
                      {restaurant.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Body>تظهر الطلبات المعلقة أولًا، مرتبة من الأقدم إرسالًا إلى الأحدث.</Body>
          </View>
        </>
      ) : null}
      {isDemo && <Notice tone="warning">بيانات تجريبية داخل هذا الجهاز فقط.</Notice>}
      {profile?.role === 'restaurant' && selectedRestaurantTab === 'restaurant' && (
        <>
          {profile.restaurantAcceptsOrders === false ? (
            <Notice tone="warning">أوقفت الإدارة استقبال الطلبات الجديدة لهذا المطعم.</Notice>
          ) : null}
          <ActionButton
            disabled={profile.restaurantAcceptsOrders === false}
            onPress={() => router.push('/restaurant-new-order')}
          >
            {profile.restaurantAcceptsOrders === false ? 'استقبال الطلبات متوقف' : 'إرسال طلب جديد'}
          </ActionButton>
        </>
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
  restaurantFilterSection: { gap: spacing.sm, paddingVertical: spacing.sm },
  filterHeading: { color: colors.text, fontSize: 15, fontWeight: '700', textAlign: 'right' },
  restaurantFilters: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.sm },
  restaurantFilter: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.outline,
    borderRadius: 22,
    backgroundColor: colors.surface,
  },
  restaurantFilterSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  restaurantFilterText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  restaurantFilterTextSelected: { color: colors.white },
});
