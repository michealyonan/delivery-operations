import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ImagePickerAsset } from 'expo-image-picker';
import { useState } from 'react';
import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ActionButton, Body, Field, Heading, Notice, Page, Section } from '../../components/ui';
import { useApp } from '../../state/app-context';
import { colors, spacing } from '../../theme';

const maxImageSize = 8 * 1024 * 1024;

function isEligibleCourier(courier: {
  isActive: boolean;
  isTerminated: boolean;
  contractEndDate: string;
}) {
  return (
    courier.isActive &&
    !courier.isTerminated &&
    courier.contractEndDate >= new Date().toISOString().slice(0, 10)
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('ar-EG', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function NotificationsScreen() {
  const {
    profile,
    courierNotifications,
    couriers,
    isDemo,
    markCourierNotificationRead,
    registerCourierPushToken,
    sendCourierNotification,
  } = useApp();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [pickedImage, setPickedImage] = useState<ImagePickerAsset | null>(null);
  const [recipientMode, setRecipientMode] = useState<'all' | 'selected'>('all');
  const [selectedCourierIds, setSelectedCourierIds] = useState<number[]>([]);
  const [courierSearch, setCourierSearch] = useState('');
  const [sending, setSending] = useState(false);
  const [sendingError, setSendingError] = useState('');
  const [sendingSuccess, setSendingSuccess] = useState('');
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState('');
  const [pushSuccess, setPushSuccess] = useState('');
  const [readingId, setReadingId] = useState('');
  const [readError, setReadError] = useState('');

  const eligibleCouriers = couriers.filter(isEligibleCourier);
  const filteredCouriers = eligibleCouriers.filter((courier) => {
    const search = courierSearch.trim().toLocaleLowerCase();
    return (
      !search ||
      courier.fullName.toLocaleLowerCase().includes(search) ||
      courier.code.toLocaleLowerCase().includes(search)
    );
  });

  const chooseImage = async () => {
    setSendingError('');
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
        base64: true,
      });
      if (result.canceled) return;
      const image = result.assets[0];
      if (image.fileSize && image.fileSize > maxImageSize) {
        throw new Error('حجم الصورة يتجاوز الحد المسموح (8 ميجابايت).');
      }
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(image.mimeType ?? '')) {
        throw new Error('اختر صورة بصيغة JPG أو PNG أو WebP.');
      }
      setPickedImage(image);
    } catch (error) {
      setSendingError(error instanceof Error ? error.message : 'تعذر اختيار الصورة.');
    }
  };

  const send = async () => {
    setSending(true);
    setSendingError('');
    setSendingSuccess('');
    try {
      if (recipientMode === 'selected' && selectedCourierIds.length === 0) {
        throw new Error('اختر مندوبًا واحدًا على الأقل.');
      }
      const result = await sendCourierNotification({
        title,
        body,
        ...(pickedImage ? { image: pickedImage } : {}),
        ...(recipientMode === 'selected' ? { courierIds: selectedCourierIds } : {}),
      });
      setTitle('');
      setBody('');
      setPickedImage(null);
      setSelectedCourierIds([]);
      setSendingSuccess(`تم حفظ الإشعار وإرساله إلى ${result.recipientCount} مندوب.`);
      if (result.pushError) {
        setSendingError(`حُفظ الإشعار، لكن تعذر إرسال تنبيه الهاتف: ${result.pushError}`);
      } else {
        setSendingSuccess(
          `تم حفظ الإشعار وإرساله إلى ${result.recipientCount} مندوب. وصل تنبيه الهاتف إلى ${result.pushSent} جهاز، وتعذر إرساله إلى ${result.pushFailed} جهاز، ولم يفعّل ${result.pushSkipped} مندوب إشعارات الهاتف.`,
        );
      }
    } catch (error) {
      setSendingError(error instanceof Error ? error.message : 'تعذر إرسال الإشعار.');
    } finally {
      setSending(false);
    }
  };

  const enablePushNotifications = async () => {
    setPushBusy(true);
    setPushError('');
    setPushSuccess('');
    try {
      const platform = Platform.OS;
      if (platform === 'web') {
        throw new Error('تفعيل تنبيهات الهاتف متاح من تطبيق Android أو iPhone.');
      }
      if (platform !== 'ios' && platform !== 'android') {
        throw new Error('تفعيل تنبيهات الهاتف غير مدعوم على هذا الجهاز.');
      }
      if (isDemo) {
        throw new Error('تفعيل تنبيهات الهاتف يحتاج إلى حساب متصل.');
      }
      const Notifications = await import('expo-notifications');
      if (platform === 'android') {
        await Notifications.setNotificationChannelAsync('management-updates', {
          name: 'إشعارات الإدارة',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
        });
      }
      const existing = await Notifications.getPermissionsAsync();
      const permission =
        existing.status === 'granted'
          ? existing
          : await Notifications.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        throw new Error('لم يتم منح صلاحية الإشعارات. فعّلها من إعدادات الجهاز ثم أعد المحاولة.');
      }
      const projectId =
        Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
      if (!projectId) throw new Error('تعذر العثور على إعداد مشروع إشعارات التطبيق.');
      const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      await registerCourierPushToken(token, platform);
      setPushSuccess('تم تفعيل إشعارات الهاتف على هذا الجهاز.');
    } catch (error) {
      setPushError(error instanceof Error ? error.message : 'تعذر تفعيل إشعارات الهاتف.');
    } finally {
      setPushBusy(false);
    }
  };

  if (profile?.role === 'admin') {
    return (
      <Page>
        <Heading>إشعارات المندوبين</Heading>
        <Body>أرسل رسالة أو صورة إلى المندوبين النشطين. تختفي الإشعارات تلقائيًا بعد 15 يومًا.</Body>

        <Section title="المستلمون">
          <View style={styles.segmented}>
            <ActionButton
              onPress={() => setRecipientMode('all')}
              tone={recipientMode === 'all' ? 'primary' : 'outline'}
            >
              كل المندوبين النشطين
            </ActionButton>
            <ActionButton
              onPress={() => setRecipientMode('selected')}
              tone={recipientMode === 'selected' ? 'primary' : 'outline'}
            >
              تحديد مندوبين
            </ActionButton>
          </View>
          {recipientMode === 'selected' ? (
            <>
              <Field
                autoCapitalize="none"
                autoCorrect={false}
                label="ابحث بالاسم أو رقم المندوب"
                onChangeText={setCourierSearch}
                placeholder="اسم المندوب أو رقمه"
                value={courierSearch}
              />
              {filteredCouriers.length === 0 ? (
                <Notice>لا يوجد مندوب نشط مطابق للبحث.</Notice>
              ) : (
                <View style={styles.courierList}>
                  {filteredCouriers.map((courier) => {
                    const selected = selectedCourierIds.includes(courier.id);
                    return (
                      <Pressable
                        key={courier.id}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: selected }}
                        onPress={() =>
                          setSelectedCourierIds((current) =>
                            selected
                              ? current.filter((id) => id !== courier.id)
                              : [...current, courier.id],
                          )
                        }
                        style={styles.courierRow}
                      >
                        <View style={styles.courierIdentity}>
                          <Text style={styles.courierName}>{courier.fullName}</Text>
                          <Text style={styles.courierCode}>{courier.code}</Text>
                        </View>
                        <MaterialCommunityIcons
                          color={selected ? colors.primary : colors.muted}
                          name={selected ? 'checkbox-marked' : 'checkbox-blank-outline'}
                          size={24}
                        />
                      </Pressable>
                    );
                  })}
                </View>
              )}
              <Body>تم تحديد {selectedCourierIds.length} مندوب.</Body>
            </>
          ) : (
            <Body>سيصل الإشعار إلى {eligibleCouriers.length} مندوب نشط.</Body>
          )}
        </Section>

        <Section title="محتوى الإشعار">
          <Field
            label="العنوان"
            maxLength={120}
            onChangeText={setTitle}
            placeholder="عنوان واضح للمندوب"
            value={title}
          />
          <Field
            label="الرسالة"
            maxLength={2000}
            multiline
            onChangeText={setBody}
            placeholder="اكتب تفاصيل الإشعار"
            value={body}
          />
          {pickedImage ? (
            <View style={styles.imageAttachment}>
              <Image source={{ uri: pickedImage.uri }} style={styles.previewImage} />
              <ActionButton
                onPress={() => setPickedImage(null)}
                tone="outline"
              >
                إزالة الصورة
              </ActionButton>
            </View>
          ) : null}
          <ActionButton onPress={() => void chooseImage()} tone="outline">
            {pickedImage ? 'تغيير الصورة' : 'إرفاق صورة'}
          </ActionButton>
        </Section>

        {sendingError ? <Notice tone="danger">{sendingError}</Notice> : null}
        {sendingSuccess ? <Notice>{sendingSuccess}</Notice> : null}
        <ActionButton
          disabled={
            sending ||
            !title.trim() ||
            (!body.trim() && !pickedImage) ||
            (recipientMode === 'selected' && selectedCourierIds.length === 0)
          }
          loading={sending}
          onPress={() => void send()}
        >
          إرسال الإشعار
        </ActionButton>
      </Page>
    );
  }

  if (profile?.role === 'courier') {
    const unreadCount = courierNotifications.filter((notification) => !notification.readAt).length;
    return (
      <Page>
        <Heading>إشعاراتي</Heading>
        <Section title="تنبيهات الجهاز">
          <Body>فعّل الإشعارات لتصلك تنبيهات الإدارة حتى عند إغلاق التطبيق.</Body>
          {pushError ? <Notice tone="danger">{pushError}</Notice> : null}
          {pushSuccess ? <Notice>{pushSuccess}</Notice> : null}
          <ActionButton
            disabled={pushBusy}
            loading={pushBusy}
            onPress={() => void enablePushNotifications()}
            tone="outline"
          >
            تفعيل إشعارات الهاتف
          </ActionButton>
        </Section>

        <Section title={`الوارد${unreadCount ? ` · ${unreadCount} غير مقروء` : ''}`}>
          {readError ? <Notice tone="danger">{readError}</Notice> : null}
          {courierNotifications.length === 0 ? (
            <Notice>لا توجد إشعارات حاليًا. ستظهر رسائل الإدارة هنا.</Notice>
          ) : (
            courierNotifications.map((notification) => (
              <View
                key={notification.id}
                style={[
                  styles.notification,
                  !notification.readAt && styles.notificationUnread,
                ]}
              >
                <View style={styles.notificationHeading}>
                  <Text style={styles.notificationTitle}>{notification.title}</Text>
                  {!notification.readAt ? <View style={styles.unreadDot} /> : null}
                </View>
                <Body>{notification.body || 'أرسلت الإدارة صورة.'}</Body>
                {notification.imageUrl ? (
                  <Image
                    accessibilityLabel={`صورة مرفقة: ${notification.title}`}
                    resizeMode="contain"
                    source={{ uri: notification.imageUrl }}
                    style={styles.notificationImage}
                  />
                ) : null}
                <Text style={styles.notificationMeta}>
                  أُرسل {formatDate(notification.createdAt)} · ينتهي {formatDate(notification.expiresAt)}
                </Text>
                {!notification.readAt ? (
                  <ActionButton
                    disabled={readingId === notification.id}
                    loading={readingId === notification.id}
                    onPress={() => {
                      setReadingId(notification.id);
                      setReadError('');
                      void markCourierNotificationRead(notification.id)
                        .catch((error: unknown) => {
                          setReadError(
                            error instanceof Error ? error.message : 'تعذر تحديث حالة الإشعار.',
                          );
                        })
                        .finally(() => setReadingId(''));
                    }}
                    tone="outline"
                  >
                    تحديد كمقروء
                  </ActionButton>
                ) : null}
              </View>
            ))
          )}
        </Section>
      </Page>
    );
  }

  return (
    <Page>
      <Heading>الإشعارات</Heading>
      <Notice tone="danger">الإشعارات متاحة للإدارة والمندوبين فقط.</Notice>
    </Page>
  );
}

const styles = StyleSheet.create({
  segmented: {
    gap: spacing.sm,
  },
  courierList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.outline,
  },
  courierRow: {
    minHeight: 56,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.outline,
  },
  courierIdentity: {
    flex: 1,
    gap: 2,
  },
  courierName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'right',
  },
  courierCode: {
    color: colors.muted,
    fontSize: 13,
    textAlign: 'right',
  },
  imageAttachment: {
    gap: spacing.sm,
  },
  previewImage: {
    width: '100%',
    height: 220,
    borderRadius: 12,
    backgroundColor: colors.surfaceRaised,
  },
  notification: {
    paddingVertical: spacing.md,
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.outline,
  },
  notificationUnread: {
    backgroundColor: colors.surfaceRaised,
    paddingHorizontal: spacing.sm,
  },
  notificationHeading: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.sm,
  },
  notificationTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'right',
  },
  unreadDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.accent,
  },
  notificationImage: {
    width: '100%',
    height: 280,
    borderRadius: 12,
    backgroundColor: colors.surfaceRaised,
  },
  notificationMeta: {
    color: colors.muted,
    fontSize: 12,
    textAlign: 'right',
  },
});
