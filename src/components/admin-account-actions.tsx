import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ActionButton, Body, Field, Notice } from './ui';
import { useApp } from '../state/app-context';
import { colors, spacing } from '../theme';
import type { ManagedAccountType } from '../types';

export function AdminAccountActions({
  accountType,
  accountId,
}: {
  accountType: ManagedAccountType;
  accountId: number | string;
}) {
  const { setAccountPassword } = useApp();
  const [passwordEditorOpen, setPasswordEditorOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState('');
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

  return (
    <View style={styles.actions}>
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
          <Notice tone="info">
            لا يمكن عرض كلمة المرور الحالية؛ يمكنك تعيين كلمة جديدة أو ترك الحقل فارغًا لتوليد كلمة مؤقتة.
          </Notice>
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
      {errorMessage ? (
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
});
