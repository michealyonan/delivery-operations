import { useEffect, useState } from 'react';
import { Platform, Share, StyleSheet, Text, View } from 'react-native';

import DatePicker from '../../components/date-picker';
import { ActionButton, Body, Field, Heading, Notice, Page, Section } from '../../components/ui';
import { useApp } from '../../state/app-context';
import { colors, spacing } from '../../theme';
import type { CourierShiftBooking, CourierShiftSlot } from '../../types';

const activeBookingStatuses = ['booked', 'swap_listed', 'completed'];
const windowMs = 7 * 24 * 60 * 60_000;

function localDateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

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

function formatDuration(minutes: number) {
  const total = Math.round(minutes);
  return `${Math.floor(total / 60)} ساعة و${total % 60} دقيقة`;
}

function elapsedMinutes(start: string | undefined, end: string | undefined, now: number) {
  if (!start) return 0;
  return Math.max(
    0,
    ((end ? new Date(end).getTime() : now) - new Date(start).getTime()) / 60_000,
  );
}

function quoteCsv(value: string | number) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

export default function AdminShiftsScreen() {
  const {
    profile,
    couriers,
    shiftSlots,
    shiftBookings,
    shiftRecords,
    breakPeriods,
    shiftDayBlocks,
    publishShiftSlots,
    removeCourierShift,
    blockCourierShiftDay,
    unblockCourierShiftDay,
    notifyUnbookedCouriers,
    isDemo,
  } = useApp();
  const today = new Date();
  const defaultStart = new Date(today);
  defaultStart.setDate(defaultStart.getDate() + 1);
  const defaultEnd = new Date(defaultStart);
  defaultEnd.setDate(defaultEnd.getDate() + 6);
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [courierSearch, setCourierSearch] = useState('');
  const [selectedCourierId, setSelectedCourierId] = useState<number | null>(null);
  const [blockedDate, setBlockedDate] = useState(today);
  const [blockReason, setBlockReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [notificationResult, setNotificationResult] = useState('');
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const initialTimer = setTimeout(() => setNow(Date.now()), 0);
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(timer);
    };
  }, []);
  const currentTime = now ?? 0;

  const rangeStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const rangeEnd = rangeStart + windowMs;
  const scheduleBookings = shiftBookings
    .filter((booking) => activeBookingStatuses.includes(booking.status))
    .map((booking) => ({
      booking,
      slot: shiftSlots.find((slot) => slot.id === booking.slotId),
    }))
    .filter(
      (item): item is { booking: CourierShiftBooking; slot: CourierShiftSlot } =>
        item.slot != null &&
        new Date(item.slot.startsAt).getTime() >= rangeStart &&
        new Date(item.slot.startsAt).getTime() < rangeEnd,
    )
    .sort((a, b) => a.slot.startsAt.localeCompare(b.slot.startsAt));

  const bookedCourierIds = new Set(scheduleBookings.map(({ booking }) => booking.courierId));
  const activeCouriers = couriers.filter((courier) => courier.isActive && !courier.isTerminated);
  const unbookedCouriers = activeCouriers.filter((courier) => !bookedCourierIds.has(courier.id));
  const bookedHours = scheduleBookings.reduce(
    (total, { slot }) =>
      total + (new Date(slot.endsAt).getTime() - new Date(slot.startsAt).getTime()) / 3_600_000,
    0,
  );
  const shiftRecordByBooking = new Map(
    shiftRecords
      .filter((record) => record.bookingId != null)
      .map((record) => [record.bookingId!, record]),
  );
  const filteredCouriers = couriers.filter((courier) => {
    const query = courierSearch.trim().toLocaleLowerCase();
    return !query || courier.code.toLocaleLowerCase().includes(query) ||
      courier.fullName.toLocaleLowerCase().includes(query);
  });

  const groupedBookings = activeCouriers.map((courier) => ({
    courier,
    bookings: scheduleBookings.filter(({ booking }) => booking.courierId === courier.id),
  }));

  const run = async (action: () => Promise<void>, success: string) => {
    setBusy(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      await action();
      setSuccessMessage(success);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'تعذر تنفيذ الإجراء.');
    } finally {
      setBusy(false);
    }
  };

  const publishSchedule = async () => {
    const startParts = startTime.split(':').map(Number);
    const endParts = endTime.split(':').map(Number);
    if (
      startParts.length !== 2 ||
      endParts.length !== 2 ||
      startParts.some((part) => !Number.isInteger(part)) ||
      endParts.some((part) => !Number.isInteger(part)) ||
      startParts[0] < 0 ||
      startParts[0] > 23 ||
      endParts[0] < 0 ||
      endParts[0] > 23 ||
      startParts[1] < 0 ||
      startParts[1] > 59 ||
      endParts[1] < 0 ||
      endParts[1] > 59
    ) {
      setErrorMessage('اكتب وقت البداية والنهاية بصيغة 24 ساعة HH:MM.');
      return;
    }
    const first = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    const last = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
    const dayCount = Math.floor((last.getTime() - first.getTime()) / 86_400_000) + 1;
    if (dayCount < 1 || dayCount > 90) {
      setErrorMessage('اختر فترة من يوم إلى 90 يومًا.');
      return;
    }
    const slots = [];
    for (let offset = 0; offset < dayCount; offset += 1) {
      const date = new Date(first);
      date.setDate(first.getDate() + offset);
      const startsAt = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        startParts[0],
        startParts[1],
      );
      const endsAt = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        endParts[0],
        endParts[1],
      );
      if (endsAt <= startsAt) endsAt.setDate(endsAt.getDate() + 1);
      slots.push({
        shiftDate: localDateString(date),
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
      });
    }
    setBusy(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const created = await publishShiftSlots(slots);
      setSuccessMessage(
        created === 0
          ? 'المواعيد موجودة بالفعل؛ لم تتم إضافة تكرارات.'
          : `تم نشر ${created} موعدًا متاحًا لجميع المندوبين.`,
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'تعذر نشر مواعيد الشفتات.');
    } finally {
      setBusy(false);
    }
  };

  const sendReminder = async () => {
    setBusy(true);
    setErrorMessage('');
    setNotificationResult('');
    try {
      const result = await notifyUnbookedCouriers();
      setNotificationResult(
        `تم إرسال ${result.sent} إشعارًا. غير المسجلين للإشعارات: ${result.skipped}، وفشل إرسال ${result.failed} إشعارًا.`,
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'تعذر إرسال تذكيرات الحجز.');
    } finally {
      setBusy(false);
    }
  };

  const exportSchedule = async () => {
    const rows = [
      ['كود المندوب', 'اسم المندوب', 'التاريخ', 'بداية الشيفت', 'نهاية الشيفت', 'حالة الحجز', 'بداية العمل', 'نهاية العمل', 'ساعات العمل الصافية', 'وقت البريك بالدقائق', 'التأخير بالدقائق'],
      ...scheduleBookings.map(({ booking, slot }) => {
        const courier = couriers.find((item) => item.id === booking.courierId);
        const shift = shiftRecordByBooking.get(booking.id);
        const shiftMinutes = elapsedMinutes(shift?.startedAt, shift?.endedAt, currentTime);
        const breakMinutes = breakPeriods
          .filter((period) => period.shiftId === shift?.id)
          .reduce(
            (total, period) =>
              total +
              elapsedMinutes(
                period.startedAt,
                period.endedAt ??
                  (new Date(period.scheduledEndAt).getTime() < currentTime
                    ? period.scheduledEndAt
                    : undefined),
                currentTime,
              ),
            0,
          );
        const lateMinutes =
          shift?.startedAt && new Date(shift.startedAt) > new Date(slot.startsAt)
            ? Math.floor(
                (new Date(shift.startedAt).getTime() - new Date(slot.startsAt).getTime()) /
                  60_000,
              )
            : shift
              ? 0
              : Math.max(0, Math.floor((currentTime - new Date(slot.startsAt).getTime()) / 60_000));
        return [
          courier?.code ?? '',
          courier?.fullName ?? '',
          slot.shiftDate,
          formatTime(slot.startsAt),
          formatTime(slot.endsAt),
          booking.status === 'swap_listed' ? 'معروض للتبديل' : 'محجوز',
          shift?.startedAt ? formatTime(shift.startedAt) : '',
          shift?.endedAt ? formatTime(shift.endedAt) : '',
          ((shiftMinutes - breakMinutes) / 60).toFixed(2),
          Math.round(breakMinutes),
          lateMinutes,
        ];
      }),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(quoteCsv).join(',')).join('\r\n')}`;
    if (Platform.OS === 'web') {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `courier-shifts-${localDateString(new Date())}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      return;
    }
    await Share.share({ title: 'جدول شفتات المندوبين', message: csv });
  };

  const removeShift = (bookingId: number) =>
    void run(() => removeCourierShift(bookingId), 'تم رفع الشيفت من جدول المندوب.');
  const blockDay = () => {
    if (selectedCourierId == null) {
      setErrorMessage('اختر المندوب الذي تريد إيقافه في هذا اليوم.');
      return;
    }
    void run(
      () =>
        blockCourierShiftDay(
          selectedCourierId,
          localDateString(blockedDate),
          blockReason,
        ),
      'تم إيقاف المندوب في اليوم المحدد وإلغاء حجزه إن وجد.',
    );
  };

  if (profile?.role !== 'admin') {
    return (
      <Page>
        <Heading>إدارة الشفتات</Heading>
        <Notice tone="danger">إدارة مواعيد الشفتات متاحة للإدارة فقط.</Notice>
      </Page>
    );
  }

  return (
    <Page>
      <Heading>إدارة الشفتات</Heading>
      {isDemo ? <Notice tone="warning">هذه بيانات تجريبية داخل هذا الجهاز فقط.</Notice> : null}
      {errorMessage ? <Notice tone="danger">{errorMessage}</Notice> : null}
      {successMessage ? <Notice>{successMessage}</Notice> : null}
      {notificationResult ? <Notice>{notificationResult}</Notice> : null}

      <Section title="ملخص الأيام السبعة القادمة">
        <View style={styles.metrics}>
          <Metric label="مندوبون حجزوا" value={String(bookedCourierIds.size)} />
          <Metric label="ساعات محجوزة" value={bookedHours.toFixed(1)} />
          <Metric label="مواعيد محجوزة" value={String(scheduleBookings.length)} />
          <Metric label="مندوبون بلا حجز" value={String(unbookedCouriers.length)} />
        </View>
        <ActionButton
          disabled={busy || unbookedCouriers.length === 0}
          loading={busy}
          onPress={() => void sendReminder()}
          tone="secondary"
        >
          إرسال إشعار للمندوبين غير الحاجزين
        </ActionButton>
        <ActionButton onPress={() => void exportSchedule()} tone="outline">
          تنزيل جدول الشفتات بصيغة Excel
        </ActionButton>
      </Section>

      <Section title="نشر مواعيد متاحة للجميع">
        <Body>أنشئ فترة زمنية واحدة أو متكررة يوميًا على مدى الفترة المحددة. يستطيع كل مندوب حجز شيفت واحد في اليوم.</Body>
        <DatePicker label="من تاريخ" value={startDate} onChange={setStartDate} />
        <DatePicker label="إلى تاريخ" value={endDate} onChange={setEndDate} />
        <Field
          autoCapitalize="none"
          label="وقت بداية الشيفت (HH:MM)"
          onChangeText={setStartTime}
          placeholder="09:00"
          value={startTime}
        />
        <Field
          autoCapitalize="none"
          label="وقت نهاية الشيفت (HH:MM)"
          onChangeText={setEndTime}
          placeholder="17:00"
          value={endTime}
        />
        <ActionButton disabled={busy} loading={busy} onPress={() => void publishSchedule()}>
          نشر المواعيد لجميع المندوبين
        </ActionButton>
      </Section>

      <Section title="حجوزات المندوبين اليومية">
        {groupedBookings.length === 0 ? <Notice>لا توجد حسابات مندوبين.</Notice> : null}
        {groupedBookings.map(({ courier, bookings }) => (
          <View key={courier.id} style={styles.courierGroup}>
            <Text style={styles.courierTitle}>{courier.fullName} · {courier.code}</Text>
            {bookings.length === 0 ? (
              <Text style={styles.detail}>لا توجد حجوزات في الأيام السبعة القادمة.</Text>
            ) : (
              bookings.map(({ booking, slot }) => {
                const shift = shiftRecordByBooking.get(booking.id);
                const isLate =
                  ['booked', 'swap_listed'].includes(booking.status) &&
                  new Date(slot.startsAt).getTime() <= currentTime &&
                  !shift?.startedAt;
                return (
                  <View key={booking.id} style={styles.bookingRow}>
                    <Text style={styles.detail}>{formatDay(slot.shiftDate)}</Text>
                    <Text style={styles.detail}>{formatTime(slot.startsAt)}–{formatTime(slot.endsAt)}</Text>
                    {booking.status === 'swap_listed' ? (
                      <Notice tone="warning">عرض الشيفت للتبديل</Notice>
                    ) : null}
                    {isLate ? <Notice tone="danger">متأخر عن بداية الشيفت</Notice> : null}
                    <ActionButton
                      disabled={busy || booking.status === 'completed'}
                      onPress={() => removeShift(booking.id)}
                      tone="danger"
                    >
                      رفع الشيفت من المندوب
                    </ActionButton>
                  </View>
                );
              })
            )}
          </View>
        ))}
      </Section>

      <Section title="منع العمل في يوم محدد">
        <Field
          autoCapitalize="none"
          label="ابحث باسم المندوب أو رقمه"
          onChangeText={setCourierSearch}
          placeholder="CR-000001"
          value={courierSearch}
        />
        {filteredCouriers.slice(0, 8).map((courier) => (
          <ActionButton
            key={courier.id}
            onPress={() => setSelectedCourierId(courier.id)}
            tone={selectedCourierId === courier.id ? 'secondary' : 'outline'}
          >
            {courier.fullName} · {courier.code}
          </ActionButton>
        ))}
        <DatePicker label="اليوم الموقوف" value={blockedDate} onChange={setBlockedDate} />
        <Field
          label="سبب الإيقاف (اختياري)"
          onChangeText={setBlockReason}
          value={blockReason}
        />
        <ActionButton disabled={busy || selectedCourierId == null} onPress={blockDay} tone="danger">
          منع المندوب وإلغاء حجزه في هذا اليوم
        </ActionButton>
        {shiftDayBlocks.length === 0 ? (
          <Body>لا توجد أيام عمل موقوفة.</Body>
        ) : (
          shiftDayBlocks.map((block) => {
            const courier = couriers.find((item) => item.id === block.courierId);
            return (
              <View key={`${block.courierId}-${block.shiftDate}`} style={styles.bookingRow}>
                <Text style={styles.detail}>
                  {courier?.fullName ?? 'مندوب'} · {formatDay(block.shiftDate)}
                </Text>
                {block.reason ? <Text style={styles.detail}>السبب: {block.reason}</Text> : null}
                <ActionButton
                  onPress={() => {
                    setBusy(true);
                    setErrorMessage('');
                    unblockCourierShiftDay(block.courierId, block.shiftDate)
                      .then(() => setSuccessMessage('تم إلغاء إيقاف هذا اليوم.'))
                      .catch((error: unknown) =>
                        setErrorMessage(error instanceof Error ? error.message : 'تعذر إلغاء الإيقاف.'),
                      )
                      .finally(() => setBusy(false));
                  }}
                  tone="outline"
                >
                  السماح بالعمل في هذا اليوم
                </ActionButton>
              </View>
            );
          })
        )}
      </Section>

      <Section title="ساعات العمل والبريكات">
        {activeCouriers.map((courier) => {
          const records = shiftRecords.filter((record) => record.courierId === courier.id);
          const shiftMinutes = records.reduce(
            (total, record) => total + elapsedMinutes(record.startedAt, record.endedAt, currentTime),
            0,
          );
          const totalBreakMinutes = breakPeriods
            .filter((period) => period.courierId === courier.id)
            .reduce(
              (total, period) =>
                total +
                elapsedMinutes(
                  period.startedAt,
                  period.endedAt ??
                    (new Date(period.scheduledEndAt).getTime() < currentTime
                      ? period.scheduledEndAt
                      : undefined),
                  currentTime,
                ),
              0,
            );
          const totalWorkMinutes = Math.max(0, shiftMinutes - totalBreakMinutes);
          return (
            <View key={courier.id} style={styles.bookingRow}>
              <Text style={styles.courierTitle}>{courier.fullName} · {courier.code}</Text>
              <Text style={styles.detail}>صافي ساعات العمل: {formatDuration(totalWorkMinutes)}</Text>
              <Text style={styles.detail}>إجمالي وقت البريك: {formatDuration(totalBreakMinutes)}</Text>
            </View>
          );
        })}
      </Section>
    </Page>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  metrics: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.sm },
  metric: {
    flexBasis: '47%',
    flexGrow: 1,
    gap: spacing.xs,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 12,
  },
  metricValue: { color: colors.primaryDark, fontSize: 20, fontWeight: '800', textAlign: 'right' },
  metricLabel: { color: colors.muted, fontSize: 13, textAlign: 'right', writingDirection: 'rtl' },
  courierGroup: { gap: spacing.sm, paddingVertical: spacing.md },
  bookingRow: {
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.outline,
  },
  courierTitle: { color: colors.text, fontSize: 16, fontWeight: '700', textAlign: 'right' },
  detail: { color: colors.muted, fontSize: 14, textAlign: 'right', writingDirection: 'rtl' },
});
