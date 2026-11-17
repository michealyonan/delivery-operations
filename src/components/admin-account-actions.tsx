import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { ActionButton, Body, Field, Notice, Section } from './ui';
import { useApp } from '../state/app-context';
import { colors, spacing } from '../theme';
import type { CourierPrivateDetails, ManagedAccountType } from '../types';

export function AdminAccountActions({
  accountType,
  accountId,
}: {
  accountType: ManagedAccountType;
  accountId: number | string;
}) {
  const { getCourierPrivateDetails, setAccountPassword } = useApp();
  const [passwordEditorOpen, setPasswordEditorOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [details, setDetails] = useState<CourierPrivateDetails | null>(null);
  const [detailsBusy, setDetailsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const changePassword = async () => {
    setErrorMessage('');
    setPasswordMessage('');
    setPasswordBusy(true);
    try {
      const result = await setAccountPassword(accountType, accountId, password || undefined);
      setPasswordMessage(
        result.temporaryPassword
          ? `كلمة المرور المؤقتة: ${result.temporaryPassword}`
          : 'تم تغيير كلمة المرور بنجاح.',
      );
      setPassword('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'تعذر تغيير كلمة المرور.');
    } finally {
      setPasswordBusy(false);
    }
  };

  const toggleDetails = async () => {
    if (detailsOpen) {
      setDetailsOpen(false);
      return;
    }
    setDetailsOpen(true);
    if (details) return;

    setDetailsBusy(true);
    setErrorMessage('');
    try {
      setDetails(await getCourierPrivateDetails(Number(accountId)));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'تعذر تحميل بيانات الهوية.');
    } finally {
      setDetailsBusy(false);
    }
  };

  return (
    <View style={styles.actions}>
      {accountType === 'courier' ? (
        <ActionButton loading={detailsBusy} onPress={toggleDetails} tone="outline">
          {detailsOpen ? 'إخفاء بيانات الهوية' : 'عرض بيانات الهوية والصور'}
        </ActionButton>
      ) : null}
      {detailsOpen && details ? (
        <Section title="البيانات المرفوعة">
          <Body>الرقم القومي: {details.nationalId}</Body>
          <Body>العنوان: {details.address}</Body>
          <Body>صورة البطاقة</Body>
          <Image
            accessibilityLabel="صورة بطاقة المندوب"
            resizeMode="contain"
            source={{ uri: details.idCardUrl }}
            style={styles.cardImage}
          />
          <Body>صورة السيلفي</Body>
          {details.selfieUrl ? (
            <Image
              accessibilityLabel="صورة السيلفي للمندوب"
              source={{ uri: details.selfieUrl }}
              style={styles.selfieImage}
            />
          ) : (
            <Body>لا توجد صورة سيلفي مرفوعة لهذا الحساب.</Body>
          )}
        </Section>
      ) : null}

      <ActionButton
        onPress={() => {
          setPasswordEditorOpen((open) => !open);
          setPasswordMessage('');
          setErrorMessage('');
        }}
        tone="outline"
      >
        {passwordEditorOpen ? 'إلغاء تغيير كلمة المرور' : 'تغيير كلمة المرور'}
      </ActionButton>
      {passwordEditorOpen ? (
        <View style={styles.passwordEditor}>
          <Field
            autoCapitalize="none"
            autoComplete="new-password"
            label="كلمة المرور الجديدة (اتركها فارغة لتوليد مؤقتة)"
            maxLength={72}
            onChangeText={setPassword}
            secureTextEntry
            value={password}
          />
          <Body>كلمة المرور المؤقتة تظهر مرة واحدة فقط؛ سلّمها لصاحب الحساب بقناة آمنة.</Body>
          {passwordMessage ? (
            <View style={styles.passwordNotice}>
              <Text selectable style={styles.passwordText}>{passwordMessage}</Text>
            </View>
          ) : null}
          {errorMessage ? <Notice tone="danger">{errorMessage}</Notice> : null}
          <ActionButton
            disabled={password.length > 0 && password.length < 8}
            loading={passwordBusy}
            onPress={changePassword}
          >
            حفظ كلمة المرور
          </ActionButton>
        </View>
      ) : null}
      {errorMessage && !passwordEditorOpen ? (
        <Notice tone="danger">{errorMessage}</Notice>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { gap: spacing.sm },
  passwordEditor: { gap: spacing.sm },
  passwordNotice: {
    padding: spacing.md,
    borderRadius: 14,
    backgroundColor: colors.warningSurface,
  },
  passwordText: {
    color: colors.primaryDark,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 22,
    textAlign: 'right',
    writingDirection: 'ltr',
  },
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
