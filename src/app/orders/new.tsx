import { router } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { ActionButton, Body, Field, Heading, Notice, Page } from '../../components/ui';
import { useApp, parsePiasters } from '../../state/app-context';

export default function NewOrderScreen() {
  const { createOrder, isDemo } = useApp();
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [itemsText, setItemsText] = useState('');
  const [amount, setAmount] = useState('');
  const [restaurantAmount, setRestaurantAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!customerName.trim() || !customerPhone.trim() || !customerAddress.trim() || !itemsText.trim()) {
      Alert.alert('بيانات ناقصة', 'اكتب اسم العميل ورقم تليفونه وعنوانه وأصناف الطلب.');
      return;
    }
    setBusy(true);
    try {
      await createOrder({
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerAddress: customerAddress.trim(),
        itemsText: itemsText.trim(),
        notes: notes.trim(),
        amountDuePiasters: parsePiasters(amount),
        restaurantDuePiasters: parsePiasters(restaurantAmount),
      });
      Alert.alert('تم إرسال الطلب', 'ظهر الطلب في قائمة انتظار الإدارة.', [
        { text: 'حسنًا', onPress: () => router.replace('/(tabs)/orders') },
      ]);
    } catch (error) {
      Alert.alert('تعذر إرسال الطلب', error instanceof Error ? error.message : 'حاول مرة أخرى.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page>
      <Heading>طلب جديد</Heading>
      {isDemo && <Notice tone="warning">لن يصل هذا الطلب إلى أجهزة أخرى في وضع المعاينة.</Notice>}
      <Body>أدخل بيانات العميل والأصناف؛ سيظهر اسم مطعمك تلقائيًا للمندوب.</Body>
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
      <Field
        label="أصناف الطلب والكميات (كل صنف في سطر)"
        multiline
        onChangeText={setItemsText}
        placeholder={'مثال:\nوجبة × 1\nمشروب × 2'}
        value={itemsText}
      />
      <Field
        keyboardType="decimal-pad"
        label="المبلغ المطلوب من العميل · جنيه"
        onChangeText={setAmount}
        value={amount}
      />
      <Field
        keyboardType="decimal-pad"
        label="المبلغ المطلوب دفعه للمطعم · جنيه"
        onChangeText={setRestaurantAmount}
        value={restaurantAmount}
      />
      <Field label="ملاحظات للمندوب (اختياري)" multiline onChangeText={setNotes} value={notes} />
      <ActionButton loading={busy} onPress={submit}>
        إرسال للإدارة
      </ActionButton>
    </Page>
  );
}
