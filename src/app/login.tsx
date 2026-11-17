import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { ActionButton, Body, Field, Heading, Notice, Page, Subheading } from '../components/ui';
import { isBackendConfigured } from '../lib/supabase';
import { useApp } from '../state/app-context';
import type { UserRole } from '../types';
import { colors, spacing } from '../theme';

const demoRoles: { role: UserRole; label: string }[] = [
  { role: 'admin', label: 'الإدارة' },
  { role: 'restaurant', label: 'مطعم تجريبي' },
  { role: 'courier', label: 'مندوب تجريبي' },
  { role: 'support', label: 'موظف دعم تجريبي' },
];

export default function LoginScreen() {
  const { signIn, signInDemo } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password) {
      Alert.alert('بيانات ناقصة', 'اكتب البريد الإلكتروني وكلمة المرور.');
      return;
    }
    setBusy(true);
    try {
      const role = await signIn(email.trim(), password);
      router.replace(role === 'support' ? '/(tabs)/support' : '/(tabs)');
    } catch (error) {
      Alert.alert('تعذر تسجيل الدخول', error instanceof Error ? error.message : 'حاول مرة أخرى.');
    } finally {
      setBusy(false);
    }
  };

  const openDemo = (role: UserRole) => {
    signInDemo(role);
    router.replace(role === 'support' ? '/(tabs)/support' : '/(tabs)');
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.keyboard}
    >
      <Page>
        <View style={styles.brandMark}>
          <Text style={styles.markText}>د</Text>
        </View>
        <Heading>إدارة التوصيل</Heading>
        <Body>طلبات المطاعم، حركة المندوبين، وحسابات واضحة لكل طلب.</Body>

        {!isBackendConfigured && (
          <Notice tone="warning">
            وضع المعاينة فقط: البيانات المعروضة تجريبية ولا تنتقل بين الأجهزة. لا تدخل بيانات
            مندوبين حقيقية قبل إعداد قاعدة البيانات والتخزين الخاص.
          </Notice>
        )}

        <Subheading>تسجيل الدخول</Subheading>
        <Field
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          label="البريد الإلكتروني"
          onChangeText={setEmail}
          value={email}
        />
        <Field
          autoCapitalize="none"
          label="كلمة المرور"
          onChangeText={setPassword}
          secureTextEntry
          value={password}
        />
        <ActionButton loading={busy} onPress={submit}>
          دخول
        </ActionButton>

        <View style={styles.demoSection}>
          <Subheading>معاينة الواجهات</Subheading>
          <Body>حسابات افتراضية ببيانات غير حقيقية، لا تحتاج اتصالًا بالخادم.</Body>
          {demoRoles.map((item) => (
            <ActionButton key={item.role} onPress={() => openDemo(item.role)} tone="outline">
              الدخول كـ {item.label}
            </ActionButton>
          ))}
        </View>
      </Page>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboard: { flex: 1 },
  brandMark: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markText: { color: colors.white, fontSize: 32, fontWeight: '800' },
  demoSection: { gap: spacing.sm, marginTop: spacing.md },
});
