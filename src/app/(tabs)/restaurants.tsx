import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { AdminAccountActions } from '../../components/admin-account-actions';
import { ActionButton, Body, Field, Heading, Notice, Page, Section, SegmentedSwitch } from '../../components/ui';
import { isBackendConfigured } from '../../lib/supabase';
import { useApp } from '../../state/app-context';
import { colors, spacing } from '../../theme';
import type { TemporaryCredentials } from '../../types';

export default function RestaurantsScreen() {
  const {
    restaurants,
    createRestaurant,
    isDemo,
    refresh,
    setRestaurantAcceptingOrders,
  } = useApp();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [credentials, setCredentials] = useState<TemporaryCredentials | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyRestaurantId, setBusyRestaurantId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [activeSection, setActiveSection] = useState<'accounts' | 'create'>('accounts');

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
      setActiveSection('create');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'تعذر إنشاء حساب المطعم. حاول مرة أخرى.');
    } finally {
      setBusy(false);
    }
  };

  const toggleOrderAcceptance = async (restaurantId: number, acceptsOrders: boolean) => {
    setBusyRestaurantId(restaurantId);
    try {
      await setRestaurantAcceptingOrders(restaurantId, acceptsOrders);
    } catch (error) {
      Alert.alert(
        'تعذر تحديث استقبال الطلبات',
        error instanceof Error ? error.message : 'حاول مرة أخرى.',
      );
    } finally {
      setBusyRestaurantId(null);
    }
  };

  return (
    <Page>
      <Heading>حسابات المطاعم</Heading>
      <SegmentedSwitch
        items={[
          { key: 'accounts', label: 'المطاعم المسجلة' },
          { key: 'create', label: 'إضافة مطعم' },
        ]}
        onSelect={(key) => setActiveSection(key === 'create' ? 'create' : 'accounts')}
        selected={activeSection}
      />
      {activeSection === 'create' ? (
        <Section title="إنشاء حساب مطعم">
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
            </>
          )}
        </Section>
      ) : (
      <Section title="المطاعم المسجلة">
        <Notice tone="info">
          تُحدد الإدارة رسوم التوصيل لكل طلب على حدة حسب موقع العميل والمسافة؛ لا توجد رسوم ثابتة للمطعم.
        </Notice>
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
            <Text style={styles.detail}>{restaurant.email}</Text>
            <Text style={styles.detail}>{restaurant.phone} · {restaurant.address}</Text>
            <Text style={[styles.detail, !restaurant.acceptsOrders && styles.paused]}>
              {restaurant.acceptsOrders ? 'يستقبل طلبات جديدة' : 'متوقف عن استقبال الطلبات'}
            </Text>
            {!isDemo && isBackendConfigured ? (
              <>
                <ActionButton
                  disabled={busyRestaurantId !== null}
                  loading={busyRestaurantId === restaurant.id}
                  onPress={() =>
                    void toggleOrderAcceptance(restaurant.id, !restaurant.acceptsOrders)
                  }
                  tone={restaurant.acceptsOrders ? 'danger' : 'secondary'}
                >
                  {restaurant.acceptsOrders
                    ? 'إيقاف استقبال الطلبات'
                    : 'إعادة استقبال الطلبات'}
                </ActionButton>
                <AdminAccountActions accountType="restaurant" accountId={restaurant.id} />
              </>
            ) : null}
          </View>
        ))}
      </Section>
      )}
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
  paused: { color: colors.danger, fontWeight: '700' },
});
