import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Image, Pressable, StyleSheet, Text } from 'react-native';

import { ActionButton, Body, Heading, Notice, Page, Section } from '../../components/ui';
import { useApp } from '../../state/app-context';
import { colors, spacing } from '../../theme';

function formatTime(value?: string) {
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

function statusLabel(status: string) {
  if (status === 'in_transit') return 'المندوب في طريق العودة للمطعم';
  if (status === 'returned_by_courier') return 'بانتظار تأكيد المطعم';
  return 'تم تأكيد الاستلام وإغلاق العملية';
}

export default function ReturnOperationsScreen() {
  const { profile, orderReturns, orders, couriers, isDemo, refresh } = useApp();

  if (profile?.role !== 'admin') {
    return (
      <Page>
        <Heading>عمليات الإرجاع</Heading>
        <Notice tone="danger">هذه الصفحة متاحة للإدارة فقط.</Notice>
      </Page>
    );
  }

  return (
    <Page>
      <Heading>عمليات إرجاع الطلبات</Heading>
      <Body>تابع الطلبات التي رفض العملاء استلامها، وتأكد من رجوع كل طلب للمطعم وإغلاقه.</Body>
      {isDemo ? <Notice tone="warning">هذه بيانات تجريبية داخل هذا الجهاز فقط.</Notice> : null}
      <ActionButton
        onPress={() => {
          refresh().catch((error: unknown) =>
            console.error('تعذر تحديث عمليات الإرجاع:', error),
          );
        }}
        tone="outline"
      >
        تحديث عمليات الإرجاع
      </ActionButton>
      {orderReturns.length === 0 ? (
        <Notice>لا توجد عمليات إرجاع حتى الآن.</Notice>
      ) : (
        orderReturns.map((orderReturn) => {
          const order = orders.find((item) => item.id === orderReturn.orderId);
          const courier = couriers.find((item) => item.id === orderReturn.courierId);
          return (
            <Section
              key={orderReturn.id}
              title={order?.code ?? 'طلب مرتجع'}
              action={
                <MaterialCommunityIcons
                  name={orderReturn.status === 'closed' ? 'check-circle' : 'clock-outline'}
                  color={orderReturn.status === 'closed' ? colors.success : colors.warning}
                  size={22}
                />
              }
            >
              <Notice tone={orderReturn.status === 'closed' ? 'info' : 'warning'}>
                {statusLabel(orderReturn.status)}
              </Notice>
              <Body>المطعم: {order?.restaurantName ?? `مطعم رقم ${orderReturn.restaurantId}`}</Body>
              <Body>المندوب: {courier?.fullName ?? `مندوب رقم ${orderReturn.courierId}`}</Body>
              {order ? (
                <>
                  <Body>العميل: {order.customerName} · {order.customerPhone}</Body>
                  <Body>عنوان العميل: {order.customerAddress}</Body>
                  <Body>تفاصيل الطلب: {order.itemsText}</Body>
                </>
              ) : null}
              <Body>سبب الإرجاع: {orderReturn.reason}</Body>
              <Body>بدء رحلة الإرجاع: {formatTime(orderReturn.startedAt)}</Body>
              <Body>وصول الطلب للمطعم: {formatTime(orderReturn.returnedAt)}</Body>
              {orderReturn.courierReceivedRestaurantRefund != null ? (
                <Body>
                  {orderReturn.courierReceivedRestaurantRefund
                    ? 'استلم المندوب قيمة الطلب التي دفعها للمطعم.'
                    : 'لم يستلم المندوب قيمة الطلب من المطعم.'}
                </Body>
              ) : null}
              {orderReturn.photoUrl ? (
                <Image
                  accessibilityLabel={`صورة إرجاع الطلب ${order?.code ?? ''}`}
                  source={{ uri: orderReturn.photoUrl }}
                  style={styles.photo}
                  resizeMode="cover"
                />
              ) : (
                <Notice>لم يرفع المندوب صورة وصول الطلب للمطعم بعد.</Notice>
              )}
              {order ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push({ pathname: '/order-details/[id]', params: { id: order.id } })}
                  style={styles.detailsLink}
                >
                  <Text style={styles.detailsText}>فتح تفاصيل الطلب</Text>
                  <MaterialCommunityIcons name="chevron-left" color={colors.primary} size={20} />
                </Pressable>
              ) : null}
            </Section>
          );
        })
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  photo: {
    width: '100%',
    height: 220,
    borderRadius: 16,
    backgroundColor: colors.surfaceRaised,
  },
  detailsLink: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  detailsText: { color: colors.primary, fontSize: 14, fontWeight: '700' },
});
