import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { ActionButton, Body, Field, Heading, Notice, Page, Subheading } from '../components/ui';
import { isBackendConfigured, supabase } from '../lib/supabase';
import { useApp } from '../state/app-context';
import { colors } from '../theme';

export default function LoginScreen() {
  const { signIn } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  const submit = async () => {
    if (!email.trim() || !password) {
      setErrorMessage('اكتب البريد الإلكتروني وكلمة المرور.');
      setStatusMessage('');
      return;
    }
    setErrorMessage('');
    setStatusMessage('');
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

  const sendPasswordReset = async () => {
    if (!email.trim()) {
      setErrorMessage('اكتب البريد الإلكتروني أولًا لإرسال رابط استعادة كلمة المرور.');
      setStatusMessage('');
      return;
    }
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      setErrorMessage('لاستعادة كلمة المرور، افتح صفحة الدخول من الموقع الإلكتروني.');
      setStatusMessage('');
      return;
    }

    setErrorMessage('');
    setStatusMessage('');
    setResetBusy(true);
    try {
      if (!isBackendConfigured) {
        throw new Error('يلزم الاتصال بالخادم لإرسال رابط استعادة كلمة المرور.');
      }
      const redirectUrl = new URL(window.location.href);
      redirectUrl.pathname = redirectUrl.pathname.replace(/\/login\/?$/, '/reset-password');
      redirectUrl.search = '';
      redirectUrl.hash = '';
      if (!supabase) throw new Error('تعذر الاتصال بالخادم.');
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: redirectUrl.toString(),
      });
      if (error) {
        if (/redirect.*(not allowed|invalid|url)/i.test(error.message)) {
          setErrorMessage(
            `اسمح بهذا الرابط في Supabase من Authentication > URL Configuration > Redirect URLs: ${redirectUrl.toString()}`,
          );
          return;
        }
        throw error;
      }
      setStatusMessage(
        'إذا كان البريد مسجلًا، سيصلك رابط استعادة كلمة المرور. افحص البريد الوارد والرسائل غير المرغوب فيها.',
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'تعذر إرسال رابط الاستعادة.');
    } finally {
      setResetBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.keyboard}
    >
      <Page width="narrow">
        <View style={styles.loginCard}>
          <View style={styles.brandHeader}>
            <View style={styles.brandMark}>
              <Text style={styles.markText}>د</Text>
            </View>
            <View style={styles.brandCopy}>
              <Heading>دليفرى</Heading>
              <Body>إدارة الطلبات والمندوبين والمطاعم</Body>
            </View>
          </View>

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
          {statusMessage ? <Notice>{statusMessage}</Notice> : null}
          <ActionButton loading={busy} onPress={submit}>
            دخول
          </ActionButton>
          {Platform.OS === 'web' ? (
            <ActionButton loading={resetBusy} onPress={sendPasswordReset} tone="outline">
              نسيت كلمة المرور؟
            </ActionButton>
          ) : null}
        </View>
      </Page>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboard: { flex: 1 },
  loginCard: {
    gap: 20,
    padding: 24,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outline,
    backgroundColor: colors.surface,
  },
  brandHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 16,
  },
  brandCopy: {
    flex: 1,
    gap: 6,
  },
  brandMark: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markText: { color: colors.white, fontSize: 34, fontWeight: '800' },
});
