import { router } from 'expo-router';
import type { ImagePickerAsset } from 'expo-image-picker';
import { useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { AdminAccountActions } from '../../components/admin-account-actions';
import { BreakCountdown } from '../../components/break-countdown';
import { ActionButton, Body, Field, Heading, Notice, Page, Section, SegmentedSwitch } from '../../components/ui';
import { Alert } from '../../lib/platform-alert';
import { isBackendConfigured } from '../../lib/supabase';
import { useApp, toImagePickerInput } from '../../state/app-context';
import { colors, spacing } from '../../theme';
import type { Courier, TemporaryCredentials } from '../../types';

function courierStatus(courier: Courier) {
  if (courier.isTerminated) return 'إيقاف نهائي';
  if (!courier.isActive) return 'الحساب موقوف';
  if (courier.shiftCloseRequestedAt) return 'بانتظار موافقة إغلاق الشيفت';
  if (courier.isOnBreak) {
    return courier.breakStartedBy === 'courier' ? 'بريك بطلب المندوب' : 'بريك من الإدارة';
  }
  return courier.isOnShift ? 'على الشيفت' : 'غير متصل';
}

export default function CouriersScreen() {
  const {
    couriers,
    createCourier,
    hasLoadedData,
    isDemo,
    refresh,
    approveCourierShiftClose,
    setCourierActive,
    breakRequestsEnabled,
    setBreakRequestsEnabled,
  } = useApp();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [address, setAddress] = useState('');
  const [card, setCard] = useState<ImagePickerAsset | null>(null);
  const [selfie, setSelfie] = useState<ImagePickerAsset | null>(null);
  const [credentials, setCredentials] = useState<TemporaryCredentials | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyCourierId, setBusyCourierId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [breakSettingBusy, setBreakSettingBusy] = useState(false);
  const [breakSettingError, setBreakSettingError] = useState('');
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [activeSection, setActiveSection] = useState<'accounts' | 'create'>('accounts');

  const openCourier = (courierId: number) => {
    router.push({ pathname: '/couriers/[id]', params: { id: String(courierId) } });
  };

  const toggleBreakRequests = async () => {
    setBreakSettingBusy(true);
    setBreakSettingError('');
    try {
      await setBreakRequestsEnabled(!breakRequestsEnabled);
    } catch (error) {
      setBreakSettingError(error instanceof Error ? error.message : 'تعذر تحديث إعدادات البريك.');
    } finally {
      setBreakSettingBusy(false);
    }
  };

  const reloadCouriers = async () => {
    setRefreshBusy(true);
    try {
      await refresh();
    } catch (error) {
      console.error('تعذر تحديث قائمة المندوبين:', error);
    } finally {
      setRefreshBusy(false);
    }
  };

  const approveShiftClose = async (courierId: number) => {
    setBusyCourierId(courierId);
    try {
      await approveCourierShiftClose(courierId);
      Alert.alert('تم إغلاق الشيفت', 'تم اعتماد الطلب وتحديث حالة المندوب.');
    } catch (error) {
      Alert.alert('تعذرت الموافقة', error instanceof Error ? error.message : 'حاول مرة أخرى.');
    } finally {
      setBusyCourierId(null);
    }
  };

  const toggleCourier = (courierId: number, isActive: boolean) => {
    const nextActive = !isActive;
    const title = nextActive ? 'إعادة تفعيل الحساب' : 'إيقاف حساب المندوب';
    const message = nextActive
      ? 'سيتمكن المندوب من تسجيل الدخول مجددًا، لكنه يحتاج إلى بدء الشيفت بنفسه.'
      : 'سيُمنع المندوب من تسجيل الدخول وسيتوقف الشيفت. انقل أو أكمل طلباته غير المنتهية أولًا.';
    const run = async () => {
      setBusyCourierId(courierId);
      try {
        await setCourierActive(courierId, nextActive);
      } catch (error) {
        Alert.alert(title, error instanceof Error ? error.message : 'حاول مرة أخرى.');
      } finally {
        setBusyCourierId(null);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n\n${message}`)) void run();
      return;
    }

    Alert.alert(title, message, [
      { text: 'إلغاء', style: 'cancel' },
      { text: nextActive ? 'إعادة التفعيل' : 'إيقاف الحساب', style: 'destructive', onPress: () => void run() },
    ]);
  };

  const pickImage = async (
    setImage: (asset: ImagePickerAsset) => void,
    description: string,
  ) => {
    try {
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
        setErrorMessage(`تعذر قراءة ${description}؛ اختر صورة أخرى.`);
        return;
      }
      if (asset.fileSize && asset.fileSize > 8 * 1024 * 1024) {
        setErrorMessage(`حجم ${description} يجب أن يكون أقل من 8 ميجابايت.`);
        return;
      }
      setImage(asset);
      setErrorMessage('');
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : `تعذر اختيار ${description}. حاول مرة أخرى.`,
      );
    }
  };

  const pickIdCard = () => pickImage(setCard, 'صورة البطاقة');
  const pickSelfie = () => pickImage(setSelfie, 'صورة السيلفي');

  const submit = async () => {
    setErrorMessage('');
    const words = fullName.trim().split(/\s+/).filter(Boolean);
    if (words.length < 4) {
      setErrorMessage('اكتب الاسم الرباعي للمندوب.');
      return;
    }
    if (!/^\d{14}$/.test(nationalId.trim())) {
      setErrorMessage('يجب أن يتكون الرقم القومي المصري من 14 رقمًا.');
      return;
    }
    if (!/^[+\d][\d\s-]{7,16}$/.test(phone.trim())) {
      setErrorMessage('اكتب رقم تليفون صالحًا للمندوب.');
      return;
    }
    if (!email.trim() || !address.trim() || !card || !selfie) {
      setErrorMessage('أدخل البريد والعنوان وارفع صورة البطاقة وصورة السيلفي.');
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
        selfie: toImagePickerInput(selfie),
      });
      setCredentials(created);
      setFullName('');
      setEmail('');
      setPhone('');
      setNationalId('');
      setAddress('');
      setCard(null);
      setSelfie(null);
      setErrorMessage('');
      setActiveSection('create');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'تعذر إنشاء الحساب. حاول مرة أخرى.');
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
        <SegmentedSwitch
          items={[
            { key: 'accounts', label: 'حسابات المندوبين' },
            { key: 'create', label: 'إضافة مندوب' },
          ]}
          onSelect={(key) => setActiveSection(key === 'create' ? 'create' : 'accounts')}
          selected={activeSection}
        />
        {activeSection === 'accounts' ? (
          <Section title="معاينة حسابات المندوبين">
            {couriers.map((courier) => (
              <View key={courier.id} style={styles.listRow}>
                <Pressable accessibilityRole="button" onPress={() => openCourier(courier.id)}>
                  <Text style={styles.code}>{courier.code}</Text>
                  <Text style={styles.name}>{courier.fullName}</Text>
                </Pressable>
                <Text style={styles.detail}>
                  {courier.phone} · {courierStatus(courier)}
                </Text>
                {courier.shiftCloseRequestedAt ? (
                  <ActionButton
                    disabled={busyCourierId !== null}
                    loading={busyCourierId === courier.id}
                    onPress={() => void approveShiftClose(courier.id)}
                    tone="secondary"
                  >
                    الموافقة على إغلاق الشيفت
                  </ActionButton>
                ) : null}
                <Text style={styles.detail}>
                  العقد: {courier.contractStartDate} — {courier.contractEndDate}
                </Text>
                <ActionButton onPress={() => openCourier(courier.id)} tone="outline">
                  فتح ملف المندوب
                </ActionButton>
                <ActionButton
                  disabled={busyCourierId !== null || courier.isTerminated}
                  loading={busyCourierId === courier.id}
                  onPress={() => toggleCourier(courier.id, courier.isActive)}
                  tone={courier.isActive ? 'danger' : 'outline'}
                >
                  {courier.isTerminated ? 'تم الإيقاف النهائي' : courier.isActive ? 'إيقاف الحساب مؤقتًا' : 'إعادة تفعيل الحساب'}
                </ActionButton>
              </View>
            ))}
          </Section>
        ) : (
          <Section title="إنشاء حساب مندوب">
            <Notice tone="warning">إنشاء حسابات حقيقية غير متاح في المعاينة.</Notice>
          </Section>
        )}
      </Page>
    );
  }

  return (
    <Page>
      <Heading>حسابات المندوبين</Heading>
      <Body>تظهر بيانات الهوية للإدارة فقط. رقم المندوب ثابت ولا يعتمد على الرقم القومي.</Body>
      <SegmentedSwitch
        items={[
          { key: 'accounts', label: 'حسابات المندوبين' },
          { key: 'create', label: 'إضافة مندوب' },
        ]}
        onSelect={(key) => setActiveSection(key === 'create' ? 'create' : 'accounts')}
        selected={activeSection}
      />
      {activeSection === 'accounts' ? (
        <Section title="المندوبون المسجلون">
          <Body>
            {breakRequestsEnabled
              ? 'المندوبون يستطيعون طلب بريك من صفحة الدعم.'
              : 'طلبات البريك الجديدة متوقفة حتى تعيد الإدارة إتاحتها.'}
          </Body>
          <ActionButton
            disabled={breakSettingBusy}
            loading={breakSettingBusy}
            onPress={toggleBreakRequests}
            tone={breakRequestsEnabled ? 'danger' : 'outline'}
          >
            {breakRequestsEnabled ? 'إيقاف طلبات البريك' : 'إتاحة طلبات البريك'}
          </ActionButton>
          {breakSettingError ? <Notice tone="danger">{breakSettingError}</Notice> : null}
          <ActionButton
            disabled={refreshBusy}
            loading={refreshBusy}
            onPress={() => void reloadCouriers()}
            tone="outline"
          >
            تحديث القائمة
          </ActionButton>
          {hasLoadedData && couriers.length === 0 ? (
            <Notice tone="warning">
              لا توجد حسابات مندوبين ظاهرة حاليًا. إذا كان المندوب يستطيع تسجيل الدخول أو كان مسجلًا
              من قبل، لا تُنشئ حسابًا جديدًا؛ أعد تحميل البيانات وراجع اتصال قاعدة البيانات وصلاحيات
              الإدارة.
            </Notice>
          ) : null}
          {couriers.map((courier) => (
            <View key={courier.id} style={styles.listRow}>
              <Pressable accessibilityRole="button" onPress={() => openCourier(courier.id)}>
                <Text style={styles.code}>{courier.code}</Text>
                <Text style={styles.name}>{courier.fullName}</Text>
              </Pressable>
              <Text style={styles.detail}>
                {courier.phone} · {courierStatus(courier)}
              </Text>
              <Text style={styles.detail}>
                العقد: {courier.contractStartDate} — {courier.contractEndDate}
              </Text>
              {courier.isOnBreak && courier.breakUntil ? (
                <>
                  <Text style={styles.detail}>
                    ينتهي البريك: {new Date(courier.breakUntil).toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' })}
                  </Text>
                  <BreakCountdown until={courier.breakUntil} />
                </>
              ) : null}
              <ActionButton onPress={() => openCourier(courier.id)} tone="outline">
                فتح ملف المندوب
              </ActionButton>
              <ActionButton
                disabled={busyCourierId !== null || courier.isTerminated}
                loading={busyCourierId === courier.id}
                onPress={() => toggleCourier(courier.id, courier.isActive)}
                tone={courier.isActive ? 'danger' : 'outline'}
              >
                {courier.isTerminated ? 'تم الإيقاف النهائي' : courier.isActive ? 'إيقاف الحساب مؤقتًا' : 'إعادة تفعيل الحساب'}
              </ActionButton>
              <AdminAccountActions accountType="courier" accountId={courier.id} />
            </View>
          ))}
        </Section>
      ) : (
        <Section title="إنشاء حساب مندوب">
          {credentials && (
            <>
              <Notice tone="warning">
                احفظ بيانات الدخول الآن وأرسلها للمندوب بقناة آمنة. كلمة المرور المؤقتة لن تظهر مرة أخرى.
                {'\n'}رقم المندوب: {credentials.code}
                {'\n'}البريد: {credentials.email}
                {'\n'}كلمة المرور المؤقتة: {credentials.temporaryPassword}
              </Notice>
              <ActionButton onPress={() => setCredentials(null)} tone="outline">
                أخفي بيانات الدخول
              </ActionButton>
            </>
          )}
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
          <ActionButton onPress={pickSelfie} tone="outline">
            {selfie ? 'تغيير صورة السيلفي' : 'اختيار صورة سيلفي للمندوب'}
          </ActionButton>
          {selfie?.uri ? <Image source={{ uri: selfie.uri }} style={styles.selfiePreview} /> : null}
          <Notice>تُرفع الصورة إلى مساحة تخزين خاصة؛ لا تُحفظ في ملفات عامة أو سجلات التطبيق.</Notice>
          <Notice tone="info">صورة السيلفي مطلوبة وستظهر للمندوب في صفحة حسابي.</Notice>
          {errorMessage ? <Notice tone="danger">{errorMessage}</Notice> : null}
          <ActionButton loading={busy} onPress={submit}>
            إنشاء الحساب ورقم المندوب
          </ActionButton>
        </Section>
      )}
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
  selfiePreview: {
    width: 112,
    height: 112,
    alignSelf: 'center',
    borderRadius: 56,
    backgroundColor: colors.surfaceRaised,
  },
});
