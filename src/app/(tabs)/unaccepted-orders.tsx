import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { Body, Heading, Notice, Page, Section } from '../../components/ui';
import { useApp } from '../../state/app-context';
import { colors, spacing } from '../../theme';

function formatTime(value: string) {
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

export default function UnacceptedOrdersScreen() {
  const { profile, orderAssignmentAttempts, orders, couriers } = useApp();

  if (profile?.role !== 'admin' && profile?.role !== 'courier') {
    return (
      <Page>
        <Heading>الطلبات التي لم تُقبل</Heading>
        <Notice tone="danger">هذه الصفحة متاحة للإدارة والمناديب فقط.</Notice>
      </Page>
    );
  }

  const attempts = orderAssignmentAttempts.filter(
    (attempt) =>
      (attempt.status === 'awaiting' || attempt.status === 'not_accepted') &&
      (profile.role === 'admin' || attempt.courierId === profile.courierId),
  );

  return (
    <Page>
      <Heading>
        {profile.role === 'admin' ? 'الطلبات التي لم يقبلها المندوبون' : 'الطلبات التي لم أقبلها'}
      </Heading>
      <Body>
        تظهر الطلبات المسندة التي تنتظر قبول المندوب، والطلبات التي انتهت مهلة قبولها. يحتفظ السجل
        بكل محاولة حتى بعد إعادة إسناد الطلب.
      </Body>
      {attempts.length === 0 ? (
        <Notice>لا توجد طلبات غير مقبولة.</Notice>
      ) : (
        attempts.map((attempt) => {
          const order = orders.find((item) => item.id === attempt.orderId);
          const courier = couriers.find((item) => item.id === attempt.courierId);
          const awaiting = attempt.status === 'awaiting';
          return (
            <Section
              key={attempt.id}
              title={order?.code ?? attempt.orderCode}
              action={
                <MaterialCommunityIcons
                  name={awaiting ? 'clock-outline' : 'alert-circle-outline'}
                  color={awaiting ? colors.warning : colors.danger}
                  size={22}
                />
              }
            >
              <Notice tone={awaiting ? 'warning' : 'danger'}>
                {awaiting
                  ? profile.role === 'admin'
                    ? 'بانتظار قبول المندوب للطلب'
                    : 'الطلب بانتظار قبولك'
                  : 'لم يقبل المندوب الطلب خلال مهلة القبول'}
              </Notice>
              {profile.role === 'admin' ? (
                <Body>
                  المندوب: {courier?.fullName ?? `مندوب رقم ${attempt.courierId}`}
                  {courier ? ` · ${courier.code}` : ''}
                </Body>
              ) : null}
              <Body>وقت الإسناد: {formatTime(attempt.assignedAt)}</Body>
              {attempt.resolvedAt ? <Body>انتهت المحاولة: {formatTime(attempt.resolvedAt)}</Body> : null}
              {order ? (
                <>
                  <Body>المطعم: {order.restaurantName}</Body>
                  <Body>عنوان العميل: {order.customerAddress}</Body>
                  <Body>تفاصيل الطلب: {order.itemsText}</Body>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() =>
                      router.push({
                        pathname: '/(tabs)/order-detail',
                        params: { id: String(order.id) },
                      })
                    }
                    style={styles.detailsLink}
                  >
                    <Text style={styles.detailsText}>فتح تفاصيل الطلب</Text>
                    <MaterialCommunityIcons name="chevron-left" color={colors.primary} size={20} />
                  </Pressable>
                </>
              ) : (
                <Body>رقم الطلب: {attempt.orderCode}</Body>
              )}
            </Section>
          );
        })
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  detailsLink: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  detailsText: { color: colors.primary, fontSize: 14, fontWeight: '700' },
});
