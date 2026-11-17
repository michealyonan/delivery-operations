import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { ActionButton, Body, Field, Heading, Notice, Page, Section } from '../../components/ui';
import { isBackendConfigured } from '../../lib/supabase';
import { useApp } from '../../state/app-context';
import { colors, spacing } from '../../theme';
import type { TemporaryCredentials } from '../../types';

export default function RestaurantsScreen() {
  const { restaurants, createRestaurant, isDemo, refresh } = useApp();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [credentials, setCredentials] = useState<TemporaryCredentials | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const submit = async () => {
    setErrorMessage('');
    if (!name.trim() || !email.trim() || !phone.trim() || !address.trim()) {
      setErrorMessage('أدخل اسم المطعم والبريد ورقم التليفون والعنوان.');
      return;
    }
    setBusy(true);
    try {
      const created = await createRestaurant({ name, email, phone, address });
      setCredentials(created);
      setName('');
      setEmail('');
      setPhone('');
      setAddress('');
      setErrorMessage('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'تعذر إنشاء حساب المطعم. حاول مرة أخرى.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page>
      <Heading>حسابات المطاعم</Heading>
      {isDemo || !isBackendConfigured ? (
        <Notice tone="warning">المعاينة لا تنشئ حسابات حقيقية ولا تحفظ بيانات المطاعم.</Notice>
      ) : (
        <>
          {credentials && (
            <Notice tone="warning">
              احتفظ بكلمة المرور المؤقتة وأرسلها للمطعم بقناة آمنة؛ لن تظهر مرة أخرى.
              {'\n'}رقم المطعم: {credentials.code}
              {'\n'}البريد: {credentials.email}
              {'\n'}كلمة المرور المؤقتة: {credentials.temporaryPassword}
            </Notice>
          )}
          <Section title="إضافة حساب مطعم">
            <Field label="اسم المطعم" onChangeText={setName} value={name} />
            <Field
              autoCapitalize="none"
              keyboardType="email-address"
              label="البريد الإلكتروني لتسجيل الدخول"
              onChangeText={setEmail}
              value={email}
            />
            <Field keyboardType="phone-pad" label="رقم التليفون" onChangeText={setPhone} value={phone} />
            <Field label="عنوان المطعم" multiline onChangeText={setAddress} value={address} />
            <Body>بعد الدخول من داخل المطعم، يمكن حفظ موقعه الحالي ليظهر للمندوب.</Body>
            {errorMessage ? <Notice tone="danger">{errorMessage}</Notice> : null}
            <ActionButton loading={busy} onPress={submit}>إنشاء حساب المطعم</ActionButton>
          </Section>
        </>
      )}
      <Section title="المطاعم المسجلة">
        <ActionButton
          onPress={() => {
            refresh().catch((error: unknown) =>
              Alert.alert('تعذر تحديث القائمة', error instanceof Error ? error.message : 'حاول مرة أخرى.'),
            );
          }}
          tone="outline"
        >
          تحديث القائمة
        </ActionButton>
        {restaurants.map((restaurant) => (
          <View key={restaurant.id} style={styles.row}>
            <Text style={styles.code}>{restaurant.code}</Text>
            <Text style={styles.name}>{restaurant.name}</Text>
            <Text style={styles.detail}>{restaurant.phone} · {restaurant.address}</Text>
          </View>
        ))}
      </Section>
    </Page>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.outline,
    gap: 4,
  },
  code: { color: colors.primary, fontSize: 13, fontWeight: '800', textAlign: 'right' },
  name: { color: colors.text, fontSize: 16, fontWeight: '700', textAlign: 'right' },
  detail: { color: colors.muted, fontSize: 13, textAlign: 'right', writingDirection: 'rtl' },
});
