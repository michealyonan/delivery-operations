import { router, useLocalSearchParams } from 'expo-router';
import type { ImagePickerAsset } from 'expo-image-picker';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Platform, StyleSheet } from 'react-native';

import { ActionButton, Body, Field, Heading, Notice, Page, Section } from '../../../components/ui';
import { useApp, toImagePickerInput } from '../../../state/app-context';
import { colors } from '../../../theme';
import type { CourierPrivateDetails } from '../../../types';

function formatDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return date.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
}

export default function CourierDetailsScreen() {
  const { id: routeId } = useLocalSearchParams<{ id: string }>();
  const courierId = Number(Array.isArray(routeId) ? routeId[0] : routeId);
  const {
    profile,
    couriers,
    isDemo,
    getCourierPrivateDetails,
    renewCourierContract,
    terminateCourier,
    updateCourierProfile,
  } = useApp();
  const courier = couriers.find((item) => item.id === courierId);
  const [details, setDetails] = useState<CourierPrivateDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [address, setAddress] = useState('');
  const [idCard, setIdCard] = useState<ImagePickerAsset | null>(null);
  const [selfie, setSelfie] = useState<ImagePickerAsset | null>(null);

  const loadDetails = useCallback(async () => {
    if (isDemo || !Number.isSafeInteger(courierId) || courierId < 1) return;
    setLoading(true);
    setErrorMessage('');
    try {
      const result = await getCourierPrivateDetails(courierId);
      setDetails(result);
      setFullName(result.fullName);
      setEmail(result.email);
      setPhone(result.phone);
      setNationalId(result.nationalId);
      setAddress(result.address);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'تعذر تحميل ملف المندوب.');
    } finally {
      setLoading(false);
    }
  }, [courierId, getCourierPrivateDetails, isDemo]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadDetails();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadDetails]);

  const pickImage = async (
    setImage: (asset: ImagePickerAsset) => void,
    label: string,
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
        setErrorMessage(`تعذر قراءة ${label}؛ اختر صورة أخرى.`);
        return;
      }
      if (asset.fileSize && asset.fileSize > 8 * 1024 * 1024) {
        setErrorMessage(`حجم ${label} يجب أن يكون أقل من 8 ميجابايت.`);
        return;
      }
      setImage(asset);
      setErrorMessage('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : `تعذر اختيار ${label}.`);
    }
  };

  const saveProfile = async () => {
    setErrorMessage('');
    if (fullName.trim().split(/\s+/).filter(Boolean).length < 4) {
      setErrorMessage('اكتب الاسم الرباعي للمندوب.');
      return;
    }
    if (!/^\d{14}$/.test(nationalId.trim())) {
      setErrorMessage('يجب أن يتكون الرقم القومي المصري من 14 رقمًا.');
      return;
    }
    setBusyAction('save');
    try {
      await updateCourierProfile(courierId, {
        fullName,
        email,
        phone,
        nationalId,
        address,
        ...(idCard ? { idCard: toImagePickerInput(idCard) } : {}),
        ...(selfie ? { selfie: toImagePickerInput(selfie) } : {}),
      });
      setIdCard(null);
      setSelfie(null);
      await loadDetails();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'تعذر حفظ ملف المندوب.');
    } finally {
      setBusyAction('');
    }
  };

  const confirmAndRun = (
    title: string,
    message: string,
    buttonTitle: string,
    run: () => Promise<void>,
  ) => {
    const perform = async () => {
      setErrorMessage('');
      setBusyAction(buttonTitle);
      try {
        await run();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'تعذر تنفيذ الإجراء.');
      } finally {
        setBusyAction('');
      }
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n\n${message}`)) void perform();
      return;
    }
    Alert.alert(title, message, [
      { text: 'إلغاء', style: 'cancel' },
      { text: buttonTitle, style: 'destructive', onPress: () => void perform() },
    ]);
  };

  if (profile?.role !== 'admin') {
    return (
      <Page>
        <Heading>ملف المندوب</Heading>
        <Notice tone="danger">هذه الصفحة متاحة للإدارة فقط.</Notice>
      </Page>
    );
  }

  if (!Number.isSafeInteger(courierId) || courierId < 1 || !courier) {
    return (
      <Page>
        <Heading>ملف المندوب</Heading>
        <Notice tone="danger">حساب المندوب غير موجود في القائمة الحالية.</Notice>
        <ActionButton onPress={() => router.back()} tone="outline">العودة إلى القائمة</ActionButton>
      </Page>
    );
  }

  const isTerminated = details?.terminatedAt != null || courier.isTerminated;
  const isExpired = courier.contractEndDate < new Date().toISOString().slice(0, 10);

  return (
    <Page>
      <ActionButton onPress={() => router.back()} tone="outline">العودة إلى المناديب</ActionButton>
      <Heading>ملف {courier.fullName}</Heading>
      <Body>رقم المندوب الثابت: {courier.code}</Body>
      {isDemo ? (
        <Notice tone="warning">
          هذه معاينة فقط؛ بيانات الهوية والعنوان والصور الحقيقية لا تظهر ولا تُعدّل في الوضع التجريبي.
        </Notice>
      ) : loading ? (
        <Notice>جارٍ تحميل بيانات الملف الخاصة...</Notice>
      ) : details ? (
        <>
          <Section title="حالة الحساب والعقد">
            <Body>الحالة: {isTerminated ? 'إيقاف نهائي' : !details.isActive ? 'موقوف مؤقتًا' : details.isOnShift ? 'على الشيفت' : 'غير متصل'}</Body>
            <Body>بداية العقد: {formatDate(details.contractStartDate)}</Body>
            <Body>نهاية العقد: {formatDate(details.contractEndDate)}</Body>
            {details.breakUntil && new Date(details.breakUntil) > new Date() ? (
              <Body>
                بريك حتى {new Date(details.breakUntil).toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' })}
              </Body>
            ) : null}
            {isExpired && !isTerminated ? (
              <Notice tone="warning">انتهى العقد؛ لن يستقبل المندوب طلبات حتى تجديده.</Notice>
            ) : null}
            {details.terminatedAt ? <Body>تاريخ الإيقاف النهائي: {new Date(details.terminatedAt).toLocaleString('ar-EG')}</Body> : null}
          </Section>

          <Section title="بيانات المندوب">
            <Field label="الاسم الرباعي" onChangeText={setFullName} value={fullName} />
            <Field
              autoCapitalize="none"
              keyboardType="email-address"
              label="البريد الإلكتروني"
              onChangeText={setEmail}
              value={email}
            />
            <Field keyboardType="phone-pad" label="رقم الهاتف" onChangeText={setPhone} value={phone} />
            <Field
              keyboardType="numeric"
              label="الرقم القومي"
              maxLength={14}
              onChangeText={setNationalId}
              value={nationalId}
            />
            <Field label="العنوان" multiline onChangeText={setAddress} value={address} />
            <Body>صورة البطاقة الحالية</Body>
            <Image accessibilityLabel="صورة بطاقة المندوب" resizeMode="contain" source={{ uri: details.idCardUrl }} style={styles.cardImage} />
            <ActionButton onPress={() => void pickImage(setIdCard, 'صورة البطاقة')} tone="outline">
              {idCard ? 'تغيير صورة البطاقة المختارة' : 'رفع صورة بطاقة جديدة'}
            </ActionButton>
            {idCard?.uri ? <Image source={{ uri: idCard.uri }} style={styles.cardImage} /> : null}
            <Body>صورة السيلفي الحالية</Body>
            {details.selfieUrl ? (
              <Image accessibilityLabel="صورة سيلفي للمندوب" source={{ uri: details.selfieUrl }} style={styles.selfieImage} />
            ) : (
              <Body>لا توجد صورة سيلفي مرفوعة.</Body>
            )}
            <ActionButton onPress={() => void pickImage(setSelfie, 'صورة السيلفي')} tone="outline">
              {selfie ? 'تغيير صورة السيلفي المختارة' : 'رفع صورة سيلفي جديدة'}
            </ActionButton>
            {selfie?.uri ? <Image source={{ uri: selfie.uri }} style={styles.selfieImage} /> : null}
            <Notice>الصور محفوظة في التخزين الخاص، ولا تظهر إلا للإدارة والمندوب صاحب الحساب.</Notice>
            {errorMessage ? <Notice tone="danger">{errorMessage}</Notice> : null}
            <ActionButton loading={busyAction === 'save'} onPress={() => void saveProfile()}>
              حفظ تعديلات الملف
            </ActionButton>
          </Section>

          {!isTerminated ? (
            <Section title="إجراءات إدارية">
              <ActionButton
                disabled={busyAction !== ''}
                loading={busyAction === 'تجديد العقد'}
                onPress={() =>
                  confirmAndRun(
                    'تجديد عقد المندوب',
                    'سيبدأ العقد الجديد من اليوم وينتهي بعد سنة، حتى إذا كان العقد الحالي لم ينتهِ بعد.',
                    'تجديد العقد',
                    async () => {
                      await renewCourierContract(courierId);
                      await loadDetails();
                    },
                  )
                }
                tone="outline"
              >
                تجديد العقد لمدة سنة من اليوم
              </ActionButton>
              <ActionButton
                disabled={busyAction !== ''}
                loading={busyAction === 'إيقاف نهائي'}
                onPress={() =>
                  confirmAndRun(
                    'إيقاف المندوب نهائيًا',
                    'سيُمنع الحساب من تسجيل الدخول واستقبال الطلبات. ستبقى البيانات والطلبات والسجلات محفوظة، ويلزم نقل أو إكمال الطلبات غير المنتهية أولًا.',
                    'إيقاف نهائي',
                    async () => {
                      await terminateCourier(courierId);
                      await loadDetails();
                    },
                  )
                }
                tone="danger"
              >
                إيقاف نهائي مع الاحتفاظ بالسجلات
              </ActionButton>
            </Section>
          ) : null}
          {errorMessage && busyAction !== 'save' ? <Notice tone="danger">{errorMessage}</Notice> : null}
        </>
      ) : errorMessage ? (
        <Notice tone="danger">{errorMessage}</Notice>
      ) : null}
      {!isDemo && !loading && !details && (
        <ActionButton onPress={() => void loadDetails()} tone="outline">إعادة تحميل الملف</ActionButton>
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  cardImage: {
    width: '100%',
    height: 190,
    borderRadius: 14,
    backgroundColor: colors.surfaceRaised,
  },
  selfieImage: {
    width: 120,
    height: 120,
    alignSelf: 'center',
    borderRadius: 60,
    backgroundColor: colors.surfaceRaised,
  },
});
