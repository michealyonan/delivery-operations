import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ActionButton, Body, Field, Heading, Notice, Page, Section } from '../../components/ui';
import { parsePiasters, useApp } from '../../state/app-context';
import { colors, spacing } from '../../theme';

const money = (piasters: number) =>
  `${(piasters / 100).toLocaleString('ar-EG', { minimumFractionDigits: 2 })} ج.م`;

export default function NewOrderScreen() {
  const {
    profile,
    createOrder,
    isDemo,
    restaurants,
    restaurantMenuItems,
    loadRestaurantMenu,
  } = useApp();
  const isAdmin = profile?.role === 'admin';
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<number | null>(
    profile?.restaurantId ?? null,
  );
  const selectedRestaurant = restaurants.find((restaurant) => restaurant.id === selectedRestaurantId);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [busy, setBusy] = useState(false);
  const [loadedMenuRestaurantId, setLoadedMenuRestaurantId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [restaurantPickerOpen, setRestaurantPickerOpen] = useState(false);
  const [deliveryFeeInput, setDeliveryFeeInput] = useState('');
  const acceptsOrders = profile?.restaurantAcceptsOrders !== false;
  const menuRestaurantId = isAdmin ? selectedRestaurantId : profile?.restaurantId ?? null;
  const menuBusy = menuRestaurantId != null && loadedMenuRestaurantId !== menuRestaurantId;

  useEffect(() => {
    if (menuRestaurantId == null) return;
    let active = true;
    loadRestaurantMenu(menuRestaurantId)
      .then(() => {
        if (active) setLoadedMenuRestaurantId(menuRestaurantId);
      })
      .catch((error: unknown) => {
        if (active) {
          setLoadedMenuRestaurantId(menuRestaurantId);
          setErrorMessage(error instanceof Error ? error.message : 'تعذر تحميل قائمة الأصناف.');
        }
      });
    return () => {
      active = false;
    };
  }, [loadRestaurantMenu, menuRestaurantId]);

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
  const deliveryFeePreview = useMemo(() => {
    if (!isAdmin || !deliveryFeeInput.trim()) return null;
    try {
      return parsePiasters(deliveryFeeInput);
    } catch {
      return null;
    }
  }, [deliveryFeeInput, isAdmin]);
  const changeQuantity = (itemId: number, change: number) => {
    setQuantities((current) => {
      const next = Math.max(0, Math.min(99, (current[itemId] ?? 0) + change));
      return { ...current, [itemId]: next };
    });
    setErrorMessage('');
    setSuccessMessage('');
  };

  const selectRestaurant = (restaurantId: number) => {
    setSelectedRestaurantId(restaurantId);
    setLoadedMenuRestaurantId(null);
    setQuantities({});
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
    let deliveryFeePiasters: number | undefined;
    if (isAdmin) {
      try {
        deliveryFeePiasters = parsePiasters(deliveryFeeInput);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'حدد رسوم التوصيل للطلب.');
        return;
      }
    }
    setBusy(true);
    try {
      await createOrder({
        restaurantId: isAdmin ? selectedRestaurantId ?? undefined : undefined,
        deliveryFeePiasters,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerAddress: customerAddress.trim(),
        notes: notes.trim(),
        items: selectedItems,
      });
      setSuccessMessage(
        isAdmin
          ? 'تم إرسال الطلب للمطعم لمراجعته. بعد قبول المطعم، سيحاول النظام إسناده تلقائيًا لأقرب مندوب متاح.'
          : 'تم إرسال الطلب للإدارة؛ ستحدد الإدارة رسوم التوصيل عند إسناده للمندوب.',
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'تعذر إرسال الطلب. تحقق من الاتصال وحاول مرة أخرى.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page>
      <Heading>{isAdmin ? 'إنشاء طلب باسم الإدارة' : 'طلب جديد'}</Heading>
      {isDemo && <Notice tone="warning">لن يصل هذا الطلب إلى أجهزة أخرى في وضع المعاينة.</Notice>}
      {isAdmin ? (
        <Notice tone="info">سيظهر الطلب للمطعم مع توضيح أن الإدارة هي التي أنشأته.</Notice>
      ) : null}
      {isAdmin ? (
        <Section title="المطعم">
          {restaurants.length === 0 ? (
            <Notice tone="warning">لا توجد مطاعم مسجلة لإنشاء طلب لها.</Notice>
          ) : (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: restaurantPickerOpen }}
                onPress={() => setRestaurantPickerOpen((open) => !open)}
                style={styles.restaurantPicker}
              >
                <MaterialCommunityIcons
                  name={restaurantPickerOpen ? 'chevron-up' : 'chevron-down'}
                  size={22}
                  color={colors.primary}
                />
                <View style={styles.restaurantPickerText}>
                  <Text style={styles.restaurantOptionName}>
                    {selectedRestaurant?.name ?? 'اختر المطعم'}
                  </Text>
                  {selectedRestaurant ? (
                    <Text style={styles.restaurantOptionCode}>
                      {selectedRestaurant.code} · {selectedRestaurant.address}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
              {restaurantPickerOpen ? (
                <View style={styles.restaurantOptions}>
                  {restaurants.map((restaurant) => {
                    const selected = restaurant.id === selectedRestaurantId;
                    return (
                      <Pressable
                        key={restaurant.id}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        onPress={() => {
                          selectRestaurant(restaurant.id);
                          setRestaurantPickerOpen(false);
                        }}
                        style={[
                          styles.restaurantOption,
                          selected && styles.restaurantOptionSelected,
                        ]}
                      >
                        <Text
                          style={[
                            styles.restaurantOptionName,
                            selected && styles.restaurantOptionNameSelected,
                          ]}
                        >
                          {restaurant.name}
                        </Text>
                        <Text
                          style={[
                            styles.restaurantOptionCode,
                            selected && styles.restaurantOptionNameSelected,
                          ]}
                        >
                          {restaurant.code} · {restaurant.address}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </>
          )}
        </Section>
      ) : null}
      {!acceptsOrders ? (
        <Notice tone="warning">أوقفت الإدارة استقبال الطلبات الجديدة. يمكنك متابعة الطلبات السابقة وإدارة قائمة الأصناف.</Notice>
      ) : null}
      <Body>
        {isAdmin
          ? 'اختر المطعم وأصنافه، واكتب بيانات العميل ورسوم التوصيل. سيصل الطلب للمطعم للموافقة قبل إرساله للمندوب.'
          : 'اختر الأصناف والكميات. ستضيف الإدارة رسوم التوصيل لهذا الطلب عند إرساله للمندوب.'}
      </Body>
      {!isAdmin ? (
        <ActionButton onPress={() => router.push('/restaurant-menu')} tone="outline">
          إدارة أصناف المطعم وأسعارها
        </ActionButton>
      ) : null}

      <Section title="الأصناف">
        {isAdmin && selectedRestaurantId == null ? (
          <Notice>اختر المطعم أولًا لعرض قائمته.</Notice>
        ) : menuBusy ||
          loadedMenuRestaurantId !== (isAdmin ? selectedRestaurantId : profile?.restaurantId ?? null) ? (
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

      {isAdmin ? (
        <Section title="رسوم التوصيل">
          <Field
            keyboardType="decimal-pad"
            label="رسوم التوصيل · جنيه (مطلوبة قبل الإرسال للمطعم)"
            onChangeText={setDeliveryFeeInput}
            value={deliveryFeeInput}
          />
        </Section>
      ) : null}

      <Section title="المبالغ المحسوبة">
        <Body>قيمة الأصناف المستحقة للمطعم: {money(restaurantTotalPiasters)}</Body>
        <Body>
          رسوم التوصيل:{' '}
          {isAdmin
            ? !deliveryFeeInput.trim()
              ? 'لم تُحدد بعد'
              : deliveryFeePreview == null
                ? 'راجع المبلغ'
                : money(deliveryFeePreview)
            : 'تضيفها الإدارة عند إسناد الطلب.'}
        </Body>
        <Text style={styles.total}>
          إجمالي العميل: {money(restaurantTotalPiasters + (deliveryFeePreview ?? 0))}
        </Text>
      </Section>

      {errorMessage ? <Notice tone="danger">{errorMessage}</Notice> : null}
      {successMessage ? (
        <>
          <Notice tone="info">{successMessage}</Notice>
          <ActionButton onPress={() => router.replace('/(tabs)/orders')} tone="outline">
            {isAdmin ? 'فتح قائمة الطلبات للإسناد' : 'فتح طلبات المطعم'}
          </ActionButton>
        </>
      ) : null}
      <ActionButton
        disabled={
          menuBusy ||
          Boolean(successMessage) ||
          !acceptsOrders ||
          (isAdmin &&
            (selectedRestaurantId == null ||
              !selectedRestaurant ||
              !deliveryFeeInput.trim()))
        }
        loading={busy}
        onPress={submit}
      >
        {isAdmin ? 'إرسال الطلب للمطعم' : acceptsOrders ? 'إرسال للإدارة' : 'استقبال الطلبات متوقف'}
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
  restaurantOptions: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.sm },
  restaurantPicker: {
    minHeight: 58,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.outline,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  restaurantPickerText: { flex: 1, gap: 4 },
  restaurantOption: {
    minWidth: 130,
    flexGrow: 1,
    gap: 4,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.outline,
    borderRadius: 14,
    backgroundColor: colors.surface,
  },
  restaurantOptionSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  restaurantOptionName: { color: colors.text, fontSize: 14, fontWeight: '700', textAlign: 'right' },
  restaurantOptionCode: { color: colors.muted, fontSize: 12, textAlign: 'right' },
  restaurantOptionNameSelected: { color: colors.white },
});
