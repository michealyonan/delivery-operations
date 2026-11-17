import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { ActionButton, Body, Field, Heading, Notice, Page, Subheading } from '../components/ui';
import { isBackendConfigured } from '../lib/supabase';
import { useApp } from '../state/app-context';
import { colors } from '../theme';

export default function LoginScreen() {
  const { signIn } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const submit = async () => {
    if (!email.trim() || !password) {
      setErrorMessage('اكتب البريد الإلكتروني وكلمة المرور.');
      return;
    }
    setErrorMessage('');
    setBusy(true);
    try {
      const role = await signIn(email.trim(), password);
      router.replace(role === 'support' ? '/(tabs)/support' : '/(tabs)');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'حاول مرة أخرى.';
      setErrorMessage(
        /invalid login credentials/i.test(message)
          ? 'البريد الإلكتروني أو كلمة المرور غير صحيحة.'
          : /email not confirmed/i.test(message)
            ? 'البريد الإلكتروني غير مفعّل. تواصل مع الإدارة.'
            : message,
      );
    } finally {
      setBusy(false);
    }
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
        {errorMessage ? <Notice tone="danger">{errorMessage}</Notice> : null}
        <ActionButton loading={busy} onPress={submit}>
          دخول
        </ActionButton>
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
});
