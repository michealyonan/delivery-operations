import { router } from 'expo-router';
import type { ImagePickerAsset } from 'expo-image-picker';
import { useState } from 'react';
import { Alert, Image, StyleSheet, Text, View } from 'react-native';

import { ActionButton, Body, Field, Heading, Notice, Page, Section } from '../../components/ui';
import { isBackendConfigured } from '../../lib/supabase';
import { useApp, toImagePickerInput } from '../../state/app-context';
import { colors, spacing } from '../../theme';
import type { TemporaryCredentials } from '../../types';

export default function CouriersScreen() {
  const { couriers, createCourier, isDemo, refresh } = useApp();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [address, setAddress] = useState('');
  const [card, setCard] = useState<ImagePickerAsset | null>(null);
  const [credentials, setCredentials] = useState<TemporaryCredentials | null>(null);
  const [busy, setBusy] = useState(false);

  const pickIdCard = async () => {
    const ImagePicker = await import('expo-image-picker');
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.72,
      base64: true,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset.base64) {
      Alert.alert('تعذر قراءة الصورة', 'اختر صورة أخرى للبطاقة.');
      return;
    }
    if (asset.fileSize && asset.fileSize > 8 * 1024 * 1024) {
      Alert.alert('الصورة كبيرة', 'اختر صورة حجمها أقل من 8 ميجابايت.');
      return;
    }
    setCard(asset);
  };

  const submit = async () => {
    const words = fullName.trim().split(/\s+/).filter(Boolean);
    if (words.length < 4) {
      Alert.alert('الاسم غير مكتمل', 'اكتب الاسم الرباعي للمندوب.');
      return;
    }
    if (!/^\d{14}$/.test(nationalId.trim())) {
      Alert.alert('الرقم القومي غير صحيح', 'يجب أن يتكون الرقم القومي المصري من 14 رقمًا.');
      return;
    }
    if (!/^[+\d][\d\s-]{7,16}$/.test(phone.trim())) {
      Alert.alert('رقم التليفون غير صحيح', 'اكتب رقم تليفون صالحًا للمندوب.');
      return;
    }
    if (!email.trim() || !address.trim() || !card) {
      Alert.alert('بيانات ناقصة', 'أدخل البريد والعنوان وارفع صورة البطاقة.');
      return;
    }
    setBusy(true);
    try {
      const created = await createCourier({
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        nationalId: nationalId.trim(),
        address: address.trim(),
        idCard: toImagePickerInput(card),
      });
      setCredentials(created);
      setFullName('');
      setEmail('');
      setPhone('');
      setNationalId('');
      setAddress('');
      setCard(null);
      Alert.alert('تم إنشاء الحساب', `رقم المندوب الثابت: ${created.code}`);
    } catch (error) {
      Alert.alert('تعذر إنشاء الحساب', error instanceof Error ? error.message : 'حاول مرة أخرى.');
    } finally {
      setBusy(false);
    }
  };

  if (isDemo || !isBackendConfigured) {
    return (
      <Page>
        <Heading>حسابات المندوبين</Heading>
        <Notice tone="warning">
          بيانات الهوية وصورة البطاقة لا تُحفظ في المعاينة. اربط Supabase والتخزين الخاص قبل إدخال
          أي بيانات حقيقية.
        </Notice>
        <Section title="معاينة القائمة">
          {couriers.map((courier) => (
            <View key={courier.id} style={styles.listRow}>
              <Text style={styles.code}>{courier.code}</Text>
              <Text style={styles.name}>{courier.fullName}</Text>
              <Text style={styles.detail}>{courier.phone} · {courier.isOnShift ? 'على الشيفت' : 'غير متصل'}</Text>
            </View>
          ))}
        </Section>
      </Page>
    );
  }

  return (
    <Page>
      <Heading>حسابات المندوبين</Heading>
      <Body>تظهر بيانات الهوية للإدارة فقط. رقم المندوب ثابت ولا يعتمد على الرقم القومي.</Body>
      {credentials && (
        <Notice tone="warning">
          احفظ بيانات الدخول الآن وأرسلها للمندوب بقناة آمنة. كلمة المرور المؤقتة لن تظهر مرة أخرى.
          {'\n'}رقم المندوب: {credentials.code}
          {'\n'}البريد: {credentials.email}
          {'\n'}كلمة المرور المؤقتة: {credentials.temporaryPassword}
        </Notice>
      )}
      {credentials && (
        <ActionButton onPress={() => setCredentials(null)} tone="outline">
          أخفي بيانات الدخول
        </ActionButton>
      )}

      <Section title="مندوبون مسجلون">
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
        {couriers.map((courier) => (
          <View key={courier.id} style={styles.listRow}>
            <Text style={styles.code}>{courier.code}</Text>
            <Text style={styles.name}>{courier.fullName}</Text>
            <Text style={styles.detail}>{courier.phone} · {courier.isOnShift ? 'على الشيفت' : 'غير متصل'}</Text>
          </View>
        ))}
      </Section>

      <Section title="إضافة مندوب">
        <Field label="الاسم الرباعي" onChangeText={setFullName} value={fullName} />
        <Field
          keyboardType="email-address"
          autoCapitalize="none"
          label="البريد الإلكتروني لتسجيل الدخول"
          onChangeText={setEmail}
          value={email}
        />
        <Field
          keyboardType="phone-pad"
          label="رقم تليفون المندوب"
          onChangeText={setPhone}
          value={phone}
        />
        <Field
          keyboardType="numeric"
          label="الرقم القومي (14 رقمًا)"
          maxLength={14}
          onChangeText={setNationalId}
          value={nationalId}
        />
        <Field label="العنوان" multiline onChangeText={setAddress} value={address} />
        <ActionButton onPress={pickIdCard} tone="outline">
          {card ? 'تغيير صورة البطاقة' : 'اختيار صورة البطاقة'}
        </ActionButton>
        {card?.uri ? <Image source={{ uri: card.uri }} style={styles.cardPreview} /> : null}
        <Notice>تُرفع الصورة إلى مساحة تخزين خاصة؛ لا تُحفظ في ملفات عامة أو سجلات التطبيق.</Notice>
        <ActionButton loading={busy} onPress={submit}>
          إنشاء الحساب ورقم المندوب
        </ActionButton>
      </Section>
      <ActionButton onPress={() => router.push('/(tabs)/orders')} tone="outline">
        الانتقال إلى الطلبات
      </ActionButton>
    </Page>
  );
}

const styles = StyleSheet.create({
  listRow: {
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.outline,
    gap: 4,
  },
  code: { color: colors.primary, fontSize: 13, fontWeight: '800', textAlign: 'right' },
  name: { color: colors.text, fontSize: 16, fontWeight: '700', textAlign: 'right' },
  detail: { color: colors.muted, fontSize: 13, textAlign: 'right', writingDirection: 'rtl' },
  cardPreview: { width: '100%', height: 190, borderRadius: 14, resizeMode: 'contain', backgroundColor: colors.surfaceRaised },
});
