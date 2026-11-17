import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { ActionButton, Body, Field, Heading, Notice, Page, Section } from '../../../components/ui';
import { useApp } from '../../../state/app-context';
import { colors, spacing } from '../../../theme';
import type { SupportAgent, TemporaryCredentials } from '../../../types';

export default function SupportStaffScreen() {
  const { profile, isDemo, listSupportAgents, createSupportAgent } = useApp();
  const [agents, setAgents] = useState<SupportAgent[]>([]);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [credentials, setCredentials] = useState<TemporaryCredentials | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setAgents(await listSupportAgents());
    } catch (error) {
      Alert.alert('تعذر تحميل موظفي الدعم', error instanceof Error ? error.message : 'حاول مرة أخرى.');
    }
  }, [listSupportAgents]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const submit = async () => {
    setBusy(true);
    try {
      const created = await createSupportAgent({ fullName, email, phone });
      setCredentials(created);
      setFullName('');
      setEmail('');
      setPhone('');
      await load();
    } catch (error) {
      Alert.alert('تعذر إنشاء حساب الدعم', error instanceof Error ? error.message : 'حاول مرة أخرى.');
    } finally {
      setBusy(false);
    }
  };

  if (profile?.role !== 'admin') {
    return (
      <Page>
        <Heading>غير مسموح</Heading>
        <Notice tone="danger">إدارة حسابات موظفي الدعم متاحة للإدارة فقط.</Notice>
        <ActionButton onPress={() => router.back()} tone="outline">رجوع</ActionButton>
      </Page>
    );
  }

  return (
    <Page>
      <Heading>فريق الدعم الفني</Heading>
      <Body>الإدارة فقط تنشئ حسابات موظفي الدعم. أرسل بيانات الدخول المؤقتة لهم بقناة آمنة.</Body>
      {isDemo && (
        <Notice tone="warning">
          قائمة تجريبية فقط؛ لا تنشئ هذه الشاشة حسابات حقيقية في وضع المعاينة.
        </Notice>
      )}
      {credentials && (
        <Section title="بيانات الدخول المؤقتة">
          <Notice tone="warning">احفظ كلمة المرور وأرسلها للموظف بأمان؛ لن تظهر مرة أخرى.</Notice>
          <Text selectable style={styles.credential}>رقم الدعم: {credentials.code}</Text>
          <Text selectable style={styles.credential}>البريد: {credentials.email}</Text>
          <Text selectable style={styles.password}>كلمة المرور: {credentials.temporaryPassword}</Text>
          <ActionButton onPress={() => setCredentials(null)} tone="outline">
            إخفاء بيانات الدخول
          </ActionButton>
        </Section>
      )}
      <Section title="إضافة موظف دعم">
        <Field
          autoComplete="name"
          label="اسم الموظف"
          onChangeText={setFullName}
          value={fullName}
        />
        <Field
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          label="البريد الإلكتروني لتسجيل الدخول"
          onChangeText={setEmail}
          value={email}
        />
        <Field
          autoComplete="tel"
          keyboardType="phone-pad"
          label="رقم الهاتف"
          onChangeText={setPhone}
          value={phone}
        />
        <ActionButton
          disabled={!fullName.trim() || !email.trim() || !phone.trim()}
          loading={busy}
          onPress={submit}
        >
          إنشاء حساب موظف الدعم
        </ActionButton>
      </Section>
      <Section title="الحسابات الحالية">
        {agents.length === 0 ? (
          <Body>لم تتم إضافة موظفي دعم بعد.</Body>
        ) : (
          agents.map((agent) => (
            <View key={agent.id} style={styles.agent}>
              <Text style={styles.agentName}>{agent.name}</Text>
              <Text style={styles.agentEmail}>{agent.email}</Text>
            </View>
          ))
        )}
      </Section>
      <ActionButton onPress={() => router.back()} tone="outline">العودة إلى صندوق الدعم</ActionButton>
    </Page>
  );
}

const styles = StyleSheet.create({
  agent: {
    gap: 5,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.outline,
  },
  agentName: { color: colors.text, fontSize: 15, fontWeight: '700', textAlign: 'right' },
  agentEmail: { color: colors.muted, fontSize: 13, textAlign: 'right' },
  credential: { color: colors.text, fontSize: 14, lineHeight: 22, textAlign: 'right' },
  password: {
    color: colors.primaryDark,
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'right',
    writingDirection: 'ltr',
  },
});
