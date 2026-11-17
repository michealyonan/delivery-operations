import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ActionButton, Body, Field, Heading, Notice, Page, Section } from '../../components/ui';
import { parsePiasters, useApp } from '../../state/app-context';
import { colors, spacing } from '../../theme';

const money = (piasters: number) =>
  `${(piasters / 100).toLocaleString('ar-EG', { minimumFractionDigits: 2 })} ج.م`;

export default function RestaurantMenuScreen() {
  const {
    profile,
    isDemo,
    restaurantMenuItems,
    loadRestaurantMenu,
    saveRestaurantMenuItem,
  } = useApp();
  const [itemName, setItemName] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [isAvailable, setIsAvailable] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    let active = true;
    loadRestaurantMenu()
      .catch((error: unknown) => {
        if (active) {
          setErrorMessage(error instanceof Error ? error.message : 'تعذر تحميل قائمة الأصناف.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadRestaurantMenu]);

  if (profile?.role !== 'restaurant') {
    return (
      <Page>
        <Heading>أصناف المطعم</Heading>
        <Notice tone="danger">إدارة الأصناف متاحة لحساب المطعم فقط.</Notice>
      </Page>
    );
  }

  const editItem = (itemId: number) => {
    const item = restaurantMenuItems.find((candidate) => candidate.id === itemId);
    if (!item) return;
    setEditingId(item.id);
    setItemName(item.name);
    setItemPrice((item.pricePiasters / 100).toFixed(2));
    setIsAvailable(item.isAvailable);
    setErrorMessage('');
    setSuccessMessage('');
  };

  const resetForm = () => {
    setEditingId(null);
    setItemName('');
    setItemPrice('');
    setIsAvailable(true);
  };

  const saveItem = async () => {
    setErrorMessage('');
    setSuccessMessage('');
    if (!itemName.trim()) {
      setErrorMessage('اكتب اسم الصنف.');
      return;
    }
    let pricePiasters: number;
    try {
      pricePiasters = parsePiasters(itemPrice);
      if (pricePiasters < 1) throw new Error('سعر الصنف يجب أن يكون أكبر من صفر.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'اكتب سعرًا صحيحًا للصنف.');
      return;
    }
    setBusy(true);
    try {
      await saveRestaurantMenuItem(editingId, itemName, pricePiasters, isAvailable);
      setSuccessMessage(editingId === null ? 'تمت إضافة الصنف إلى القائمة.' : 'تم تحديث بيانات الصنف.');
      resetForm();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'تعذر حفظ الصنف.');
    } finally {
      setBusy(false);
    }
  };

  const toggleAvailability = async (itemId: number) => {
    const item = restaurantMenuItems.find((candidate) => candidate.id === itemId);
    if (!item) return;
    setBusy(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      await saveRestaurantMenuItem(
        item.id,
        item.name,
        item.pricePiasters,
        !item.isAvailable,
      );
      setSuccessMessage(
        item.isAvailable ? 'تم إيقاف ظهور الصنف؛ لن يمكن اختياره في طلب جديد.' : 'أصبح الصنف متاحًا للطلبات.',
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'تعذر تحديث حالة الصنف.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page>
      <ActionButton onPress={() => router.back()} tone="outline">العودة إلى الطلب الجديد</ActionButton>
      <Heading>أصناف {profile.name}</Heading>
      {isDemo && <Notice tone="warning">قائمة توضيحية على هذا الجهاز فقط.</Notice>}
      <Body>أضف الأصناف وأسعارها، وأوقف الصنف مؤقتًا إذا نفد من المطعم.</Body>

      <Section title="قائمة الأصناف">
        {loading ? (
          <Notice>جارٍ تحميل القائمة...</Notice>
        ) : restaurantMenuItems.length === 0 ? (
          <Notice>لم تُضف أصناف بعد. ابدأ بإضافة أول صنف.</Notice>
        ) : (
          restaurantMenuItems.map((item) => (
            <View key={item.id} style={styles.itemRow}>
              <View style={styles.itemInfo}>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemPrice}>{money(item.pricePiasters)}</Text>
                <Text style={[styles.availability, !item.isAvailable && styles.unavailable]}>
                  {item.isAvailable ? 'متاح للطلبات' : 'غير متاح · نفد مؤقتًا'}
                </Text>
              </View>
              <View style={styles.itemActions}>
                <ActionButton disabled={busy} onPress={() => editItem(item.id)} tone="outline">
                  تعديل
                </ActionButton>
                <ActionButton
                  disabled={busy}
                  loading={busy && !editingId}
                  onPress={() => void toggleAvailability(item.id)}
                  tone={item.isAvailable ? 'danger' : 'secondary'}
                >
                  {item.isAvailable ? 'إيقاف التوفر' : 'إعادة التوفر'}
                </ActionButton>
              </View>
            </View>
          ))
        )}
      </Section>

      <Section title={editingId === null ? 'إضافة صنف' : 'تعديل الصنف'}>
        <Field label="اسم الصنف" maxLength={120} onChangeText={setItemName} value={itemName} />
        <Field
          keyboardType="decimal-pad"
          label="سعر الصنف · جنيه"
          onChangeText={setItemPrice}
          value={itemPrice}
        />
        {editingId !== null ? (
          <>
            <Body>حالة الصنف الحالية: {isAvailable ? 'متاح' : 'غير متاح'}</Body>
            <ActionButton
              onPress={() => setIsAvailable((current) => !current)}
              tone="outline"
            >
              {isAvailable ? 'إيقاف ظهور الصنف' : 'إظهار الصنف في الطلبات'}
            </ActionButton>
          </>
        ) : null}
        {errorMessage ? <Notice tone="danger">{errorMessage}</Notice> : null}
        {successMessage ? <Notice tone="info">{successMessage}</Notice> : null}
        <ActionButton loading={busy} onPress={() => void saveItem()}>
          {editingId === null ? 'إضافة الصنف' : 'حفظ التعديلات'}
        </ActionButton>
        {editingId !== null ? (
          <ActionButton disabled={busy} onPress={resetForm} tone="outline">إلغاء التعديل</ActionButton>
        ) : null}
      </Section>

      <ActionButton onPress={() => router.replace('/restaurant-new-order')}>اختيار الأصناف لطلب جديد</ActionButton>
    </Page>
  );
}

const styles = StyleSheet.create({
  itemRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.outline,
  },
  itemInfo: { flex: 1, gap: 5 },
  itemName: { color: colors.text, fontSize: 16, fontWeight: '700', textAlign: 'right' },
  itemPrice: { color: colors.primaryDark, fontSize: 14, fontWeight: '700', textAlign: 'right' },
  availability: { color: colors.success, fontSize: 12, fontWeight: '600', textAlign: 'right' },
  unavailable: { color: colors.warning },
  itemActions: { gap: spacing.xs, minWidth: 130 },
});
