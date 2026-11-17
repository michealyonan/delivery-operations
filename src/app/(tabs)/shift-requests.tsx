import { useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { ActionButton, Body, Heading, Notice, Page, Section } from '../../components/ui';
import { Alert } from '../../lib/platform-alert';
import { useApp } from '../../state/app-context';
import { colors, spacing } from '../../theme';
import type { Courier } from '../../types';

function formatRequestTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'وقت الطلب غير متاح';
  return date.toLocaleString('ar-EG', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ShiftRequestsScreen() {
  const {
    profile,
    couriers,
    orders,
    isDemo,
    refresh,
    approveCourierShiftClose,
    rejectCourierShiftClose,
  } = useApp();
  const [busyCourierId, setBusyCourierId] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const pendingRequests = couriers.filter((courier) => courier.shiftCloseRequestedAt);

  const runDecision = async (courier: Courier, approve: boolean) => {
    setErrorMessage('');
    setSuccessMessage('');
    setBusyCourierId(courier.id);
    try {
      if (approve) {
        await approveCourierShiftClose(courier.id);
        setSuccessMessage(`تمت الموافقة على إغلاق شيفت ${courier.fullName}.`);
      } else {
        await rejectCourierShiftClose(courier.id);
        setSuccessMessage(`تم رفض الطلب، وسيظل ${courier.fullName} على الشيفت.`);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'تعذر تحديث طلب إغلاق الشيفت.');
    } finally {
      setBusyCourierId(null);
    }
  };

  const confirmDecision = (courier: Courier, approve: boolean) => {
    const title = approve ? 'الموافقة على إغلاق الشيفت' : 'رفض طلب إغلاق الشيفت';
    const message = approve
      ? `سيتم إنهاء شيفت ${courier.fullName}. لا يمكن الموافقة إذا كان لديه طلب غير مكتمل.`
      : `سيظل ${courier.fullName} على الشيفت ويمكنه متابعة استقبال الطلبات.`;
    const perform = () => void runDecision(courier, approve);
    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n\n${message}`)) perform();
      return;
    }
    Alert.alert(title, message, [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: approve ? 'موافقة' : 'رفض الطلب',
        style: approve ? 'default' : 'destructive',
        onPress: perform,
      },
    ]);
  };

  const reload = async () => {
    setRefreshing(true);
    setErrorMessage('');
    try {
      await refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'تعذر تحديث طلبات الشيفت.');
    } finally {
      setRefreshing(false);
    }
  };

  if (profile?.role !== 'admin') {
    return (
      <Page>
        <Heading>طلبات إغلاق الشيفت</Heading>
        <Notice tone="danger">هذه الصفحة متاحة للإدارة فقط.</Notice>
      </Page>
    );
  }

  return (
    <Page>
      <Heading>طلبات إغلاق الشيفت</Heading>
      <Body>
        تظهر هنا طلبات المندوبين المعلقة. الموافقة تنهي الشيفت، والرفض يُبقي المندوب على الشيفت.
      </Body>
      {isDemo ? <Notice tone="warning">هذه بيانات تجريبية داخل هذا الجهاز فقط.</Notice> : null}
      <ActionButton disabled={refreshing} loading={refreshing} onPress={() => void reload()} tone="outline">
        تحديث الطلبات
      </ActionButton>
      {errorMessage ? <Notice tone="danger">{errorMessage}</Notice> : null}
      {successMessage ? <Notice>{successMessage}</Notice> : null}
      {pendingRequests.length === 0 ? (
        <Notice>لا توجد طلبات إغلاق شيفت معلقة.</Notice>
      ) : (
        <Section title={`طلبات معلقة (${pendingRequests.length})`}>
          {pendingRequests.map((courier) => {
            const activeOrder = orders.find(
              (order) =>
                order.courierId === courier.id &&
                ['assigned', 'accepted', 'picked_up'].includes(order.status),
            );
            return (
              <View key={courier.id} style={styles.request}>
                <Text style={styles.name}>{courier.fullName}</Text>
                <Text style={styles.detail}>رقم المندوب: {courier.code}</Text>
                <Text style={styles.detail}>
                  وقت الطلب: {formatRequestTime(courier.shiftCloseRequestedAt!)}
                </Text>
                {activeOrder ? (
                  <Notice tone="warning">
                    لدى المندوب طلب غير مكتمل ({activeOrder.code})؛ أكمله أو حوّله قبل الموافقة.
                  </Notice>
                ) : null}
                <View style={styles.actions}>
                  <ActionButton
                    disabled={busyCourierId !== null || activeOrder != null}
                    loading={busyCourierId === courier.id}
                    onPress={() => confirmDecision(courier, true)}
                    tone="secondary"
                  >
                    الموافقة وإنهاء الشيفت
                  </ActionButton>
                  <ActionButton
                    disabled={busyCourierId !== null}
                    onPress={() => confirmDecision(courier, false)}
                    tone="danger"
                  >
                    رفض الطلب وإبقاؤه على الشيفت
                  </ActionButton>
                </View>
              </View>
            );
          })}
        </Section>
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  request: {
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.outline,
  },
  name: { color: colors.text, fontSize: 16, fontWeight: '700', textAlign: 'right' },
  detail: { color: colors.muted, fontSize: 13, textAlign: 'right', writingDirection: 'rtl' },
  actions: { gap: spacing.sm },
});
