import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { lazy, Suspense, useEffect, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { ActionButton, Body, Heading, Notice, Page, Section, SegmentedSwitch, StatusTag, Subheading } from '../../components/ui';
import { BreakCountdown } from '../../components/break-countdown';
import { Alert } from '../../lib/platform-alert';
import { useApp } from '../../state/app-context';
import { colors, spacing } from '../../theme';
import type { DeliveryOrder } from '../../types';

const CourierMap = lazy(() => import('../../components/courier-map'));
const mapKeyConfigured = Boolean(process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY);
const dashboardStartedAt = Date.now();

function isToday(value: string) {
  return new Date(value).toDateString() === new Date().toDateString();
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function RecentOrder({ order }: { order: DeliveryOrder }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/(tabs)/order-detail', params: { id: order.id } })}
      style={styles.orderRow}
    >
      <View style={styles.orderMain}>
        <Text style={styles.orderCode}>{order.code}</Text>
        <Text style={styles.orderInfo}>
          {order.restaurantName} · {order.customerAddress}
          {order.orderSource === 'admin' ? ' · طلب أنشأته الإدارة' : ''}
        </Text>
      </View>
      <StatusTag status={order.status} />
    </Pressable>
  );
}

function AdminHome() {
  const {
    orders,
    couriers,
    locations,
    restaurants,
    hasLoadedData,
    isDemo,
    refresh,
    signOut,
    setCourierOnBreak,
    endCourierBreak,
  } = useApp();
  const [elapsed, setElapsed] = useState(0);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const [selectedCourierId, setSelectedCourierId] = useState<number | null>(null);
  const [breakDuration, setBreakDuration] = useState('15');
  const [breakBusy, setBreakBusy] = useState(false);
  const [breakMessage, setBreakMessage] = useState('');
  const [breakMessageTone, setBreakMessageTone] = useState<'info' | 'danger'>('info');
  useEffect(() => {
    const timer = setInterval(() => setElapsed((value) => value + 30_000), 30_000);
    return () => clearInterval(timer);
  }, []);
  const clock = dashboardStartedAt + elapsed;
  const deliveredToday = orders.filter(
    (order) => order.status === 'delivered' && order.deliveredAt && isToday(order.deliveredAt),
  ).length;
  const pending = orders.filter((order) => order.status === 'pending').length;
  const noAdminData =
    hasLoadedData &&
    !isDemo &&
    orders.length === 0 &&
    couriers.length === 0 &&
    restaurants.length === 0;
  const activeCouriers = couriers.filter((courier) => courier.isActive && !courier.isTerminated);
  const onShift = activeCouriers.filter(
    (courier) =>
      courier.isOnShift &&
      !courier.shiftCloseRequestedAt &&
      !(courier.breakUntil && new Date(courier.breakUntil).getTime() > clock),
  ).length;
  const offShift = activeCouriers.filter((courier) => !courier.isOnShift).length;
  const onBreak = activeCouriers.filter(
    (courier) =>
      courier.isOnShift &&
      courier.breakUntil != null &&
      new Date(courier.breakUntil).getTime() > clock,
  ).length;
  const shiftCloseRequests = activeCouriers.filter((courier) => courier.shiftCloseRequestedAt).length;
  const activeOrders = orders.filter(
    (order) => ['assigned', 'accepted', 'picked_up'].includes(order.status),
  );
  const selectedCourier = couriers.find((courier) => courier.id === selectedCourierId);
  const selectedLocation = locations.find((location) => location.courierId === selectedCourierId);
  const selectedOrder = activeOrders.find((order) => order.courierId === selectedCourierId);
  const selectedCourierOnBreak =
    Boolean(selectedCourier?.breakUntil) &&
    new Date(selectedCourier?.breakUntil ?? 0).getTime() > clock;
  const selectedCourierEligible =
    Boolean(selectedCourier?.isActive) &&
    !selectedCourier?.isTerminated &&
    Boolean(selectedCourier?.contractEndDate) &&
    (selectedCourier?.contractEndDate ?? '') >= new Date(clock).toISOString().slice(0, 10);

  const selectCourier = (courierId: number) => {
    setSelectedCourierId(courierId);
    setBreakMessage('');
    setBreakMessageTone('info');
  };

  const startCourierBreak = async () => {
    if (!selectedCourier) return;
    setBreakBusy(true);
    setBreakMessage('');
    try {
      const breakUntil = await setCourierOnBreak(selectedCourier.id, Number(breakDuration));
      setBreakMessageTone('info');
      setBreakMessage(`تم إخراج ${selectedCourier.fullName} لبريك حتى ${new Date(breakUntil).toLocaleTimeString('ar-EG')}.`);
    } catch (error) {
      setBreakMessageTone('danger');
      setBreakMessage(error instanceof Error ? error.message : 'تعذر بدء البريك. حاول مرة أخرى.');
    } finally {
      setBreakBusy(false);
    }
  };
  const returnCourierToWork = async () => {
    if (!selectedCourier) return;
    setBreakBusy(true);
    setBreakMessage('');
    try {
      await endCourierBreak(selectedCourier.id);
      setBreakMessageTone('info');
      setBreakMessage(`تم فك بريك ${selectedCourier.fullName} وإرجاعه للشغل.`);
    } catch (error) {
      setBreakMessageTone('danger');
      setBreakMessage(error instanceof Error ? error.message : 'تعذر فك البريك.');
    } finally {
      setBreakBusy(false);
    }
  };

  const reload = async () => {
    try {
      await refresh();
    } catch (error) {
      Alert.alert('تعذر التحديث', error instanceof Error ? error.message : 'حاول مرة أخرى.');
    }
  };

  const logout = async () => {
    setLogoutBusy(true);
    setLogoutError('');
    try {
      await signOut();
      router.replace('/login');
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : 'تعذر تسجيل الخروج. حاول مرة أخرى.');
    } finally {
      setLogoutBusy(false);
    }
  };

  return (
    <Page>
      <View style={styles.topLine}>
        <View style={styles.flex}>
          <Heading>لوحة الإدارة</Heading>
          <Body>متابعة الطلبات والمندوبين اليوم</Body>
        </View>
        <View style={styles.topActions}>
          <Pressable accessibilityRole="button" onPress={reload} style={styles.iconButton}>
            <MaterialCommunityIcons name="refresh" size={23} color={colors.primary} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="تسجيل الخروج"
            disabled={logoutBusy}
            onPress={logout}
            style={[styles.iconButton, logoutBusy && styles.logoutButtonDisabled]}
          >
            <MaterialCommunityIcons name="logout" size={23} color={colors.danger} />
          </Pressable>
        </View>
      </View>
      {logoutError ? <Notice tone="danger">{logoutError}</Notice> : null}
      {isDemo && <Notice tone="warning">معاينة ببيانات توضيحية فقط؛ لا يوجد تتبع مباشر في الوضع التجريبي.</Notice>}
      {noAdminData ? (
        <Notice tone="warning">
          لا تظهر سجلات في حساب الإدارة. إذا كانت لديك بيانات سابقة، لا تُعد إنشاء الحسابات؛ تحقق من
          اتصال قاعدة البيانات وصلاحيات الإدارة ثم أعد تحميل البيانات.
        </Notice>
      ) : null}
      <View style={styles.metrics}>
        <Metric value={String(pending)} label="بانتظار الإسناد" />
        <Metric value={String(deliveredToday)} label="تم توصيلها اليوم" />
      </View>
      <Section title="طلب جديد من الإدارة">
        <Body>اختر المطعم، وسجّل بيانات العميل والرسوم. يراجع المطعم الطلب ويقبله قبل إرساله تلقائيًا للمندوب.</Body>
        <ActionButton onPress={() => router.push('/restaurant-new-order')}>
          إنشاء طلب وإرساله للمطعم
        </ActionButton>
      </Section>

      <Section title="حالة المناديب الآن">
        <View style={styles.metrics}>
          <Metric value={String(onShift)} label="متاح لطلب جديد" />
          <Metric value={String(offShift)} label="قافل الشيفت" />
          <Metric value={String(onBreak)} label="في بريك" />
        </View>
        {shiftCloseRequests > 0 ? (
          <Notice tone="warning">
            {`طلبات إغلاق الشيفت بانتظار موافقتك: ${shiftCloseRequests}. يظل هؤلاء المناديب على الشيفت حتى اعتماد الإغلاق.`}
          </Notice>
        ) : null}
      </Section>

      <Section
        title="موقع المندوبين"
        action={
          <Pressable onPress={reload} accessibilityRole="button">
            <Text style={styles.actionText}>تحديث</Text>
          </Pressable>
        }
      >
        {(Platform.OS !== 'web' && !mapKeyConfigured) || !locations.length ? (
          <Notice tone={locations.length ? 'warning' : 'info'}>
            {isDemo
              ? 'المعاينة لا ترسل مواقع حقيقية.'
              : Platform.OS !== 'web' && !mapKeyConfigured
                ? 'أضف مفتاح خرائط Google لعرض الخريطة على Android.'
                : 'لا توجد مواقع حديثة للمندوبين. تأكد من تشغيل الشيفت وإذن الموقع والإنترنت.'}
          </Notice>
        ) : (
          <Suspense fallback={<View style={styles.map} />}>
            <CourierMap
              couriers={couriers}
              locations={locations}
              clock={clock}
              height={420}
              onCourierPress={selectCourier}
              selectedCourierId={selectedCourierId}
            />
          </Suspense>
        )}
        {selectedCourier ? (
          <View style={styles.courierDetails}>
            <View style={styles.courierIdentity}>
              {selectedCourier.profilePhotoUrl ? (
                <Image
                  accessibilityLabel={`صورة ${selectedCourier.fullName}`}
                  source={{ uri: selectedCourier.profilePhotoUrl }}
                  style={styles.courierAvatar}
                />
              ) : (
                <View style={styles.courierAvatarPlaceholder}>
                  <Text style={styles.courierAvatarInitial}>
                    {selectedCourier.fullName.trim().slice(0, 1)}
                  </Text>
                </View>
              )}
              <Subheading>{selectedCourier.fullName}</Subheading>
            </View>
            <Text style={styles.orderInfo}>كود المندوب: {selectedCourier.code}</Text>
            <ActionButton
              onPress={() =>
                router.push({
                  pathname: '/(tabs)/couriers/[id]',
                  params: { id: String(selectedCourier.id) },
                })
              }
              tone="outline"
            >
              فتح ملف المندوب وصورته وبياناته
            </ActionButton>
            <Text style={styles.orderInfo}>
              الحالة: {selectedCourierOnBreak
                ? selectedCourier.breakStartedBy === 'courier' ? 'في بريك بطلبه' : 'في بريك من الإدارة'
                : selectedCourier.isOnShift ? 'على الشيفت' : 'خارج الشيفت'}
              {selectedCourier.shiftCloseRequestedAt ? ' · طلب إغلاق الشيفت بانتظار الإدارة' : ''}
            </Text>
            <Text style={styles.orderInfo}>
              آخر موقع: {selectedLocation
                ? new Date(selectedLocation.recordedAt).toLocaleString('ar-EG')
                : 'لا يوجد موقع مسجل'}
            </Text>
            {selectedOrder ? (
              <View style={styles.selectedOrder}>
                <View style={styles.orderHeading}>
                  <Text style={styles.orderCode}>{selectedOrder.code}</Text>
                  <StatusTag status={selectedOrder.status} />
                </View>
                <Text style={styles.orderInfo}>المطعم: {selectedOrder.restaurantName}</Text>
                <Text style={styles.orderInfo}>عنوان المطعم: {selectedOrder.restaurantAddress || 'غير مسجل'}</Text>
                <Text style={styles.orderInfo}>عنوان العميل: {selectedOrder.customerAddress}</Text>
                <Text style={styles.orderInfo}>
                  أُرسل للمندوب: {selectedOrder.assignedAt
                    ? new Date(selectedOrder.assignedAt).toLocaleString('ar-EG')
                    : 'غير مسجل'}
                </Text>
                <Text style={styles.orderInfo}>
                  قبله المندوب: {selectedOrder.acceptedAt
                    ? new Date(selectedOrder.acceptedAt).toLocaleString('ar-EG')
                    : 'لم يقبله بعد'}
                </Text>
                <ActionButton
                  onPress={() =>
                    router.push({
                      pathname: '/(tabs)/order-detail',
                      params: { id: selectedOrder.id },
                    })
                  }
                  tone="outline"
                >
                  فتح الطلب وتحويله لمندوب آخر
                </ActionButton>
              </View>
            ) : (
              <Body>لا يوجد طلب نشط مع هذا المندوب.</Body>
            )}
            {selectedCourierOnBreak ? (
              <>
                <Notice tone={selectedCourier.breakStartedBy === 'courier' ? 'info' : 'warning'}>
                  {selectedCourier.breakStartedBy === 'courier' ? 'بريك بدأه المندوب' : 'بريك من الإدارة'}
                  {' '}حتى {new Date(selectedCourier.breakUntil ?? '').toLocaleString('ar-EG')}.
                </Notice>
                <BreakCountdown until={selectedCourier.breakUntil!} />
                <ActionButton
                  disabled={breakBusy}
                  loading={breakBusy}
                  onPress={() => void returnCourierToWork()}
                  tone="secondary"
                >
                  فك البريك وإرجاع المندوب للشغل
                </ActionButton>
              </>
            ) : selectedOrder ? (
              <Notice tone="warning">حوّل الطلب أو أكمله قبل إخراج المندوب لبريك.</Notice>
            ) : selectedCourierEligible &&
              selectedCourier.isOnShift &&
              !selectedCourier.shiftCloseRequestedAt ? (
              <>
                <Text style={styles.orderInfo}>مدة البريك</Text>
                <SegmentedSwitch
                  items={[
                    { key: '5', label: '٥ د' },
                    { key: '10', label: '١٠ د' },
                    { key: '15', label: '١٥ د' },
                    { key: '20', label: '٢٠ د' },
                    { key: '30', label: '٣٠ د' },
                    { key: '60', label: '٦٠ د' },
                  ]}
                  selected={breakDuration}
                  onSelect={(value) => setBreakDuration(value)}
                />
                <ActionButton loading={breakBusy} onPress={startCourierBreak}>
                  إخراج المندوب لبريك
                </ActionButton>
              </>
            ) : (
              <Notice>لا يمكن إخراج المندوب لبريك؛ تأكد من نشاط الحساب وسريان العقد والشيفت.</Notice>
            )}
            {breakMessage ? <Notice tone={breakMessageTone}>{breakMessage}</Notice> : null}
          </View>
        ) : null}
        {locations.map((location) => {
          const courier = couriers.find((item) => item.id === location.courierId);
          const stale = clock - new Date(location.recordedAt).getTime() > 120_000;
          return (
            <Pressable
              key={`loc-${location.courierId}`}
              accessibilityRole="button"
              onPress={() => selectCourier(location.courierId)}
              style={[
                styles.locationRow,
                selectedCourierId === location.courierId && styles.locationRowSelected,
              ]}
            >
              <Text style={styles.orderCode}>{courier?.fullName ?? 'مندوب'}</Text>
              <Text style={[styles.orderInfo, stale && { color: colors.warning }]}>
                {stale ? 'آخر تحديث قديم' : 'موقع مباشر'} ·{' '}
                {new Date(location.recordedAt).toLocaleTimeString('ar-EG')}
              </Text>
            </Pressable>
          );
        })}
      </Section>

      <Section
        title="الطلبات النشطة"
        action={
          <Pressable onPress={() => router.push('/(tabs)/orders')} accessibilityRole="button">
            <Text style={styles.actionText}>كل الطلبات</Text>
          </Pressable>
        }
      >
        {activeOrders.length === 0 ? (
          <Body>لا توجد طلبات نشطة الآن.</Body>
        ) : (
          activeOrders.slice(0, 4).map((order) => <RecentOrder key={order.id} order={order} />)
        )}
      </Section>

    </Page>
  );
}

function RestaurantHome() {
  const { profile, orders, isDemo, setRestaurantLocation } = useApp();
  const acceptsOrders = profile?.restaurantAcceptsOrders !== false;
  const [busy, setBusy] = useState(false);
  const ownOrders = orders.filter((order) => order.restaurantId === profile?.restaurantId);
  const onShiftCount = ownOrders.filter((order) =>
    ['assigned', 'accepted', 'picked_up'].includes(order.status),
  ).length;

  const updateLocation = async () => {
    setBusy(true);
    try {
      const { readCurrentLocation } = await import('../../lib/location');
      const location = await readCurrentLocation();
      await setRestaurantLocation(location.latitude, location.longitude);
      Alert.alert('تم حفظ الموقع', 'سيظهر موقع المطعم للمندوب في تفاصيل الطلب.');
    } catch (error) {
      Alert.alert('تعذر حفظ الموقع', error instanceof Error ? error.message : 'حاول مرة أخرى.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page>
      <Heading>{profile?.name}</Heading>
      <Body>أرسل طلبات المطعم وتابع وصول المندوب.</Body>
      {isDemo && <Notice tone="warning">حساب تجريبي؛ الطلبات لا تصل إلى أجهزة أخرى.</Notice>}
      {!acceptsOrders ? (
        <Notice tone="warning">أوقفت الإدارة استقبال الطلبات الجديدة لهذا المطعم. يمكنك متابعة الطلبات السابقة وإدارة القائمة.</Notice>
      ) : null}
      {profile?.restaurantAddress ? <Body>العنوان: {profile.restaurantAddress}</Body> : null}
      {profile?.restaurantLatitude != null && profile.restaurantLongitude != null ? (
        <Body>
          الموقع محفوظ: {profile.restaurantLatitude.toFixed(5)}, {profile.restaurantLongitude.toFixed(5)}
        </Body>
      ) : (
        <Notice tone="warning">لم يتم تحديد موقع المطعم بعد.</Notice>
      )}
      <View style={styles.metrics}>
        <Metric value={String(ownOrders.length)} label="إجمالي الطلبات" />
        <Metric value={String(onShiftCount)} label="في التوصيل" />
      </View>
      <ActionButton onPress={() => router.push('/restaurant-menu')} tone="outline">
        إدارة أصناف المطعم وأسعارها
      </ActionButton>
      <ActionButton
        disabled={!acceptsOrders}
        onPress={() => router.push('/restaurant-new-order')}
      >
        {acceptsOrders ? 'إنشاء طلب جديد' : 'استقبال الطلبات متوقف'}
      </ActionButton>
      <Section title="موقع المطعم">
        <Notice>
          حدّد موقعك من داخل المطعم مرة واحدة ليظهر للمندوب مع العنوان. يتطلب ذلك إذن الموقع أثناء الاستخدام.
        </Notice>
        <ActionButton disabled={isDemo} loading={busy} onPress={updateLocation} tone="outline">
          حفظ موقعي الحالي للمطعم
        </ActionButton>
        {isDemo && <Body>تحديد موقع حقيقي غير متاح في المعاينة.</Body>}
      </Section>
      <Section title="أحدث الطلبات">
        {ownOrders.length === 0 ? (
          <Body>لا توجد طلبات. ابدأ بإضافة أول طلب.</Body>
        ) : (
          ownOrders.slice(0, 4).map((order) => <RecentOrder key={order.id} order={order} />)
        )}
      </Section>
    </Page>
  );
}

function CourierHome() {
  const { profile, orders, isDemo, setShift, endCourierBreak } = useApp();
  const [busy, setBusy] = useState(false);
  const [shiftError, setShiftError] = useState('');
  const [breakBusy, setBreakBusy] = useState(false);
  const [breakError, setBreakError] = useState('');
  const [now, setNow] = useState<number | null>(null);
  const active = Boolean(profile?.isOnShift);
  const closeRequested = Boolean(profile?.shiftCloseRequestedAt);
  const activeBreak = Boolean(
    now !== null && profile?.breakUntil && new Date(profile.breakUntil).getTime() > now,
  );
  useEffect(() => {
    const firstUpdate = setTimeout(() => setNow(Date.now()), 0);
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      clearTimeout(firstUpdate);
      clearInterval(timer);
    };
  }, []);
  const allMyOrders = orders.filter((order) => order.courierId === profile?.courierId);
  const myOrders = allMyOrders.filter((order) =>
    ['assigned', 'accepted', 'picked_up'].includes(order.status),
  );
  const deliveredOrders = allMyOrders.filter((order) => order.status === 'delivered');
  const todayOrders = deliveredOrders.filter((order) => order.deliveredAt && isToday(order.deliveredAt));
  const todayCollected = todayOrders.reduce(
    (total, order) => total + (order.deliveryFeePiasters ?? 0),
    0,
  );

  const toggleShift = async () => {
    setBusy(true);
    setShiftError('');
    try {
      await setShift(!active);
    } catch (error) {
      setShiftError(error instanceof Error ? error.message : 'تعذر تغيير الشيفت. حاول مرة أخرى.');
    } finally {
      setBusy(false);
    }
  };
  const endOwnBreak = async () => {
    if (!profile?.courierId) return;
    setBreakBusy(true);
    setBreakError('');
    try {
      await endCourierBreak(profile.courierId);
    } catch (error) {
      setBreakError(error instanceof Error ? error.message : 'تعذر فك البريك.');
    } finally {
      setBreakBusy(false);
    }
  };

  return (
    <Page>
      <Heading>أهلًا {profile?.name}</Heading>
      <Body>رقم المندوب الثابت: {profile?.courierCode ?? 'معاينة'}</Body>
      {isDemo && <Notice tone="warning">الموقع والطلبات في هذه الشاشة بيانات تجريبية.</Notice>}
      <View style={[styles.shiftBanner, active ? styles.shiftOn : styles.shiftOff]}>
        <Subheading>
          {activeBreak
            ? profile?.breakStartedBy === 'courier' ? 'أنت في بريك بطلبك' : 'أنت في بريك من الإدارة'
            : closeRequested
            ? 'طلب إغلاق الشيفت قيد المراجعة'
            : active
              ? 'أنت على الشيفت'
              : 'الشيفت متوقف'}
        </Subheading>
        {isDemo ? (
          <Body>تشغيل الشيفت في المعاينة لا يشارك موقعًا حقيقيًا.</Body>
        ) : Platform.OS !== 'web' ? (
          <Body>يُشارك موقعك أثناء الشيفت، ويتوقف بعد موافقة الإدارة على طلب الإغلاق.</Body>
        ) : null}
        {profile?.shiftStartedAt ? (
          <Body>بدأ الشيفت: {new Date(profile.shiftStartedAt).toLocaleString('ar-EG')}</Body>
        ) : active ? (
          <Body>وقت بداية هذا الشيفت غير مسجل.</Body>
        ) : null}
        {activeBreak && profile?.breakUntil ? (
          <>
            <Notice tone={profile.breakStartedBy === 'courier' ? 'info' : 'warning'}>
              {profile.breakStartedBy === 'courier'
                ? 'بدأت هذا البريك بنفسك ويمكنك فكّه والرجوع للشغل.'
                : 'الإدارة أخرجتك لبريك؛ لا يمكنك فكّه بنفسك.'}
              {' '}ينتهي {new Date(profile.breakUntil).toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' })}.
            </Notice>
            <BreakCountdown until={profile.breakUntil} />
            {profile.breakStartedBy === 'courier' ? (
              <ActionButton
                disabled={breakBusy}
                loading={breakBusy}
                onPress={() => void endOwnBreak()}
                tone="secondary"
              >
                فك البريك والرجوع للشغل
              </ActionButton>
            ) : null}
          </>
        ) : null}
        {breakError ? <Notice tone="danger">{breakError}</Notice> : null}
        {profile?.shiftEndedAt ? (
          <Body>انتهى آخر شيفت: {new Date(profile.shiftEndedAt).toLocaleString('ar-EG')}</Body>
        ) : null}
        {closeRequested ? (
          <Notice tone="warning">
            طلب إغلاق الشيفت بانتظار موافقة الإدارة. سيظل حسابك على الشيفت وموقعك مشتركًا حتى الموافقة.
          </Notice>
        ) : (
          <ActionButton
            loading={busy}
            onPress={toggleShift}
            tone={active ? 'outline' : 'primary'}
          >
            {active ? 'طلب إغلاق الشيفت' : 'بدء الشيفت'}
          </ActionButton>
        )}
        {busy ? (
          <Body>
            {active ? 'جارٍ إرسال طلب إغلاق الشيفت...' : 'جارٍ طلب إذن الموقع وتأكيد أول تحديث لموقعك...'}
          </Body>
        ) : null}
        {shiftError ? <Notice tone="danger">{shiftError}</Notice> : null}
      </View>
      <View style={styles.metrics}>
        <Metric value={String(todayOrders.length)} label="طلبات تم توصيلها اليوم" />
        <Metric
          value={(todayCollected / 100).toLocaleString('ar-EG', { maximumFractionDigits: 2 })}
          label="رسوم التوصيل المحصلة اليوم · جنيه"
        />
      </View>
      <Section title="طلباتي">
        {myOrders.length === 0 ? (
          <Body>لا توجد طلبات مسندة إليك الآن.</Body>
        ) : (
          myOrders.slice(0, 5).map((order) => <RecentOrder key={order.id} order={order} />)
        )}
      </Section>
      <ActionButton onPress={() => router.push('/(tabs)/orders')} tone="secondary">
        فتح كل طلباتي
      </ActionButton>
      {deliveredOrders.length > 0 ? (
        <ActionButton onPress={() => router.push('/(tabs)/orders')} tone="outline">
          عرض الطلبات السابقة · {deliveredOrders.length}
        </ActionButton>
      ) : null}
    </Page>
  );
}

export default function HomeScreen() {
  const { profile } = useApp();
  if (profile?.role === 'admin') return <AdminHome />;
  if (profile?.role === 'restaurant') return <RestaurantHome />;
  return <CourierHome />;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  topLine: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm },
  topActions: { flexDirection: 'row-reverse', gap: 8 },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutButtonDisabled: { opacity: 0.6 },
  metrics: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.md,
    gap: spacing.sm,
  },
  metric: { flex: 1, alignItems: 'center', gap: 5 },
  metricValue: { color: colors.primaryDark, fontSize: 22, fontWeight: '800' },
  metricLabel: { color: colors.muted, fontSize: 12, textAlign: 'center', writingDirection: 'rtl' },
  actionText: { color: colors.primary, fontWeight: '700', fontSize: 13 },
  map: { height: 420, borderRadius: 16 },
  courierDetails: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: 16,
    backgroundColor: colors.surfaceRaised,
  },
  courierIdentity: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm },
  courierAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.surface },
  courierAvatarPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  courierAvatarInitial: { color: colors.primary, fontSize: 20, fontWeight: '800' },
  selectedOrder: { gap: spacing.xs, paddingTop: spacing.sm },
  orderHeading: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  orderRow: {
    minHeight: 65,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.outline,
  },
  orderMain: { flex: 1, gap: 4 },
  orderCode: { color: colors.text, fontSize: 15, fontWeight: '700', textAlign: 'right' },
  orderInfo: { color: colors.muted, fontSize: 13, textAlign: 'right', writingDirection: 'rtl' },
  locationRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  locationRowSelected: { backgroundColor: colors.surfaceRaised },
  shiftBanner: { padding: spacing.md, borderRadius: 18, gap: spacing.sm },
  shiftOn: { backgroundColor: colors.successSurface },
  shiftOff: { backgroundColor: colors.surfaceRaised },
});
