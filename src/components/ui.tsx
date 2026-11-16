import type { PropsWithChildren, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { OrderStatus } from '../types';
import { colors, spacing } from '../theme';

export function Page({ children }: PropsWithChildren) {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.page}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function Heading({ children }: PropsWithChildren) {
  return <Text style={styles.heading}>{children}</Text>;
}

export function Subheading({ children }: PropsWithChildren) {
  return <Text style={styles.subheading}>{children}</Text>;
}

export function Body({ children, style }: PropsWithChildren<{ style?: object }>) {
  return <Text style={[styles.body, style]}>{children}</Text>;
}

export function Label({ children }: PropsWithChildren) {
  return <Text style={styles.label}>{children}</Text>;
}

export function Field({
  label,
  multiline,
  ...props
}: TextInputProps & { label: string }) {
  return (
    <View style={styles.fieldWrap}>
      <Label>{label}</Label>
      <TextInput
        {...props}
        multiline={multiline}
        placeholderTextColor={colors.muted}
        style={[styles.input, multiline && styles.multiline, props.style]}
        textAlign="right"
        textAlignVertical={multiline ? 'top' : 'center'}
      />
    </View>
  );
}

export function ActionButton({
  children,
  onPress,
  disabled,
  loading,
  tone = 'primary',
}: PropsWithChildren<{
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  tone?: 'primary' | 'secondary' | 'outline' | 'danger';
}>) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        tone === 'primary' && styles.buttonPrimary,
        tone === 'secondary' && styles.buttonSecondary,
        tone === 'outline' && styles.buttonOutline,
        tone === 'danger' && styles.buttonDanger,
        (disabled || loading) && styles.buttonDisabled,
        pressed && !disabled && styles.buttonPressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={tone === 'outline' ? colors.primary : colors.white} />
      ) : (
        <Text
          style={[
            styles.buttonText,
            tone === 'outline' && styles.buttonOutlineText,
          ]}
        >
          {children}
        </Text>
      )}
    </Pressable>
  );
}

export function Notice({
  children,
  tone = 'info',
}: PropsWithChildren<{ tone?: 'info' | 'warning' | 'danger' }>) {
  const noticeColor =
    tone === 'danger'
      ? colors.dangerSurface
      : tone === 'warning'
        ? colors.warningSurface
        : colors.surfaceRaised;
  const textColor =
    tone === 'danger'
      ? colors.danger
      : tone === 'warning'
        ? colors.warning
        : colors.primaryDark;
  return (
    <View style={[styles.notice, { backgroundColor: noticeColor }]}>
      <Text style={[styles.body, { color: textColor }]}>{children}</Text>
    </View>
  );
}

const statusCopy: Record<OrderStatus, { label: string; color: string; bg: string }> = {
  pending: { label: 'بانتظار الإسناد', color: colors.warning, bg: colors.warningSurface },
  assigned: { label: 'تم إرسال الطلب', color: colors.primary, bg: colors.surfaceRaised },
  accepted: { label: 'استلمه المندوب', color: colors.secondary, bg: '#D9F0F1' },
  picked_up: { label: 'خرج للتوصيل', color: colors.primaryDark, bg: '#DCE8F7' },
  delivered: { label: 'تم التوصيل', color: colors.success, bg: colors.successSurface },
  cancelled: { label: 'ملغي', color: colors.danger, bg: colors.dangerSurface },
};

export function StatusTag({ status }: { status: OrderStatus }) {
  const item = statusCopy[status];
  return (
    <View style={[styles.statusTag, { backgroundColor: item.bg }]}>
      <Text style={[styles.statusText, { color: item.color }]}>{item.label}</Text>
    </View>
  );
}

export function Section({
  title,
  action,
  children,
}: PropsWithChildren<{ title: string; action?: ReactNode }>) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {action}
      </View>
      {children}
    </View>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  page: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: 44,
    gap: spacing.md,
  },
  heading: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  subheading: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '700',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  body: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  label: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'right',
    writingDirection: 'rtl',
    marginBottom: 7,
  },
  fieldWrap: {
    gap: 2,
  },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.outline,
    borderRadius: 14,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    color: colors.text,
    fontSize: 16,
    writingDirection: 'rtl',
  },
  multiline: {
    minHeight: 100,
    paddingTop: 13,
  },
  button: {
    minHeight: 52,
    paddingHorizontal: 18,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPrimary: {
    backgroundColor: colors.primary,
  },
  buttonSecondary: {
    backgroundColor: colors.secondary,
  },
  buttonOutline: {
    borderWidth: 1,
    borderColor: colors.outline,
    backgroundColor: colors.surface,
  },
  buttonDanger: {
    backgroundColor: colors.danger,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  buttonPressed: {
    opacity: 0.82,
  },
  buttonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  buttonOutlineText: {
    color: colors.primary,
  },
  notice: {
    padding: 14,
    borderRadius: 14,
  },
  statusTag: {
    alignSelf: 'flex-start',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  section: {
    gap: spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 17,
    color: colors.text,
    fontWeight: '700',
    textAlign: 'right',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.outline,
  },
});
