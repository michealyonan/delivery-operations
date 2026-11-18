import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ActionButton, Body, Heading, Notice, Page, Section } from '../../components/ui';
import { useApp } from '../../state/app-context';
import { colors, spacing } from '../../theme';
import type { CourierShiftBooking, CourierShiftSlot } from '../../types';

const activeStatuses = ['booked', 'swap_listed'] as const;
const sevenDaysMs = 7 * 24 * 60 * 60_000;

function formatDay(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return date.toLocaleDateString('ar-EG', {
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

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = Math.round(minutes % 60);
  return `${hours} ساعة و${remainingMinutes} دقيقة`;
}

function startedForBooking(
  booking: CourierShiftBooking,
  shiftRecords: { bookingId?: number; startedAt?: string }[],
) {
  return shiftRecords.some(
    (record) => record.bookingId === booking.id && record.startedAt,
  );
}

export default function MyShiftsScreen() {
  const {
    profile,
    isDemo,
    shiftSlots,
    shiftBookings,
    shiftRecords,
    breakPeriods,
    shiftDayBlocks,
    bookShift,
    offerShiftSwap,
  } = useApp();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const initialTimer = setTimeout(() => setNow(Date.now()), 0);
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(timer);
    };
  }, []);
  const currentTime = now ?? 0;

  const courierId = profile?.courierId;
  const mine = shiftBookings.filter((booking) => booking.courierId === courierId);
  const myActiveBookings = mine
    .filter((booking) => activeStatuses.includes(booking.status as (typeof activeStatuses)[number]))
    .sort((a, b) => {
      const aSlot = shiftSlots.find((slot) => slot.id === a.slotId);
      const bSlot = shiftSlots.find((slot) => slot.id === b.slotId);
      return new Date(aSlot?.startsAt ?? 0).getTime() - new Date(bSlot?.startsAt ?? 0).getTime();
    });
  const myBookedSlotIds = new Set(
    mine
      .filter(
        (booking) =>
          booking.status === 'booked' ||
          booking.status === 'swap_listed' ||
          booking.status === 'completed',
      )
      .map((booking) => booking.slotId),
  );
  const availableSlots = shiftSlots
    .filter((slot) => {
      const start = new Date(slot.startsAt).getTime();
      return (
        !slot.isCancelled &&
        start > currentTime &&
        start <= currentTime + sevenDaysMs &&
        !myBookedSlotIds.has(slot.id) &&
        !shiftDayBlocks.some(
          (block) => block.courierId === courierId && block.shiftDate === slot.shiftDate,
        )
      );
    })
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  const history = shiftRecords
    .filter((record) => record.courierId === courierId && record.startedAt)
    .sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''));
  const bookedTimeById = new Map(
    mine.map((booking) => [
      booking.id,
      shiftSlots.find((slot) => slot.id === booking.slotId),
    ]),
  );

  const run = async (id: number, action: () => Promise<void>, success: string) => {
    setBusyId(id);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      await action();
      setSuccessMessage(success);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'تعذر تحديث الشفت.');
    } finally {
      setBusyId(null);
    }
  };

  if (profile?.role !== 'courier' || courierId == null) {
    return (
      <Page>
        <Heading>شيفتاتي</Heading>
        <Notice tone="danger">حجز الشفتات متاح لحساب المندوب فقط.</Notice>
      </Page>
    );
  }

  return (
    <Page>
      <Heading>شيفتاتي</Heading>
      <Body>احجز مواعيدك المتاحة خلال الأيام السبعة القادمة. لن يبدأ الشيفت قبل موعده بأكثر من 30 دقيقة.</Body>
      {isDemo ? <Notice tone="warning">الحجوزات في المعاينة تجريبية ولا تُحفظ في قاعدة البيانات.</Notice> : null}
      {errorMessage ? <Notice tone="danger">{errorMessage}</Notice> : null}
      {successMessage ? <Notice>{successMessage}</Notice> : null}

      <Section title={`المواعيد المتاحة · ${availableSlots.length}`}>
        {availableSlots.length === 0 ? (
          <Notice>لا توجد مواعيد منشورة ومتاحة للحجز خلال الأيام السبعة القادمة.</Notice>
        ) : (
          availableSlots.map((slot) => (
            <ShiftSlotRow
              key={slot.id}
              busy={busyId === slot.id}
              onBook={() =>
                void run(slot.id, () => bookShift(slot.id), 'تم حجز الشيفت.')
              }
              slot={slot}
            />
          ))
        )}
      </Section>

      <Section title={`حجوزاتي · ${myActiveBookings.length}`}>
        {myActiveBookings.length === 0 ? (
          <Notice>لم تحجز أي شيفت بعد.</Notice>
        ) : (
          myActiveBookings.map((booking) => {
            const slot = shiftSlots.find((item) => item.id === booking.slotId);
            if (!slot) return null;
            const started = startedForBooking(booking, shiftRecords);
            const isLate = !started && new Date(slot.startsAt).getTime() <= currentTime;
            return (
              <View key={booking.id} style={styles.row}>
                <Text style={styles.title}>{formatDay(slot.shiftDate)}</Text>
                <Text style={styles.detail}>
                  من {formatTime(slot.startsAt)} إلى {formatTime(slot.endsAt)}
                </Text>
                {booking.status === 'swap_listed' ? (
                  <Notice tone="warning">عرضت هذا الشيفت للتبديل؛ الإدارة تراه في قائمة الحجوزات.</Notice>
                ) : null}
                {isLate ? (
                  <Notice tone="danger">أنت متأخر عن موعد الشيفت؛ ابدأه الآن من الصفحة الرئيسية.</Notice>
                ) : null}
                {!started && booking.status === 'booked' ? (
                  <ActionButton
                    disabled={busyId !== null}
                    loading={busyId === booking.id}
                    onPress={() =>
                      void run(
                        booking.id,
                        () => offerShiftSwap(booking.id),
                        'تم عرض الشيفت للتبديل، وأصبح ظاهرًا للإدارة.',
                      )
                    }
                    tone="outline"
                  >
                    عرض الشيفت للتبديل
                  </ActionButton>
                ) : null}
              </View>
            );
          })
        )}
      </Section>

      <Section title="سجل ساعات العمل والبريكات">
        {history.length === 0 ? (
          <Body>سيظهر سجل ساعات عملك هنا بعد بدء أول شيفت محجوز.</Body>
        ) : (
          history.slice(0, 30).map((record) => {
            const end = record.endedAt ? new Date(record.endedAt).getTime() : currentTime;
            const start = new Date(record.startedAt!).getTime();
            const elapsed = Math.max(0, Math.round((end - start) / 60_000));
            const breaks = breakPeriods
              .filter((period) => period.shiftId === record.id)
              .reduce((total, period) => {
                const breakEnd = period.endedAt
                  ? new Date(period.endedAt).getTime()
                  : Math.min(currentTime, new Date(period.scheduledEndAt).getTime());
                return total + Math.max(0, (breakEnd - new Date(period.startedAt).getTime()) / 60_000);
              }, 0);
            const bookedSlot =
              record.bookingId == null ? undefined : bookedTimeById.get(record.bookingId);
            const lateMinutes =
              bookedSlot && start > new Date(bookedSlot.startsAt).getTime()
                ? Math.floor((start - new Date(bookedSlot.startsAt).getTime()) / 60_000)
                : 0;
            return (
              <View key={record.id} style={styles.row}>
                <Text style={styles.title}>{formatDay(record.startedAt!.slice(0, 10))}</Text>
                <Text style={styles.detail}>
                  بدأ {formatTime(record.startedAt!)} · {record.endedAt ? `انتهى ${formatTime(record.endedAt)}` : 'الشيفت مستمر'}
                </Text>
                <Text style={styles.detail}>مدة الشيفت: {formatDuration(elapsed)}</Text>
                <Text style={styles.detail}>وقت البريك: {formatDuration(breaks)}</Text>
                <Text style={[styles.detail, lateMinutes > 0 && styles.late]}>
                  {lateMinutes > 0 ? `تأخر ${formatDuration(lateMinutes)}` : 'بدأ في الموعد'}
                </Text>
              </View>
            );
          })
        )}
      </Section>
    </Page>
  );
}

function ShiftSlotRow({
  slot,
  busy,
  onBook,
}: {
  slot: CourierShiftSlot;
  busy: boolean;
  onBook: () => void;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.title}>{formatDay(slot.shiftDate)}</Text>
      <Text style={styles.detail}>
        من {formatTime(slot.startsAt)} إلى {formatTime(slot.endsAt)}
      </Text>
      <ActionButton disabled={busy} loading={busy} onPress={onBook} tone="secondary">
        احجز الشيفت
      </ActionButton>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.outline,
  },
  title: { color: colors.text, fontSize: 16, fontWeight: '700', textAlign: 'right' },
  detail: { color: colors.muted, fontSize: 14, textAlign: 'right', writingDirection: 'rtl' },
  late: { color: colors.danger, fontWeight: '700' },
});
