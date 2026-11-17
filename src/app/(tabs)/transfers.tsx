import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { ActionButton, Body, Heading, Notice, Page, Section } from '../../components/ui';
import { Alert } from '../../lib/platform-alert';
import { orderTransferReasonLabels } from '../../lib/order-transfer';
import { useApp } from '../../state/app-context';
import { colors, spacing } from '../../theme';
import type { OrderTransferRequest } from '../../types';

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'غير متاح';
  return date.toLocaleString('ar-EG');
}

function statusLabel(status: OrderTransferRequest['status']) {
  if (status === 'approved') return 'تمت الموافقة والتحويل';
  if (status === 'rejected') return 'مرفوض';
  return 'بانتظار القرار';
}

export default function TransfersScreen() {
  const { profile, isDemo, orders, orderTransferRequests, decideOrderTransfer } = useApp();
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const pendingRequests = orderTransferRequests.filter((request) => request.status === 'pending');
  const historyRequests = orderTransferRequests.filter((request) => request.status !== 'pending');

  const decide = async (request: OrderTransferRequest, approve: boolean) => {
    setBusyRequestId(request.id);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      await decideOrderTransfer(request.id, approve);
      setSuccessMessage(
        approve
          ? `تمت الموافقة على تحويل الطلب ${orders.find((order) => order.id === request.orderId)?.code ?? ''} إلى أقرب مندوب متاح.`
          : `تم رفض طلب تحويل الطلب ${orders.find((order) => order.id === request.orderId)?.code ?? ''}؛ سيظل مع المندوب الحالي.`,
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'تعذر تحديث طلب التحويل.');
    } finally {
      setBusyRequestId(null);
    }
  };

  const confirmDecision = (request: OrderTransferRequest, approve: boolean) => {
    const orderCode = orders.find((order) => order.id === request.orderId)?.code ?? 'الطلب';
    const title = approve ? 'الموافقة على التحويل' : 'رفض التحويل';
    const message = approve
      ? `سيُسند ${orderCode} لأقرب مندوب متاح. ${request.requiresHandoff ? 'يجب تسليم الطلب يدويًا من المندوب الحالي إلى الجديد.' : ''}`
      : `سيظل ${orderCode} مع المندوب الحالي.`;
    const perform = () => void decide(request, approve);
    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n\n${message}`)) perform();
      return;
    }
    Alert.alert(title, message, [
      { text: 'رجوع', style: 'cancel' },
      {
        text: approve ? 'موافقة وتحويل' : 'رفض الطلب',
        style: approve ? 'default' : 'destructive',
        onPress: perform,
      },
    ]);
  };

  if (!profile || !['admin', 'support'].includes(profile.role)) {
    return (
      <Page>
        <Heading>التحويلات</Heading>
        <Notice tone="danger">مراجعة التحويلات متاحة للإدارة والدعم فقط.</Notice>
      </Page>
    );
  }

  return (
    <Page>
      <Heading>التحويلات</Heading>
      <Body>راجع سبب الطلب؛ عند الموافقة يُسند الطلب تلقائيًا لأقرب مندوب متاح.</Body>
      {isDemo ? <Notice tone="warning">التحويلات في وضع المعاينة بيانات توضيحية على هذا الجهاز.</Notice> : null}
      {errorMessage ? <Notice tone="danger">{errorMessage}</Notice> : null}
      {successMessage ? <Notice>{successMessage}</Notice> : null}

      <Section title={`طلبات بانتظار القرار (${pendingRequests.length})`}>
        {pendingRequests.length === 0 ? (
          <Notice>لا توجد طلبات تحويل معلقة.</Notice>
        ) : (
          pendingRequests.map((request) => {
            const order = orders.find((item) => item.id === request.orderId);
            return (
              <View key={request.id} style={styles.request}>
                <Text style={styles.orderCode}>{order?.code ?? 'طلب غير متاح'}</Text>
                <Body>المطعم: {order?.restaurantName ?? 'غير متاح'}</Body>
                <Body>المندوب الحالي: {request.fromCourierName} · {request.fromCourierCode}</Body>
                <Body>سبب التحويل: {orderTransferReasonLabels[request.reason]}</Body>
                {request.reasonDetails ? <Body>تفاصيل: {request.reasonDetails}</Body> : null}
                <Body>وقت الطلب: {formatDate(request.requestedAt)}</Body>
                {order?.status === 'picked_up' ? (
                  <Notice tone="warning">الطلب مع المندوب؛ يلزم تسليمه يدويًا للمندوب البديل بعد الموافقة.</Notice>
                ) : null}
                <View style={styles.actions}>
                  <ActionButton
                    disabled={busyRequestId !== null}
                    loading={busyRequestId === request.id}
                    onPress={() => confirmDecision(request, true)}
                    tone="secondary"
                  >
                    موافقة وتحويل لأقرب مندوب
                  </ActionButton>
                  <ActionButton
                    disabled={busyRequestId !== null}
                    onPress={() => confirmDecision(request, false)}
                    tone="danger"
                  >
                    رفض الطلب وإبقاؤه مع المندوب
                  </ActionButton>
                  {order ? (
                    <ActionButton
                      onPress={() => router.push({ pathname: '/order-details/[id]', params: { id: order.id } })}
                      tone="outline"
                    >
                      فتح تفاصيل الطلب
                    </ActionButton>
                  ) : null}
                </View>
              </View>
            );
          })
        )}
      </Section>

      <Section title={`سجل التحويلات (${historyRequests.length})`}>
        {historyRequests.length === 0 ? (
          <Notice>لا توجد عمليات تحويل سابقة.</Notice>
        ) : (
          historyRequests.map((request) => {
            const order = orders.find((item) => item.id === request.orderId);
            return (
              <View key={request.id} style={styles.historyRow}>
                <View style={styles.historyHeader}>
                  <Text style={styles.orderCode}>{order?.code ?? 'طلب غير متاح'}</Text>
                  <Text
                    style={[
                      styles.status,
                      request.status === 'approved' ? styles.approved : styles.rejected,
                    ]}
                  >
                    {statusLabel(request.status)}
                  </Text>
                </View>
                <Body>المطعم: {order?.restaurantName ?? 'غير متاح'}</Body>
                <Body>من: {request.fromCourierName} · {request.fromCourierCode}</Body>
                {request.toCourierName ? (
                  <Body>إلى: {request.toCourierName} · {request.toCourierCode}</Body>
                ) : null}
                <Body>السبب: {orderTransferReasonLabels[request.reason]}</Body>
                {request.reasonDetails ? <Body>تفاصيل: {request.reasonDetails}</Body> : null}
                <Body>تاريخ الطلب: {formatDate(request.requestedAt)}</Body>
                {request.resolvedAt ? <Body>تاريخ القرار: {formatDate(request.resolvedAt)}</Body> : null}
              </View>
            );
          })
        )}
      </Section>
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
  orderCode: { color: colors.primaryDark, fontSize: 16, fontWeight: '800', textAlign: 'right' },
  actions: { gap: spacing.sm, marginTop: spacing.xs },
  historyRow: {
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.outline,
  },
  historyHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  status: { fontSize: 13, fontWeight: '700' },
  approved: { color: colors.success },
  rejected: { color: colors.danger },
});
