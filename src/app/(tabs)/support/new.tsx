import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { ActionButton, Body, Field, Heading, Notice, Section, Page } from '../../../components/ui';
import { Alert } from '../../../lib/platform-alert';
import { useApp } from '../../../state/app-context';
import { colors, spacing } from '../../../theme';

export default function NewSupportConversationScreen() {
  const { profile, orders, isDemo, createSupportConversation } = useApp();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [relatedOrderId, setRelatedOrderId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const availableOrders = orders
    .filter((order) =>
      profile?.role === 'restaurant'
        ? order.restaurantId === profile.restaurantId
        : order.courierId === profile?.courierId,
    )
    .slice(0, 8);

  const submit = async () => {
    setBusy(true);
    try {
      const conversationId = await createSupportConversation(subject, body, relatedOrderId);
      router.replace({
        pathname: '/(tabs)/support/[id]',
        params: { id: conversationId },
      });
    } catch (error) {
      Alert.alert('تعذر إرسال الرسالة', error instanceof Error ? error.message : 'حاول مرة أخرى.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page>
      <Heading>محادثة دعم جديدة</Heading>
      {isDemo && <Notice tone="warning">المحادثة ستظهر في معاينة هذا الجهاز فقط.</Notice>}
      <Body>اكتب عنوانًا واضحًا واشرح المشكلة. فريق الدعم سيرد داخل نفس المحادثة.</Body>
      <Field
        label="عنوان المشكلة"
        maxLength={120}
        onChangeText={setSubject}
        placeholder="مثال: تأخر تحديث حالة الطلب"
        value={subject}
      />
      <Field
        label="تفاصيل المشكلة"
        maxLength={4000}
        multiline
        onChangeText={setBody}
        placeholder="اكتب ما حدث وما المساعدة التي تحتاجها"
        value={body}
      />
      {availableOrders.length > 0 && (
        <Section title="ربط المحادثة بطلب (اختياري)">
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: !relatedOrderId }}
            onPress={() => setRelatedOrderId(undefined)}
            style={[styles.orderOption, !relatedOrderId && styles.orderSelected]}
          >
            <Text style={styles.orderLabel}>بدون طلب</Text>
          </Pressable>
          {availableOrders.map((order) => {
            const selected = relatedOrderId === order.id;
            return (
              <Pressable
                key={order.id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setRelatedOrderId(order.id)}
                style={[styles.orderOption, selected && styles.orderSelected]}
              >
                <Text style={styles.orderLabel}>{order.code} · {order.restaurantName}</Text>
                <Text style={styles.orderAddress} numberOfLines={1}>{order.customerAddress}</Text>
              </Pressable>
            );
          })}
        </Section>
      )}
      <ActionButton
        disabled={!subject.trim() || !body.trim()}
        loading={busy}
        onPress={submit}
      >
        إرسال لفريق الدعم
      </ActionButton>
      <ActionButton
        disabled={busy}
        onPress={() => router.back()}
        tone="outline"
      >
        رجوع
      </ActionButton>
    </Page>
  );
}

const styles = StyleSheet.create({
  orderOption: {
    minHeight: 52,
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.outline,
  },
  orderSelected: { backgroundColor: colors.surfaceRaised, borderRadius: 12 },
  orderLabel: { color: colors.text, fontSize: 14, fontWeight: '700', textAlign: 'right' },
  orderAddress: { color: colors.muted, fontSize: 12, textAlign: 'right' },
});
