import { useEffect, useState } from 'react';
import { router } from 'expo-router';

import { ActionButton, Body, Field, Heading, Notice, Page, Subheading } from '../components/ui';
import { isBackendConfigured, supabase } from '../lib/supabase';

export default function ResetPasswordScreen() {
  const [sessionReady, setSessionReady] = useState(!supabase || !isBackendConfigured);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    if (!supabase || !isBackendConfigured) {
      return;
    }

    let active = true;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active && session) {
        setHasSession(true);
        setSessionReady(true);
      }
    });

    supabase.auth.getSession().then(({ data: sessionData, error }) => {
      if (!active) return;
      if (error) {
        setErrorMessage('تعذر التحقق من رابط الاستعادة. اطلب رابطًا جديدًا.');
      } else {
        setHasSession(Boolean(sessionData.session));
      }
      setSessionReady(true);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const updatePassword = async () => {
    if (password.length < 8) {
      setErrorMessage('كلمة المرور يجب ألا تقل عن 8 أحرف.');
      return;
    }
    if (password !== confirmation) {
      setErrorMessage('كلمتا المرور غير متطابقتين.');
      return;
    }
    if (!supabase) {
      setErrorMessage('تعذر الاتصال بالخادم. حاول مرة أخرى لاحقًا.');
      return;
    }

    setErrorMessage('');
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      await supabase.auth.signOut();
      setCompleted(true);
      setHasSession(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'تعذر تحديث كلمة المرور.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page>
      <Heading>إدارة التوصيل</Heading>
      <Subheading>استعادة كلمة المرور</Subheading>
      {!sessionReady ? <Body>جارٍ التحقق من رابط الاستعادة...</Body> : null}
      {sessionReady && !hasSession && !completed ? (
        <Notice tone="danger">
          رابط الاستعادة غير صالح أو انتهت صلاحيته. ارجع إلى صفحة الدخول واطلب رابطًا جديدًا.
        </Notice>
      ) : null}
      {completed ? (
        <>
          <Notice>تم تحديث كلمة المرور. يمكنك الآن تسجيل الدخول بها.</Notice>
          <ActionButton onPress={() => router.replace('/login')}>العودة إلى تسجيل الدخول</ActionButton>
        </>
      ) : null}
      {sessionReady && hasSession ? (
        <>
          <Body>اختر كلمة مرور جديدة لحسابك.</Body>
          <Field
            autoCapitalize="none"
            label="كلمة المرور الجديدة"
            onChangeText={setPassword}
            secureTextEntry
            value={password}
          />
          <Field
            autoCapitalize="none"
            label="تأكيد كلمة المرور"
            onChangeText={setConfirmation}
            secureTextEntry
            value={confirmation}
          />
          {errorMessage ? <Notice tone="danger">{errorMessage}</Notice> : null}
          <ActionButton loading={busy} onPress={updatePassword}>
            حفظ كلمة المرور
          </ActionButton>
        </>
      ) : null}
      {sessionReady && !hasSession && !completed ? (
        <ActionButton onPress={() => router.replace('/login')} tone="outline">
          العودة إلى تسجيل الدخول
        </ActionButton>
      ) : null}
    </Page>
  );
}
