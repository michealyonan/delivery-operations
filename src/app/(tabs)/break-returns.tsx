import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { BreakCountdown } from '../../components/break-countdown';
import { ActionButton, Body, Heading, Notice, Page, Section } from '../../components/ui';
import { useApp } from '../../state/app-context';
import { colors, spacing } from '../../theme';

export default function BreakReturnsScreen() {
  const { profile, couriers, isDemo, endCourierBreak, refresh } = useApp();
  const [now, setNow] = useState<number | null>(null);
  const [busyCourierId, setBusyCourierId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    const firstUpdate = setTimeout(() => setNow(Date.now()), 0);
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => {
      clearTimeout(firstUpdate);
      clearInterval(timer);
    };
  }, []);

  const onBreak = useMemo(
    () => couriers.filter(
      (courier) => now !== null && courier.breakUntil && new Date(courier.breakUntil).getTime() > now,
    ),
    [couriers, now],
  );

  const returnToWork = async (courierId: number, fullName: string) => {
    setBusyCourierId(courierId);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      await endCourierBreak(courierId);
      setSuccessMessage(`تم فك بريك ${fullName} وإرجاعه للشغل.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'تعذر فك البريك.');
    } finally {
      setBusyCourierId(null);
    }
  };

  if (profile?.role !== 'admin') {
    return (
      <Page>
        <Heading>فك بريكات المندوبين</Heading>
        <Notice tone="danger">هذه الصفحة متاحة للإدارة فقط.</Notice>
      </Page>
    );
  }

  return (
    <Page>
      <Heading>فك بريكات المندوبين</Heading>
      <Body>تظهر هنا البريكات النشطة. يمكنك إرجاع أي مندوب للشغل، سواء بدأ البريك بنفسه أو بدأته الإدارة.</Body>
      {isDemo ? <Notice tone="warning">هذه بيانات تجريبية داخل هذا الجهاز فقط.</Notice> : null}
      <ActionButton
        disabled={busyCourierId !== null}
        onPress={() => {
          setErrorMessage('');
          refresh().catch((error: unknown) =>
            setErrorMessage(error instanceof Error ? error.message : 'تعذر تحديث قائمة البريكات.'),
          );
        }}
        tone="outline"
      >
        تحديث قائمة البريكات
      </ActionButton>
      {errorMessage ? <Notice tone="danger">{errorMessage}</Notice> : null}
      {successMessage ? <Notice>{successMessage}</Notice> : null}
      {onBreak.length === 0 ? (
        <Notice>لا يوجد مندوبون في بريك حاليًا.</Notice>
      ) : (
        <Section title={`مندوبون في بريك (${onBreak.length})`}>
          {onBreak.map((courier) => (
            <View key={courier.id} style={styles.courier}>
              <View style={styles.identity}>
                {courier.profilePhotoUrl ? (
                  <Image
                    accessibilityLabel={`صورة ${courier.fullName}`}
                    source={{ uri: courier.profilePhotoUrl }}
                    style={styles.avatar}
                  />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <MaterialCommunityIcons name="account" size={25} color={colors.muted} />
                  </View>
                )}
                <View style={styles.identityText}>
                  <Text style={styles.name}>{courier.fullName}</Text>
                  <Text style={styles.detail}>رقم المندوب: {courier.code}</Text>
                </View>
              </View>
              <Notice tone={courier.breakStartedBy === 'courier' ? 'info' : 'warning'}>
                {courier.breakStartedBy === 'courier' ? 'بريك بطلب المندوب' : 'بريك من الإدارة'}
              </Notice>
              <Body>
                ينتهي {new Date(courier.breakUntil!).toLocaleTimeString('ar-EG', {
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </Body>
              <BreakCountdown until={courier.breakUntil!} />
              <ActionButton
                disabled={busyCourierId !== null}
                loading={busyCourierId === courier.id}
                onPress={() => void returnToWork(courier.id, courier.fullName)}
                tone="secondary"
              >
                فك البريك وإرجاعه للشغل
              </ActionButton>
            </View>
          ))}
        </Section>
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  courier: {
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.outline,
  },
  identity: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm },
  identityText: { flex: 1, gap: 4 },
  avatar: { width: 58, height: 58, borderRadius: 29, backgroundColor: colors.surfaceRaised },
  avatarPlaceholder: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
  },
  name: { color: colors.text, fontSize: 16, fontWeight: '700', textAlign: 'right' },
  detail: { color: colors.muted, fontSize: 13, textAlign: 'right' },
});
