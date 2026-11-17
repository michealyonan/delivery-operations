import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ActionButton, Body, Heading, Notice, Page } from '../../../components/ui';
import { BreakCountdown } from '../../../components/break-countdown';
import { isBackendConfigured, supabase } from '../../../lib/supabase';
import { Alert } from '../../../lib/platform-alert';
import { useApp } from '../../../state/app-context';
import { colors, spacing } from '../../../theme';
import type { SupportConversation, SupportConversationStatus } from '../../../types';

const filters: { value: SupportConversationStatus | 'all'; label: string }[] = [
  { value: 'open', label: 'جديدة' },
  { value: 'in_progress', label: 'قيد المتابعة' },
  { value: 'resolved', label: 'تم الحل' },
  { value: 'all', label: 'الكل' },
];

const statusCopy: Record<SupportConversationStatus, { label: string; color: string; bg: string }> = {
  open: { label: 'جديدة', color: colors.warning, bg: colors.warningSurface },
  in_progress: { label: 'قيد المتابعة', color: colors.primary, bg: colors.surfaceRaised },
  resolved: { label: 'تم الحل', color: colors.success, bg: colors.successSurface },
};

function ConversationRow({ conversation }: { conversation: SupportConversation }) {
  const { profile } = useApp();
  const status = statusCopy[conversation.status];
  const staff = profile?.role === 'admin' || profile?.role === 'support';

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() =>
        router.push({
          pathname: '/(tabs)/support/[id]',
          params: { id: conversation.id },
        })
      }
      style={({ pressed }) => [styles.conversation, pressed && styles.pressed]}
    >
      <View style={styles.rowTop}>
        <View style={[styles.status, { backgroundColor: status.bg }]}>
          <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
        </View>
        <Text style={styles.subject} numberOfLines={1}>{conversation.subject}</Text>
      </View>
      <Text style={styles.meta} numberOfLines={1}>
        {staff
          ? `${conversation.requesterName} · ${conversation.requesterRole === 'courier' ? 'مندوب' : 'مطعم'}`
          : conversation.assignedName
            ? `موظف الدعم: ${conversation.assignedName}`
            : 'في انتظار رد فريق الدعم'}
        {conversation.relatedOrderCode ? ` · ${conversation.relatedOrderCode}` : ''}
      </Text>
      <Text style={styles.preview} numberOfLines={2}>{conversation.lastMessageBody}</Text>
      <Text style={styles.time}>
        {new Date(conversation.lastMessageAt).toLocaleString('ar-EG', {
          day: 'numeric',
          month: 'short',
          hour: 'numeric',
          minute: '2-digit',
        })}
      </Text>
    </Pressable>
  );
}

export default function SupportScreen() {
  const {
    profile,
    isDemo,
    breakRequestsEnabled,
    supportRevision,
    loadSupportConversations,
    requestCourierBreak,
    endCourierBreak,
    refresh,
  } = useApp();
  const staff = profile?.role === 'admin' || profile?.role === 'support';
  const [conversations, setConversations] = useState<SupportConversation[]>([]);
  const [filter, setFilter] = useState<SupportConversationStatus | 'all'>('all');
  const [busy, setBusy] = useState(true);
  const [breakBusy, setBreakBusy] = useState<number | null>(null);
  const [breakError, setBreakError] = useState('');
  const [breakMessage, setBreakMessage] = useState('');
  const [endingBreak, setEndingBreak] = useState(false);
  const [clock, setClock] = useState(0);

  useEffect(() => {
    const firstUpdate = setTimeout(() => setClock(Date.now()), 0);
    const timer = setInterval(() => setClock(Date.now()), 15_000);
    return () => {
      clearTimeout(firstUpdate);
      clearInterval(timer);
    };
  }, []);

  const load = useCallback(async () => {
    try {
      setConversations(await loadSupportConversations());
    } catch (error) {
      Alert.alert('تعذر تحميل محادثات الدعم', error instanceof Error ? error.message : 'حاول مرة أخرى.');
    } finally {
      setBusy(false);
    }
  }, [loadSupportConversations]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timer);
  }, [load, supportRevision]);

  useEffect(() => {
    if (isDemo || !isBackendConfigured || !supabase) return;
    const channel = supabase
      .channel(`support-inbox-${profile?.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_conversations' }, () => {
        void load();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_messages' }, () => {
        void load();
      })
    if (profile?.role === 'courier' && profile.courierId) {
      channel
        .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_settings' }, () => {
          refresh().catch((error: unknown) =>
            console.error('تعذر تحديث إعدادات البريك:', error),
          );
        })
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'courier_presence',
            filter: `courier_id=eq.${profile.courierId}`,
          },
          () => {
            refresh().catch((error: unknown) =>
              console.error('تعذر تحديث حالة بريك المندوب:', error),
            );
          },
        );
    }
    channel.subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error(`تعذر الاتصال الفوري بصندوق الدعم: ${status}`);
        }
      });
    return () => {
      void supabase?.removeChannel(channel);
    };
  }, [isDemo, load, profile?.courierId, profile?.id, profile?.role, refresh]);

  const visible = staff
    ? conversations.filter((conversation) => filter === 'all' || conversation.status === filter)
    : conversations;
  const breakUntil = profile?.breakUntil ? new Date(profile.breakUntil) : null;
  const isOnBreak = Boolean(breakUntil && breakUntil.getTime() > clock);
  const requestBreak = async (durationMinutes: number) => {
    setBreakError('');
    setBreakMessage('');
    setBreakBusy(durationMinutes);
    try {
      const endTime = await requestCourierBreak(durationMinutes);
      setBreakMessage(
        `بدأ البريك لمدة ${durationMinutes} دقيقة، وينتهي ${new Date(endTime).toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' })}.`,
      );
    } catch (error) {
      setBreakError(error instanceof Error ? error.message : 'تعذر طلب البريك.');
    } finally {
      setBreakBusy(null);
    }
  };
  const endOwnBreak = async () => {
    if (!profile?.courierId) return;
    setBreakError('');
    setEndingBreak(true);
    try {
      await endCourierBreak(profile.courierId);
      setBreakMessage('تم فك البريك، يمكنك الرجوع للشغل.');
    } catch (error) {
      setBreakError(error instanceof Error ? error.message : 'تعذر فك البريك.');
    } finally {
      setEndingBreak(false);
    }
  };

  return (
    <Page>
      <View style={styles.headingRow}>
        <Heading>{staff ? 'صندوق الدعم' : 'الدعم الفني'}</Heading>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="تحديث المحادثات"
          onPress={() => {
            setBusy(true);
            void load();
          }}
          style={styles.refreshButton}
        >
          <MaterialCommunityIcons name="refresh" size={22} color={colors.primary} />
        </Pressable>
      </View>
      {isDemo && (
        <Notice tone="warning">
          محادثات توضيحية على هذا الجهاز فقط؛ يلزم الاتصال بالخادم لتبادل رسائل حقيقية.
        </Notice>
      )}
      {profile?.role === 'admin' && (
        <ActionButton
          onPress={() => router.push('/(tabs)/support/staff')}
          tone="outline"
        >
          إدارة حسابات موظفي الدعم
        </ActionButton>
      )}
      {(profile?.role === 'courier' || profile?.role === 'restaurant') && (
        <>
          <Body>أرسل تفاصيل المشكلة لفريق الدعم وتابع الردود من هنا.</Body>
          <ActionButton onPress={() => router.push('/(tabs)/support/new')}>
            بدء محادثة جديدة
          </ActionButton>
        </>
      )}
      {profile?.role === 'courier' && (
        <View style={styles.breakSection}>
          <Text style={styles.breakTitle}>طلب بريك</Text>
          {isOnBreak && breakUntil ? (
            <>
              <Notice tone={profile.breakStartedBy === 'courier' ? 'info' : 'warning'}>
                {profile.breakStartedBy === 'courier'
                  ? 'أنت في بريك بدأته بنفسك.'
                  : 'أنت في بريك من الإدارة. الإدارة فقط يمكنها إرجاعك للشغل.'}
                {' '}ينتهي {breakUntil.toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' })}.
              </Notice>
              <BreakCountdown until={breakUntil.toISOString()} />
              {profile.breakStartedBy === 'courier' ? (
                <ActionButton
                  disabled={endingBreak}
                  loading={endingBreak}
                  onPress={() => void endOwnBreak()}
                  tone="secondary"
                >
                  فك البريك والرجوع للشغل
                </ActionButton>
              ) : null}
            </>
          ) : !breakRequestsEnabled ? (
            <Notice tone="warning">طلبات البريك متوقفة حاليًا من الإدارة بسبب ضغط الطلبات.</Notice>
          ) : !profile.isOnShift ? (
            <Notice>ابدأ الشيفت أولًا حتى تتمكن من طلب بريك.</Notice>
          ) : (
            <>
              <Body>سيبدأ البريك فورًا، ولن تصلك طلبات جديدة حتى انتهائه تلقائيًا.</Body>
              <View style={styles.breakChoices}>
                {[5, 10, 15, 20, 30, 60].map((duration) => (
                  <ActionButton
                    key={duration}
                    disabled={breakBusy !== null || !breakRequestsEnabled || !profile.isOnShift}
                    loading={breakBusy === duration}
                    onPress={() => void requestBreak(duration)}
                    tone="outline"
                  >
                    {duration} دقيقة
                  </ActionButton>
                ))}
              </View>
            </>
          )}
          {breakMessage ? <Notice tone="info">{breakMessage}</Notice> : null}
          {breakError ? <Notice tone="danger">{breakError}</Notice> : null}
        </View>
      )}
      {staff && (
        <View style={styles.filters}>
          {filters.map((item) => {
            const selected = filter === item.value;
            return (
              <Pressable
                key={item.value}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setFilter(item.value)}
                style={[styles.filter, selected && styles.filterSelected]}
              >
                <Text style={[styles.filterText, selected && styles.filterSelectedText]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
      {busy && conversations.length === 0 ? (
        <Notice>جارٍ تحميل المحادثات...</Notice>
      ) : visible.length === 0 ? (
        <View style={styles.empty}>
          <MaterialCommunityIcons
            name={staff ? 'inbox-outline' : 'message-text-outline'}
            size={32}
            color={colors.muted}
          />
          <Text style={styles.emptyTitle}>
            {staff ? 'لا توجد محادثات بهذه الحالة' : 'لا توجد محادثات دعم بعد'}
          </Text>
          <Text style={styles.emptyBody}>
            {staff
              ? 'ستظهر هنا رسائل المندوبين والمطاعم عند وصولها.'
              : 'ابدأ محادثة جديدة إذا احتجت مساعدة في طلب أو تشغيل التطبيق.'}
          </Text>
        </View>
      ) : (
        <View>
          {visible.map((conversation) => (
            <ConversationRow key={conversation.id} conversation={conversation} />
          ))}
        </View>
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  headingRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  refreshButton: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filters: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  filter: {
    minHeight: 44,
    paddingHorizontal: 13,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.outline,
    backgroundColor: colors.surface,
    justifyContent: 'center',
  },
  filterSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  filterSelectedText: { color: colors.white },
  conversation: {
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.outline,
    gap: 7,
  },
  pressed: { opacity: 0.72 },
  rowTop: { flexDirection: 'row-reverse', alignItems: 'center', gap: 9 },
  subject: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '800', textAlign: 'right' },
  status: { minHeight: 28, paddingHorizontal: 9, borderRadius: 14, justifyContent: 'center' },
  statusText: { fontSize: 11, fontWeight: '700' },
  meta: { color: colors.muted, fontSize: 13, textAlign: 'right' },
  preview: { color: colors.text, fontSize: 14, lineHeight: 21, textAlign: 'right' },
  time: { color: colors.muted, fontSize: 12, textAlign: 'right' },
  empty: { alignItems: 'center', gap: 9, paddingVertical: 36, paddingHorizontal: spacing.md },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '800', textAlign: 'center' },
  emptyBody: { color: colors.muted, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  breakSection: { gap: spacing.sm },
  breakTitle: { color: colors.text, fontSize: 18, fontWeight: '800', textAlign: 'right' },
  breakChoices: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.sm },
});
