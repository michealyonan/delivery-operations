import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ActionButton, Body, Field, Heading, Notice, Page, Section } from '../../components/ui';
import { useApp } from '../../state/app-context';
import { colors, spacing } from '../../theme';

const money = (piasters: number) =>
  `${(piasters / 100).toLocaleString('ar-EG', { minimumFractionDigits: 2 })} ج.م`;

export default function NewOrderScreen() {
  const {
    createOrder,
    isDemo,
    profile,
    restaurantMenuItems,
    loadRestaurantMenu,
  } = useApp();
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [busy, setBusy] = useState(false);
  const [menuBusy, setMenuBusy] = useState(true);
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
        if (active) setMenuBusy(false);
      });
    return () => {
      active = false;
    };
  }, [loadRestaurantMenu]);

  const selectedItems = useMemo(
    () =>
      Object.entries(quantities)
        .map(([itemId, quantity]) => ({ itemId: Number(itemId), quantity }))
        .filter((item) => item.quantity > 0),
    [quantities],
  );
  const restaurantTotalPiasters = selectedItems.reduce((total, selected) => {
    const item = restaurantMenuItems.find((candidate) => candidate.id === selected.itemId);
    return total + (item?.isAvailable ? item.pricePiasters * selected.quantity : 0);
  }, 0);
  const deliveryFeePiasters = profile?.deliveryFeePiasters ?? 0;
  const customerTotalPiasters = restaurantTotalPiasters + deliveryFeePiasters;

  const changeQuantity = (itemId: number, change: number) => {
    setQuantities((current) => {
      const next = Math.max(0, Math.min(99, (current[itemId] ?? 0) + change));
      return { ...current, [itemId]: next };
    });
    setErrorMessage('');
    setSuccessMessage('');
  };

  const submit = async () => {
    setErrorMessage('');
    setSuccessMessage('');
    if (!customerName.trim() || !customerPhone.trim() || !customerAddress.trim()) {
      setErrorMessage('اكتب اسم العميل ورقم تليفونه وعنوانه بالتفصيل.');
      return;
    }
    if (selectedItems.length === 0) {
      setErrorMessage('اختر صنفًا واحدًا على الأقل من القائمة المتاحة.');
      return;
    }
    setBusy(true);
    try {
      await createOrder({
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerAddress: customerAddress.trim(),
        notes: notes.trim(),
        items: selectedItems,
      });
      setSuccessMessage('تم إرسال الطلب للإدارة؛ تم حساب قيمة الأصناف ورسوم التوصيل تلقائيًا.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'تعذر إرسال الطلب. تحقق من الاتصال وحاول مرة أخرى.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page>
      <Heading>طلب جديد</Heading>
      {isDemo && <Notice tone="warning">لن يصل هذا الطلب إلى أجهزة أخرى في وضع المعاينة.</Notice>}
      <Body>اختر الأصناف والكميات؛ تُحسب قيمة الطلب ورسوم التوصيل المحددة من الإدارة تلقائيًا.</Body>
      <ActionButton onPress={() => router.push('/orders/menu')} tone="outline">
        إدارة أصناف المطعم وأسعارها
      </ActionButton>

      <Section title="الأصناف">
        {menuBusy ? (
          <Notice>جارٍ تحميل القائمة...</Notice>
        ) : restaurantMenuItems.filter((item) => item.isAvailable).length === 0 ? (
          <Notice tone="warning">لا توجد أصناف متاحة. أضف الأصناف أو فعّل صنفًا من إدارة القائمة.</Notice>
        ) : (
          restaurantMenuItems
            .filter((item) => item.isAvailable)
            .map((item) => {
              const quantity = quantities[item.id] ?? 0;
              return (
                <View key={item.id} style={styles.menuRow}>
                  <View style={styles.menuInfo}>
                    <Text style={styles.menuName}>{item.name}</Text>
                    <Text style={styles.menuPrice}>{money(item.pricePiasters)} · للصنف</Text>
                    {quantity > 0 ? (
                      <Text style={styles.lineTotal}>الإجمالي: {money(item.pricePiasters * quantity)}</Text>
                    ) : null}
                  </View>
                  <View style={styles.quantityControl}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`زيادة كمية ${item.name}`}
                      disabled={quantity >= 99}
                      onPress={() => changeQuantity(item.id, 1)}
                      style={[styles.quantityButton, quantity >= 99 && styles.disabled]}
                    >
                      <MaterialCommunityIcons name="plus" size={20} color={colors.primary} />
                    </Pressable>
                    <Text style={styles.quantity}>{quantity}</Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`تقليل كمية ${item.name}`}
                      disabled={quantity === 0}
                      onPress={() => changeQuantity(item.id, -1)}
                      style={[styles.quantityButton, quantity === 0 && styles.disabled]}
                    >
                      <MaterialCommunityIcons name="minus" size={20} color={colors.primary} />
                    </Pressable>
                  </View>
                </View>
              );
            })
        )}
      </Section>

      <Section title="بيانات العميل">
        <Field label="اسم العميل" onChangeText={setCustomerName} value={customerName} />
        <Field
          keyboardType="phone-pad"
          label="رقم تليفون العميل"
          onChangeText={setCustomerPhone}
          value={customerPhone}
        />
        <Field
          label="عنوان العميل بالتفصيل"
          multiline
          onChangeText={setCustomerAddress}
          value={customerAddress}
        />
        <Field label="ملاحظات للمندوب (اختياري)" multiline onChangeText={setNotes} value={notes} />
      </Section>

      <Section title="المبالغ المحسوبة">
        <Body>قيمة الأصناف المستحقة للمطعم: {money(restaurantTotalPiasters)}</Body>
        <Body>رسوم التوصيل التي حددتها الإدارة: {money(deliveryFeePiasters)}</Body>
        <Text style={styles.total}>المبلغ الذي سيحصله المندوب من العميل: {money(customerTotalPiasters)}</Text>
      </Section>

      {errorMessage ? <Notice tone="danger">{errorMessage}</Notice> : null}
      {successMessage ? (
        <>
          <Notice tone="info">{successMessage}</Notice>
          <ActionButton onPress={() => router.replace('/(tabs)/orders')} tone="outline">
            فتح طلبات المطعم
          </ActionButton>
        </>
      ) : null}
      <ActionButton disabled={menuBusy || Boolean(successMessage)} loading={busy} onPress={submit}>
        إرسال للإدارة
      </ActionButton>
    </Page>
  );
}

const styles = StyleSheet.create({
  menuRow: {
    minHeight: 72,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.outline,
  },
  menuInfo: { flex: 1, gap: 4 },
  menuName: { color: colors.text, fontSize: 16, fontWeight: '700', textAlign: 'right' },
  menuPrice: { color: colors.muted, fontSize: 13, textAlign: 'right' },
  lineTotal: { color: colors.primaryDark, fontSize: 13, fontWeight: '700', textAlign: 'right' },
  quantityControl: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  quantityButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
  },
  disabled: { opacity: 0.45 },
  quantity: { minWidth: 22, color: colors.text, fontSize: 16, fontWeight: '800', textAlign: 'center' },
  total: { color: colors.primaryDark, fontSize: 16, fontWeight: '800', textAlign: 'right' },
});
