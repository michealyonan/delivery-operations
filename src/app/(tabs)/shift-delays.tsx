import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ActionButton, Body, Heading, Notice, Page, Section } from '../../components/ui';
import { useApp } from '../../state/app-context';
import { colors, spacing } from '../../theme';

function formatDay(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString('ar-EG', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString('ar-EG', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function ShiftDelaysScreen() {
  const { profile, couriers, shiftSlots, shiftBookings, shiftRecords, refresh } = useApp();
  const [now, setNow] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const initialTimer = setTimeout(() => setNow(Date.now()), 0);
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(timer);
    };
  }, []);
  const currentTime = now ?? 0;

  const lateBookings = useMemo(
    () =>
      shiftBookings
        .filter((booking) => booking.status === 'booked' || booking.status === 'swap_listed')
        .map((booking) => ({
          booking,
          slot: shiftSlots.find((item) => item.id === booking.slotId),
          courier: couriers.find((item) => item.id === booking.courierId),
        }))
        .filter(
          (item): item is typeof item & { slot: NonNullable<typeof item.slot> } =>
            item.slot != null &&
            new Date(item.slot.startsAt).getTime() <= currentTime &&
            !shiftRecords.some(
              (record) => record.bookingId === item.booking.id && record.startedAt,
            ),
        )
        .sort((a, b) => a.slot.startsAt.localeCompare(b.slot.startsAt)),
    [couriers, currentTime, shiftBookings, shiftRecords, shiftSlots],
  );

  const reload = async () => {
    setRefreshing(true);
    setErrorMessage('');
    try {
      await refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'تعذر تحديث التأخيرات.');
    } finally {
      setRefreshing(false);
    }
  };

  if (profile?.role !== 'admin') {
    return (
      <Page>
        <Heading>تأخيرات الشيفت</Heading>
        <Notice tone="danger">هذه الصفحة متاحة للإدارة فقط.</Notice>
      </Page>
    );
  }

  return (
    <Page>
      <Heading>تأخيرات الشيفت</Heading>
      <Body>يظهر هنا كل مندوب حجز شيفتًا ولم يبدأه بعد موعد بدايته. يتحدث التأخير تلقائيًا كل نصف دقيقة.</Body>
      <ActionButton disabled={refreshing} loading={refreshing} onPress={() => void reload()} tone="outline">
        تحديث القائمة
      </ActionButton>
      {errorMessage ? <Notice tone="danger">{errorMessage}</Notice> : null}
      <Section title={`المتأخرون · ${lateBookings.length}`}>
        {lateBookings.length === 0 ? (
          <Notice>لا يوجد مندوبون متأخرون عن شيفتاتهم حاليًا.</Notice>
        ) : (
          lateBookings.map(({ booking, slot, courier }) => {
            const lateMinutes = Math.max(
              0,
              Math.floor((currentTime - new Date(slot.startsAt).getTime()) / 60_000),
            );
            const shiftEnded = currentTime >= new Date(slot.endsAt).getTime();
            return (
              <View key={booking.id} style={styles.row}>
                <Text style={styles.name}>{courier?.fullName ?? 'مندوب'} · {courier?.code ?? ''}</Text>
                <Text style={styles.detail}>{formatDay(slot.shiftDate)}</Text>
                <Text style={styles.detail}>
                  موعد الشيفت: {formatTime(slot.startsAt)}–{formatTime(slot.endsAt)}
                </Text>
                <Notice tone="danger">
                  {shiftEnded
                    ? `لم يبدأ الشيفت وانتهى موعده؛ تأخير ${lateMinutes} دقيقة.`
                    : `متأخر ${lateMinutes} دقيقة عن بداية الشيفت.`}
                </Notice>
              </View>
            );
          })
        )}
      </Section>
    </Page>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.outline,
  },
  name: { color: colors.text, fontSize: 16, fontWeight: '700', textAlign: 'right' },
  detail: { color: colors.muted, fontSize: 14, textAlign: 'right', writingDirection: 'rtl' },
});
