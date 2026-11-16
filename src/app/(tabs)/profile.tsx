import { router } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { ActionButton, Body, Heading, Notice, Page, Section } from '../../components/ui';
import { useApp } from '../../state/app-context';

export default function ProfileScreen() {
  const { profile, isDemo, signOut } = useApp();
  const [busy, setBusy] = useState(false);

  const leave = async () => {
    setBusy(true);
    try {
      await signOut();
      router.replace('/login');
    } catch (error) {
      Alert.alert('تعذر تسجيل الخروج', error instanceof Error ? error.message : 'حاول مرة أخرى.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page>
      <Heading>حسابي</Heading>
      <Section title="بيانات الحساب">
        <Body>{profile?.name}</Body>
        <Body>الدور: {profile?.role === 'admin' ? 'إدارة' : profile?.role === 'restaurant' ? 'مطعم' : 'مندوب'}</Body>
        {profile?.email ? <Body>{profile.email}</Body> : null}
        {profile?.phone ? <Body>{profile.phone}</Body> : null}
        {profile?.courierCode ? <Body>رقم المندوب: {profile.courierCode}</Body> : null}
      </Section>
      {isDemo && <Notice tone="warning">هذا حساب معاينة تجريبي ولا يحفظ البيانات على الخادم.</Notice>}
      <ActionButton loading={busy} onPress={leave} tone="outline">تسجيل الخروج</ActionButton>
    </Page>
  );
}
