import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ActionButton, Body, Field, Heading, Notice, Page } from '../../../components/ui';
import { isBackendConfigured, supabase } from '../../../lib/supabase';
import { Alert } from '../../../lib/platform-alert';
import { useApp } from '../../../state/app-context';
import { colors, spacing } from '../../../theme';
import type { SupportConversation, SupportMessage } from '../../../types';

function statusLabel(status: SupportConversation['status']) {
  if (status === 'in_progress') return 'قيد المتابعة';
  if (status === 'resolved') return 'تم الحل';
  return 'جديدة';
}

export default function SupportConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    profile,
    isDemo,
    supportRevision,
    loadSupportConversations,
    loadSupportMessages,
    sendSupportMessage,
    claimSupportConversation,
    setSupportConversationStatus,
  } = useApp();
  const [conversation, setConversation] = useState<SupportConversation | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(true);
  const [sending, setSending] = useState(false);
  const staff = profile?.role === 'admin' || profile?.role === 'support';
  const canWork =
    staff &&
    (profile?.role === 'admin' || conversation?.assignedTo === profile?.id);

  const load = useCallback(async () => {
    try {
      const [conversations, nextMessages] = await Promise.all([
        loadSupportConversations(),
        loadSupportMessages(String(id)),
      ]);
      setConversation(conversations.find((item) => item.id === id) ?? null);
      setMessages(nextMessages);
    } catch (error) {
      Alert.alert('تعذر تحميل المحادثة', error instanceof Error ? error.message : 'حاول مرة أخرى.');
    } finally {
      setBusy(false);
    }
  }, [id, loadSupportConversations, loadSupportMessages]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timer);
  }, [load, supportRevision]);

  useEffect(() => {
    if (isDemo || !isBackendConfigured || !supabase || !id) return;
    const channel = supabase
      .channel(`support-conversation-${id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'support_messages',
          filter: `conversation_id=eq.${id}`,
        },
        () => {
          void load();
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'support_conversations',
          filter: `id=eq.${id}`,
        },
        () => {
          void load();
        },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error(`تعذر الاتصال الفوري بمحادثة الدعم: ${status}`);
        }
      });
    return () => {
      void supabase?.removeChannel(channel);
    };
  }, [id, isDemo, load]);

  const send = async () => {
    setSending(true);
    try {
      await sendSupportMessage(String(id), message);
      setMessage('');
    } catch (error) {
      Alert.alert('تعذر إرسال الرسالة', error instanceof Error ? error.message : 'حاول مرة أخرى.');
    } finally {
      setSending(false);
    }
  };

  const claim = async () => {
    try {
      await claimSupportConversation(String(id));
    } catch (error) {
      Alert.alert('تعذر استلام المحادثة', error instanceof Error ? error.message : 'حاول مرة أخرى.');
    }
  };

  const toggleResolved = async () => {
    if (!conversation) return;
    const nextStatus = conversation.status === 'resolved' ? 'open' : 'resolved';
    try {
      await setSupportConversationStatus(String(id), nextStatus);
    } catch (error) {
      Alert.alert('تعذر تحديث حالة المحادثة', error instanceof Error ? error.message : 'حاول مرة أخرى.');
    }
  };

  if (!busy && !conversation) {
    return (
      <Page>
        <Heading>المحادثة غير موجودة</Heading>
        <Notice>قد تكون هذه المحادثة غير متاحة لهذا الحساب أو تم حذفها.</Notice>
        <ActionButton onPress={() => router.back()} tone="outline">رجوع</ActionButton>
      </Page>
    );
  }

  return (
    <Page>
      <View style={styles.titleRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="العودة إلى صندوق الدعم"
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <MaterialCommunityIcons name="chevron-right" size={25} color={colors.primary} />
        </Pressable>
        <View style={styles.titleText}>
          <Heading>{conversation?.subject ?? 'محادثة الدعم'}</Heading>
          {conversation ? (
            <Body style={styles.subtitle}>
              {staff
                ? `${conversation.requesterName} · ${conversation.requesterRole === 'courier' ? 'مندوب' : 'مطعم'}`
                : `الحالة: ${statusLabel(conversation.status)}`}
            </Body>
          ) : null}
        </View>
      </View>

      {conversation?.relatedOrderCode && (
        <ActionButton
          onPress={() =>
            conversation.relatedOrderId &&
            router.push({
              pathname: '/(tabs)/order-detail',
              params: { id: String(conversation.relatedOrderId ?? '') },
            })
          }
          tone="outline"
        >
          عرض الطلب {conversation.relatedOrderCode}
        </ActionButton>
      )}

      {staff && conversation && (
        <View style={styles.staffActions}>
          {conversation.assignedTo ? (
            <Notice tone={canWork ? 'info' : 'warning'}>
              {canWork
                ? `مسؤول المتابعة: ${conversation.assignedName ?? profile?.name}`
                : `يتابعها ${conversation.assignedName ?? 'موظف آخر'}. يمكنك قراءة المحادثة.`}
            </Notice>
          ) : (
            <ActionButton onPress={claim} tone="secondary">
              استلام المحادثة ومتابعتها
            </ActionButton>
          )}
          {canWork && (
            <ActionButton
              onPress={toggleResolved}
              tone={conversation.status === 'resolved' ? 'outline' : 'primary'}
            >
              {conversation.status === 'resolved' ? 'إعادة فتح المحادثة' : 'تحديد المشكلة كتم حلها'}
            </ActionButton>
          )}
        </View>
      )}

      {busy && messages.length === 0 ? (
        <Notice>جارٍ تحميل الرسائل...</Notice>
      ) : (
        <View style={styles.messages}>
          {messages.map((item) => {
            const own = item.senderId === profile?.id;
            return (
              <View
                key={item.id}
                style={[styles.messageRow, own ? styles.ownRow : styles.otherRow]}
              >
                <View style={[styles.bubble, own ? styles.ownBubble : styles.otherBubble]}>
                  {!own ? (
                    <Text style={styles.sender}>
                      {item.senderRole === 'support'
                        ? conversation?.assignedName ?? 'موظف الدعم'
                        : item.senderName}
                    </Text>
                  ) : null}
                  <Text style={[styles.messageText, own && styles.ownMessageText]}>
                    {item.body}
                  </Text>
                  <Text style={[styles.messageTime, own && styles.ownMessageTime]}>
                    {new Date(item.createdAt).toLocaleTimeString('ar-EG', {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
              </View>
            );
          })}
          {messages.length === 0 && (
            <Body>ابدأ المحادثة بكتابة رسالتك.</Body>
          )}
        </View>
      )}

      {conversation?.status === 'resolved' && !staff ? (
        <Notice>تم حل المشكلة وإغلاق المحادثة. لا يمكن إرسال رسائل جديدة.</Notice>
      ) : (
        <View style={styles.composer}>
          <Field
            accessibilityLabel="اكتب رسالة الدعم"
            editable={!sending}
            label="رسالتك"
            maxLength={4000}
            multiline
            onChangeText={setMessage}
            placeholder="اكتب تفاصيل أو ردًا..."
            value={message}
          />
          <ActionButton
            disabled={!message.trim() || Boolean(staff && !canWork)}
            loading={sending}
            onPress={send}
          >
            إرسال الرسالة
          </ActionButton>
        </View>
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm },
  backButton: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleText: { flex: 1, gap: 5 },
  subtitle: { color: colors.muted, fontSize: 13 },
  staffActions: { gap: spacing.sm },
  messages: { gap: spacing.md, paddingVertical: spacing.sm },
  messageRow: { width: '100%', flexDirection: 'row' },
  ownRow: { justifyContent: 'flex-start' },
  otherRow: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '88%', minWidth: 140, padding: 12, borderRadius: 16, gap: 5 },
  ownBubble: { backgroundColor: colors.primary },
  otherBubble: { backgroundColor: colors.surface },
  sender: { color: colors.primaryDark, fontSize: 12, fontWeight: '800', textAlign: 'right' },
  messageText: { color: colors.text, fontSize: 15, lineHeight: 22, textAlign: 'right' },
  ownMessageText: { color: colors.white },
  messageTime: { color: colors.muted, fontSize: 11, textAlign: 'left' },
  ownMessageTime: { color: '#D6E4F4' },
  composer: { gap: spacing.sm, paddingTop: spacing.sm },
});
