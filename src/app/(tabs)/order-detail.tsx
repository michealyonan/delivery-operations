import { router, useLocalSearchParams } from 'expo-router';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import type { ImagePickerAsset } from 'expo-image-picker';
import { Image, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { ActionButton, Body, Field, Heading, Notice, Page, Section, StatusTag, Subheading } from '../../components/ui';
import { Alert } from '../../lib/platform-alert';
import { orderTransferReasonOptions } from '../../lib/order-transfer';
import { useApp, parsePiasters } from '../../state/app-context';
import { colors, spacing } from '../../theme';
import type { OrderTransferReason } from '../../types';

const CourierMap = lazy(() => import('../../components/courier-map'));
const googleMapsKeyConfigured = Boolean(process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY);

function money(piasters: number | undefined) {
  return `${((piasters ?? 0) / 100).toLocaleString('ar-EG', { maximumFractionDigits: 2 })} ج.م`;
}

function formatOrderTime(value?: string) {
  if (!value) return 'لم يتم بعد';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'غير متاح';
  return date.toLocaleString('ar-EG', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function OrderDetailScreen() {
  const rawId = useLocalSearchParams<{ id?: string | string[] }>().id;
  const orderId = Array.isArray(rawId) ? rawId[0] ?? '' : rawId ?? '';
  const normalizedOrderId = String(orderId);
  const {
    profile,
    orders,
    hasLoadedData,
    refresh,
    orderAssignmentAttempts,
    orderReturns,
    orderTransferRequests,
    couriers,
    locations,
    isDemo,
    acceptOrder,
    advanceOrder,
    assignOrder,
    getCourierContact,
    cancelOrder,
    startOrderReturn,
    completeOrderReturn,
    confirmOrderReturn,
    requestOrderTransfer,
  } = useApp();
  const order = useMemo(
    () => orders.find((item) => item.id === normalizedOrderId),
    [normalizedOrderId, orders],
  );
  const [retryingOrder, setRetryingOrder] = useState(false);
  const orderReturn = orderReturns.find((item) => item.orderId === normalizedOrderId);
  const canCourierViewOrderTimes =
    order?.status === 'delivered' ||
    orderReturn?.status === 'returned_by_courier' ||
    orderReturn?.status === 'closed';
  const courierDidNotAccept = orderAssignmentAttempts.some(
    (attempt) =>
      attempt.orderId === normalizedOrderId &&
      attempt.courierId === profile?.courierId &&
      attempt.status === 'not_accepted',
  );
  const courierLocation =
    order?.courierId == null
      ? undefined
      : locations.find((location) => location.courierId === order.courierId);
  const assignedCourier =
    order?.courierId == null
      ? undefined
      : couriers.find((courier) => courier.id === order.courierId);
  const pendingTransferRequest = orderTransferRequests.find(
    (request) => request.orderId === normalizedOrderId && request.status === 'pending',
  );
  const approvedHandoff = orderTransferRequests.find(
    (request) =>
      request.orderId === normalizedOrderId &&
      request.status === 'approved' &&
      request.toCourierId === profile?.courierId &&
      request.requiresHandoff,
  );
  const [contactResult, setContactResult] = useState<{
    orderId: string;
    contact: { name: string; phone: string } | null;
  } | null>(null);
  const [deliveryFeeDrafts, setDeliveryFeeDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [showCourierMap, setShowCourierMap] = useState(false);
  const [selectedCourierId, setSelectedCourierId] = useState<number | null>(null);
  const [clock, setClock] = useState(0);
  const [returnPhoto, setReturnPhoto] = useState<ImagePickerAsset | null>(null);
  const [returnRefundReceived, setReturnRefundReceived] = useState<boolean | null>(null);
  const [selectedTransferReason, setSelectedTransferReason] = useState<OrderTransferReason | null>(null);
  const [transferDetails, setTransferDetails] = useState('');
  const deliveryFeeInput = order
    ? deliveryFeeDrafts[order.id] ??
      (order.deliveryFeePiasters == null ? '' : (order.deliveryFeePiasters / 100).toFixed(2))
    : '';
  const updateDeliveryFeeInput = (value: string) => {
    if (order) setDeliveryFeeDrafts((current) => ({ ...current, [order.id]: value }));
  };

  useEffect(() => {
    const firstTick = setTimeout(() => setClock(Date.now()), 0);
    const interval = setInterval(() => setClock(Date.now()), 30_000);
    return () => {
    clearTimeout(firstTick);
    clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!normalizedOrderId || order || isDemo) return;
    refresh().catch((error: unknown) => {
      console.error('تعذر تحميل بيانات الطلب عند فتح التفاصيل:', error);
    });
  }, [normalizedOrderId, isDemo, order, refresh]);

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
        <ActionButton onPress={() => router.replace('/(tabs)/orders')} tone="outline">
          رجوع إلى الطلبات
        </ActionButton>
        <Heading>{hasLoadedData ? 'تعذر العثور على بيانات الطلب' : 'جارٍ تحميل بيانات الطلب'}</Heading>
        {hasLoadedData ? (
          <>
            <Notice tone="warning">
              لم تظهر بيانات هذا الطلب في القائمة المحمّلة. حدّث البيانات، وإذا استمرت المشكلة ستظهر رسالة الخطأ أعلى الشاشة.
            </Notice>
            <ActionButton
              disabled={retryingOrder}
              loading={retryingOrder}
              onPress={() => {
                setRetryingOrder(true);
                refresh()
                  .catch((error: unknown) => {
                    Alert.alert(
                      'تعذر تحميل الطلب',
                      error instanceof Error ? error.message : 'تحقق من الاتصال ثم أعد المحاولة.',
                    );
                  })
                  .finally(() => setRetryingOrder(false));
              }}
            >
              إعادة تحميل بيانات الطلب
            </ActionButton>
          </>
        ) : null}
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

  const openCourierMap = async () => {
    if (!courierLocation) {
      Alert.alert('موقع المندوب غير متاح', 'لم يرسل المندوب موقعه حتى الآن.');
      return;
    }
    const query = `${courierLocation.latitude},${courierLocation.longitude}`;
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
    await Linking.openURL(url);
  };

  const assignToCourier = (courierId: number) => {
    let feePiasters: number | undefined;
    if (order.status === 'pending') {
      try {
        feePiasters = parsePiasters(deliveryFeeInput);
      } catch (error) {
        Alert.alert('رسوم غير صحيحة', error instanceof Error ? error.message : 'راجع المبلغ.');
        return;
      }
    }
    void run(
      () => assignOrder(order.id, courierId, feePiasters),
      `${order.courierId ? 'تم تحويل' : 'تم إرسال'} الطلب مع رسوم التوصيل إلى ${
        couriers.find((courier) => courier.id === courierId)?.fullName ?? 'المندوب'
      }. سيؤكد المندوب استلامه قبل إكمال التوصيل.`,
    );
  };
  const deliverOrder = () =>
    run(async () => {
      await advanceOrder(order.id, 'delivered');
      router.replace({ pathname: '/(tabs)/orders', params: { showHistory: 'true' } });
    }, 'تم تسجيل توصيل الطلب.');
  const submitTransferRequest = () => {
    if (!selectedTransferReason) return;
    void run(async () => {
      await requestOrderTransfer(order.id, selectedTransferReason, transferDetails);
      setSelectedTransferReason(null);
      setTransferDetails('');
    }, 'تم إرسال طلب التحويل للإدارة والدعم للمراجعة.');
  };
  const requestCancelOrder = () => {
    const title = 'إلغاء الطلب';
    const message = 'سيتم إلغاء الطلب وإبلاغ المطعم من خلال تحديث حالته. لا يمكن التراجع عن الإلغاء.';
    const perform = () =>
      run(() => cancelOrder(order.id), 'تم إلغاء الطلب.');
    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n\n${message}`)) void perform();
      return;
    }
    Alert.alert(title, message, [
      { text: 'رجوع', style: 'cancel' },
      { text: 'إلغاء الطلب', style: 'destructive', onPress: () => void perform() },
    ]);
  };
  const requestOrderReturn = () => {
    const title = 'بدء رحلة إرجاع الطلب';
    const message = 'سيُسجل الطلب ملغيًا بسبب رفض العميل، وستظل عملية الإرجاع مفتوحة حتى يؤكد المطعم استلامه.';
    const perform = () =>
      run(() => startOrderReturn(order.id), 'بدأت رحلة الإرجاع. أعد الطلب للمطعم لتوثيق وصوله.');
    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n\n${message}`)) void perform();
      return;
    }
    Alert.alert(title, message, [
      { text: 'رجوع', style: 'cancel' },
      { text: 'بدء الإرجاع', style: 'destructive', onPress: () => void perform() },
    ]);
  };
  const takeReturnPhoto = async () => {
    try {
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        quality: 0.8,
        base64: true,
      };
      let result: ImagePicker.ImagePickerResult;
      if (Platform.OS === 'web') {
        result = await ImagePicker.launchCameraAsync(options);
      } else {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('إذن الكاميرا مطلوب', 'اسمح باستخدام الكاميرا لتوثيق رجوع الطلب للمطعم.');
          return;
        }
        result = await ImagePicker.launchCameraAsync(options);
      }
      if (result.canceled || !result.assets[0]) return;
      if (result.assets[0].fileSize && result.assets[0].fileSize > 8 * 1024 * 1024) {
        Alert.alert('الصورة كبيرة', 'اختر صورة لا يتجاوز حجمها 8 ميجابايت.');
        return;
      }
      setReturnPhoto(result.assets[0]);
    } catch (error) {
      Alert.alert('تعذر فتح الكاميرا', error instanceof Error ? error.message : 'حاول مرة أخرى.');
    }
  };
  const submitReturnedOrder = () => {
    if (!orderReturn || !returnPhoto || returnRefundReceived == null) {
      Alert.alert('بيانات الإرجاع ناقصة', 'صوّر الطلب واختر هل استلمت قيمة الطلب من المطعم.');
      return;
    }
    void run(async () => {
      await completeOrderReturn(orderReturn.id, returnPhoto, returnRefundReceived);
      setReturnPhoto(null);
      setReturnRefundReceived(null);
      router.replace({ pathname: '/(tabs)/orders', params: { showHistory: 'true' } });
    }, 'تم تسجيل وصول الطلب للمطعم وإرسال العملية لتأكيد المطعم.');
  };
  const feePreviewPiasters = (() => {
    if (!deliveryFeeInput.trim()) return null;
    try {
      return parsePiasters(deliveryFeeInput);
    } catch {
      return null;
    }
  })();
  const onShiftCouriers = couriers.filter(
    (courier) => courier.isActive && courier.isOnShift && !courier.isTerminated,
  );
  const onShiftCourierIds = new Set(onShiftCouriers.map((courier) => courier.id));
  const onShiftLocations = locations.filter((location) => onShiftCourierIds.has(location.courierId));

  return (
    <Page>
      <Heading>تفاصيل الطلب</Heading>
      {isDemo && <Notice tone="warning">بيانات توضيحية فقط.</Notice>}
      <View style={styles.titleRow}>
        <Subheading>{order.code}</Subheading>
        <StatusTag status={order.status} />
      </View>
      {profile?.role === 'restaurant' && order.orderSource === 'admin' ? (
        <Notice tone="info">أنشأت الإدارة هذا الطلب نيابةً عن المطعم.</Notice>
      ) : null}
      {profile?.role === 'courier' && courierDidNotAccept ? (
        <Notice tone="warning">
          لم تقبل الطلب خلال المهلة المحددة؛ عاد للإدارة لإعادة إسناده. يظهر هنا ضمن سجل الطلبات غير المقبولة.
        </Notice>
      ) : null}
      {profile?.role === 'admin' && order.assignmentExpiredAt ? (
        <Notice tone="warning">
          {`المندوب ${couriers.find((courier) => courier.id === order.lastUnacceptedCourierId)?.fullName ?? 'المسند إليه'} لم يقبل الطلب خلال 120 ثانية؛ عاد الطلب إلى الإدارة.`}
        </Notice>
      ) : null}
      {profile?.role === 'admin' && order.status === 'pending' ? (
        <ActionButton disabled={busy} loading={busy} onPress={requestCancelOrder} tone="danger">
          إلغاء الطلب قبل إسناده للمندوب
        </ActionButton>
      ) : null}

      <Section title="المطعم">
        <Body>{order.restaurantName}</Body>
        <Body>{order.restaurantAddress || 'لم يُسجل عنوان المطعم بعد.'}</Body>
        <ActionButton onPress={() => run(openRestaurantMap)} tone="outline">
          عرض موقع المطعم في الخرائط
        </ActionButton>
        {order.courierId != null ? (
          <>
            <ActionButton
              disabled={!courierLocation}
              onPress={() => run(openCourierMap)}
              tone="outline"
            >
              عرض موقع المندوب في الخرائط
            </ActionButton>
            {!courierLocation ? (
              <Notice>موقع المندوب غير متاح حاليًا؛ سيظهر بعد أن يبدأ مشاركة موقعه.</Notice>
            ) : null}
          </>
        ) : null}
      </Section>

      {(profile?.role !== 'courier' || canCourierViewOrderTimes) && (
        <Section title="مواعيد الطلب">
          <Body>إرسال المطعم للطلب: {formatOrderTime(order.createdAt)}</Body>
          {order.restaurantAcceptedAt ? (
            <Body>قبول المطعم للطلب: {formatOrderTime(order.restaurantAcceptedAt)}</Body>
          ) : null}
          <Body>إرسال الإدارة للمندوب: {formatOrderTime(order.assignedAt)}</Body>
          <Body>قبول المندوب للطلب: {formatOrderTime(order.acceptedAt)}</Body>
          <Body>تسليم الطلب للعميل: {formatOrderTime(order.deliveredAt)}</Body>
          {orderReturn?.returnedAt ? (
            <Body>إرجاع الطلب للمطعم: {formatOrderTime(orderReturn.returnedAt)}</Body>
          ) : null}
        </Section>
      )}

      <Section title="العميل">
        <Body>{order.customerName}</Body>
        <Body>{order.customerPhone}</Body>
        <Body>{order.customerAddress}</Body>
      </Section>

      <Section title="أصناف الطلب">
        {order.lineItems?.length
          ? order.lineItems.map((item, index) => (
              <View key={item.id} style={styles.itemRow}>
                <Text style={styles.itemIndex}>{index + 1}</Text>
                <View style={styles.itemDetails}>
                  <Text style={styles.itemText}>{item.name} × {item.quantity}</Text>
                  <Text style={styles.itemSubtext}>
                    {money(item.unitPricePiasters)} للصنف · الإجمالي {money(item.lineTotalPiasters)}
                  </Text>
                </View>
              </View>
            ))
          : order.itemsText.split(/\r?\n/).filter(Boolean).map((item, index) => (
              <View key={`${index}-${item}`} style={styles.itemRow}>
                <Text style={styles.itemIndex}>{index + 1}</Text>
                <Text style={styles.itemText}>{item}</Text>
              </View>
            ))}
        {order.notes ? <Notice>ملاحظات: {order.notes}</Notice> : null}
      </Section>

      <Section title="المبالغ">
        {order.deliveryFeePiasters == null ? (
          <Notice tone="warning">
            {order.status === 'pending'
              ? 'ستُضاف رسوم التوصيل إلى هذا الطلب عند إسناده للمندوب.'
              : 'لم يتم تحديد رسوم توصيل لهذا الطلب.'}
          </Notice>
        ) : (
          <>
            <Body>رسوم التوصيل لهذا الطلب: {money(order.deliveryFeePiasters)}</Body>
            <Body>إجمالي المبلغ المطلوب من العميل: {money(order.amountDuePiasters)}</Body>
            {profile?.role === 'courier' ? (
              <Body>أجر التوصيل المضاف لك: {money(order.deliveryFeePiasters)}</Body>
            ) : null}
          </>
        )}
        <Body>المطلوب دفعه للمطعم: {money(order.restaurantDuePiasters)}</Body>
      </Section>

      {profile?.role === 'courier' && order.status === 'picked_up' ? (
        <Section title="رفض العميل الاستلام">
          <Notice tone="warning">
            إذا رفض العميل الطلب بعد وصولك، ابدأ رحلة الإرجاع وأعده للمطعم بدل تسجيله كطلب تم توصيله.
          </Notice>
          <ActionButton
            disabled={busy || pendingTransferRequest != null}
            loading={busy}
            onPress={requestOrderReturn}
            tone="danger"
          >
            بدء رحلة الإرجاع للمطعم
          </ActionButton>
        </Section>
      ) : null}

      {orderReturn ? (
        <Section title="رحلة إرجاع الطلب">
          <Notice tone={orderReturn.status === 'closed' ? 'info' : 'warning'}>
            {orderReturn.status === 'in_transit'
              ? 'الطلب ملغي بسبب رفض العميل؛ المندوب في طريقه لإعادته للمطعم.'
              : orderReturn.status === 'returned_by_courier'
                ? 'وصل الطلب للمطعم، والعملية بانتظار تأكيد استلام المطعم.'
                : 'أكد المطعم استلام الطلب وأُغلقت عملية الإرجاع.'}
          </Notice>
          {orderReturn.status !== 'in_transit' ? (
            <>
              {orderReturn.photoUrl ? (
                <Image
                  accessibilityLabel="صورة الطلب بعد إرجاعه للمطعم"
                  source={{ uri: orderReturn.photoUrl }}
                  style={styles.returnPhoto}
                  resizeMode="cover"
                />
              ) : null}
              <Body>
                {orderReturn.courierReceivedRestaurantRefund
                  ? 'استلم المندوب قيمة الطلب التي دفعها للمطعم.'
                  : orderReturn.courierReceivedRestaurantRefund === false
                    ? 'لم يستلم المندوب قيمة الطلب من المطعم.'
                    : 'لم يسجل المندوب استلام قيمة الطلب بعد.'}
              </Body>
            </>
          ) : null}
          {profile?.role === 'courier' && orderReturn.status === 'in_transit' ? (
            <>
              <Body>عند وصولك للمطعم، صوّر الطلب واختر هل أعاد لك المطعم قيمة الطلب التي دفعتها.</Body>
              <ActionButton disabled={busy} onPress={() => void takeReturnPhoto()} tone="outline">
                {returnPhoto ? 'التقاط صورة أخرى للطلب' : 'تصوير الطلب في المطعم'}
              </ActionButton>
              {returnPhoto ? (
                <Image
                  accessibilityLabel="معاينة صورة المرتجع"
                  source={{ uri: returnPhoto.uri }}
                  style={styles.returnPhoto}
                  resizeMode="cover"
                />
              ) : null}
              <Body>هل استلمت من المطعم قيمة الطلب التي دفعتها؟</Body>
              <ActionButton
                onPress={() => setReturnRefundReceived(true)}
                tone={returnRefundReceived === true ? 'secondary' : 'outline'}
              >
                نعم، استلمت قيمة الطلب
              </ActionButton>
              <ActionButton
                onPress={() => setReturnRefundReceived(false)}
                tone={returnRefundReceived === false ? 'secondary' : 'outline'}
              >
                لا، لم أستلم قيمة الطلب
              </ActionButton>
              <ActionButton
                disabled={busy || !returnPhoto || returnRefundReceived == null}
                loading={busy}
                onPress={submitReturnedOrder}
              >
                تم إرجاع الطلب للمطعم
              </ActionButton>
            </>
          ) : null}
          {profile?.role === 'restaurant' && orderReturn.status === 'returned_by_courier' ? (
            <ActionButton
              disabled={busy}
              loading={busy}
              onPress={() =>
                run(
                  () => confirmOrderReturn(orderReturn.id),
                  'تم تأكيد استلام الطلب وإغلاق عملية الإرجاع.',
                )
              }
              tone="secondary"
            >
              تأكيد استلام المرتجع وإغلاق العملية
            </ActionButton>
          ) : null}
        </Section>
      ) : null}

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
            <>
              <Body>{assignedCourier?.fullName ?? 'مندوب'}</Body>
              <Body>كود المندوب: {assignedCourier?.code ?? 'غير متاح'}</Body>
            </>
          ) : null}
          {order.status === 'picked_up' ? (
            <Notice tone="warning">
              بعد التحويل، يؤكد المندوب الجديد استلام الطلب من المندوب السابق قبل إكمال التوصيل.
            </Notice>
          ) : null}
          {order.status === 'pending' ? (
            <>
              <Body>أدخل رسوم التوصيل لهذا الطلب قبل إرساله؛ ستُضاف لإجمالي العميل وتظهر للمندوب.</Body>
              <Field
                keyboardType="decimal-pad"
                label="رسوم التوصيل · جنيه"
                onChangeText={updateDeliveryFeeInput}
                value={deliveryFeeInput}
              />
              {!deliveryFeeInput.trim() ? (
                <Notice tone="warning">أدخل رسوم التوصيل قبل إرسال الطلب لأي مندوب.</Notice>
              ) : null}
              {feePreviewPiasters != null ? (
                <Body>إجمالي العميل بعد الإسناد: {money(order.restaurantDuePiasters + feePreviewPiasters)}</Body>
              ) : null}
            </>
          ) : null}
          <ActionButton
            disabled={onShiftCouriers.length === 0}
            onPress={() => setShowCourierMap((visible) => !visible)}
            tone="outline"
          >
            {showCourierMap ? 'إخفاء خريطة المندوبين' : 'عرض المندوبين على الخريطة'}
          </ActionButton>
          {onShiftCouriers.length === 0 ? (
            <Notice tone="warning">لا يوجد مندوب نشط على الشيفت الآن.</Notice>
          ) : (
            <>
              {showCourierMap ? (
                <>
                  {Platform.OS !== 'web' && !googleMapsKeyConfigured ? (
                    <Notice tone="warning">
                      الخريطة غير مهيأة على هذا الجهاز؛ يمكنك اختيار المندوب من القائمة أدناه.
                    </Notice>
                  ) : onShiftLocations.length === 0 ? (
                    <Notice>
                      لا توجد مواقع مرسلة للمندوبين حاليًا؛ شغّل مشاركة الموقع لعرضهم على الخريطة.
                    </Notice>
                  ) : (
                    <Suspense fallback={<Notice>جارٍ تحميل الخريطة...</Notice>}>
                      <CourierMap
                        couriers={onShiftCouriers}
                        locations={onShiftLocations}
                        clock={clock}
                        onCourierPress={setSelectedCourierId}
                      />
                    </Suspense>
                  )}
                </>
              ) : null}
              <Body>اختيار المندوب يدويًا</Body>
              {onShiftCouriers.map((courier) => {
                const activeOrder = orders.find(
                  (item) =>
                    item.courierId === courier.id &&
                    item.id !== order.id &&
                    ['assigned', 'accepted', 'picked_up'].includes(item.status),
                );
                const location = onShiftLocations.find((item) => item.courierId === courier.id);
                const isCurrentCourier = order.courierId === courier.id;
                const contractExpired =
                  courier.contractEndDate < new Date(clock).toISOString().slice(0, 10);
                const isAvailable =
                  !contractExpired &&
                  !courier.isOnBreak &&
                  !courier.shiftCloseRequestedAt &&
                  !activeOrder &&
                  !isCurrentCourier;
                const locationIsStale =
                  location != null && clock - new Date(location.recordedAt).getTime() > 120_000;
                return (
                  <View key={courier.id}>
                    <ActionButton
                      onPress={() => setSelectedCourierId(courier.id)}
                      tone={selectedCourierId === courier.id ? 'secondary' : 'outline'}
                    >
                      {courier.fullName}{'\n'}{courier.code}
                    </ActionButton>
                    {selectedCourierId === courier.id ? (
                      <>
                        <Body>
                          {isCurrentCourier
                            ? 'المندوب الحالي لهذا الطلب'
                            : activeOrder
                              ? `مشغول بالطلب ${activeOrder.code}`
                              : contractExpired
                                ? 'انتهى عقد المندوب؛ لا يمكن إسناد طلب جديد.'
                              : courier.shiftCloseRequestedAt
                                ? 'طلب إغلاق الشيفت بانتظار موافقة الإدارة؛ لا يمكن إسناد طلب جديد.'
                              : courier.isOnBreak
                                ? 'في فترة راحة'
                                : 'لا يوجد لديه طلب نشط'}
                        </Body>
                        <Body>
                          {location
                            ? locationIsStale
                              ? 'آخر موقع مسجل قديم'
                              : 'موقعه محدث'
                            : 'لا يوجد موقع مسجل'}
                        </Body>
                        <ActionButton
                          disabled={
                            busy ||
                            !isAvailable ||
                            (order.status === 'pending' && !deliveryFeeInput.trim())
                          }
                          loading={busy}
                          onPress={() => assignToCourier(courier.id)}
                        >
                          {courier.shiftCloseRequestedAt
                            ? 'بانتظار الموافقة على إغلاق الشيفت'
                            : order.courierId
                              ? 'تحويل الطلب إلى هذا المندوب'
                              : 'إرسال الطلب إلى هذا المندوب'}
                        </ActionButton>
                      </>
                    ) : null}
                  </View>
                );
              })}
            </>
          )}
        </Section>
      )}

      {profile?.role === 'courier' &&
      order.courierId === profile.courierId &&
      ['accepted', 'picked_up'].includes(order.status) ? (
        <Section title="طلب تحويل الطلب">
          {pendingTransferRequest ? (
            <Notice tone="warning">
              طلب التحويل بانتظار موافقة الإدارة أو الدعم. أوقف خطوات الطلب حتى يصلك القرار.
            </Notice>
          ) : (
            <>
              <Body>اختر سبب التحويل. إذا كان الطلب معك، سيُسند بعد الموافقة لأقرب مندوب متاح ويتسلم منك الطلب.</Body>
              <View style={styles.transferReasons}>
                {orderTransferReasonOptions.map((option) => (
                  <Pressable
                    key={option.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: selectedTransferReason === option.id }}
                    onPress={() => setSelectedTransferReason(option.id)}
                    style={[
                      styles.transferReason,
                      selectedTransferReason === option.id && styles.transferReasonSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.transferReasonText,
                        selectedTransferReason === option.id && styles.transferReasonTextSelected,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Field
                label={selectedTransferReason === 'other' ? 'اكتب السبب · مطلوب' : 'تفاصيل إضافية · اختياري'}
                maxLength={500}
                multiline
                onChangeText={setTransferDetails}
                value={transferDetails}
              />
              <ActionButton
                disabled={
                  busy ||
                  selectedTransferReason == null ||
                  (selectedTransferReason === 'other' && !transferDetails.trim())
                }
                loading={busy}
                onPress={submitTransferRequest}
                tone="outline"
              >
                إرسال طلب التحويل للإدارة والدعم
              </ActionButton>
            </>
          )}
        </Section>
      ) : null}

      {profile?.role === 'courier' && order.status === 'assigned' && (
        <ActionButton
          disabled={busy}
          loading={busy}
          onPress={() => run(() => acceptOrder(order.id), 'أصبح المطعم يرى اسمك ورقم تليفونك لهذا الطلب.')}
        >
          قبول واستلام الطلب
        </ActionButton>
      )}
      {profile?.role === 'courier' && order.status === 'accepted' ? (
        pendingTransferRequest ? (
          <Notice tone="warning">الطلب متوقف حتى تراجع الإدارة أو الدعم طلب التحويل.</Notice>
        ) : (
          <>
            {approvedHandoff ? (
              <>
                <Notice tone="warning">
                  استلم الطلب من المندوب {approvedHandoff.fromCourierName} ({approvedHandoff.fromCourierCode}) وسدد له قيمة الأصناف بدلًا من دفعها للمطعم مرة أخرى: {money(order.restaurantDuePiasters)}.
                </Notice>
                {approvedHandoff.fromCourierPhone ? (
                  <ActionButton
                    onPress={() => run(() => Linking.openURL(`tel:${approvedHandoff.fromCourierPhone}`))}
                    tone="outline"
                  >
                    الاتصال بالمندوب السابق
                  </ActionButton>
                ) : null}
              </>
            ) : (
              <Notice tone="info">عند استلام الطلب من المطعم، ادفع للمطعم: {money(order.restaurantDuePiasters)}</Notice>
            )}
            <ActionButton
              disabled={busy}
              loading={busy}
              onPress={() => run(() => advanceOrder(order.id, 'picked_up'), 'تم تسجيل استلام الطلب وبدء التوصيل.')}
            >
              {approvedHandoff ? 'استلمت الطلب من المندوب السابق وبدأت التوصيل' : 'استلمت الطلب وأبدأ التوصيل'}
            </ActionButton>
          </>
        )
      ) : null}
      {profile?.role === 'courier' && order.status === 'picked_up' ? (
        pendingTransferRequest ? (
          <Notice tone="warning">أوقف التوصيل حتى تراجع الإدارة أو الدعم طلب التحويل.</Notice>
        ) : (
          <>
            <Notice tone="info">عند تسليم الطلب للعميل، حصّل منه: {money(order.amountDuePiasters)}</Notice>
            <ActionButton
              disabled={busy}
              loading={busy}
              onPress={deliverOrder}
            >
              تم التوصيل للعميل
            </ActionButton>
          </>
        )
      ) : null}

      {profile?.role === 'courier' && order.status === 'delivered' && (
        <Section title="مبالغ الطلب">
          <Body>المبلغ الذي حصّلته من العميل: {money(order.collectedPiasters ?? order.amountDuePiasters)}</Body>
          <Body>المبلغ الذي دفعته للمطعم: {money(order.paidToRestaurantPiasters ?? (approvedHandoff ? 0 : order.restaurantDuePiasters))}</Body>
          {approvedHandoff ? (
            <Body>
              المبلغ الذي سددته للمندوب {approvedHandoff.fromCourierName}: {money(order.paidToPreviousCourierPiasters ?? order.restaurantDuePiasters)}
            </Body>
          ) : null}
          <Notice tone="info">تُسجّل المبالغ تلقائيًا عند بدء التوصيل وتسليم الطلب.</Notice>
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
  itemDetails: { flex: 1, gap: 4 },
  itemSubtext: { color: colors.muted, fontSize: 12, textAlign: 'right', writingDirection: 'rtl' },
  transferReasons: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.sm },
  transferReason: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.outline,
    borderRadius: 22,
    backgroundColor: colors.surface,
  },
  transferReasonSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  transferReasonText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  transferReasonTextSelected: { color: colors.white },
  returnPhoto: {
    width: '100%',
    height: 220,
    borderRadius: 16,
    backgroundColor: colors.surfaceRaised,
  },
});
