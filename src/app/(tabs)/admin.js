import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { couriers, getAdminSummary, orderStatusMap, orders as seedOrders, restaurants } from '../../data/mockData';

const initialForm = {
  restaurantId: restaurants[0].id,
  customerName: '',
  customerAddress: '',
  items: '',
  amountCollected: '180',
  restaurantPayout: '110',
  deliveryFee: '20',
};

export default function AdminScreen() {
  const [orderList, setOrderList] = useState(seedOrders);
  const [form, setForm] = useState(initialForm);
  const [selectedCourierId, setSelectedCourierId] = useState(couriers[0].id);

  const summary = useMemo(() => getAdminSummary(orderList), [orderList]);

  const handleCreateOrder = () => {
    if (!form.customerName.trim() || !form.customerAddress.trim()) {
      return;
    }

    const restaurant = restaurants.find((item) => item.id === form.restaurantId) || restaurants[0];
    const courier = couriers.find((item) => item.id === selectedCourierId) || couriers[0];

    const newOrder = {
      id: `OD-${Math.floor(1000 + Math.random() * 9000)}`,
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      courierId: courier.id,
      courierName: courier.fullName,
      customerName: form.customerName.trim(),
      customerAddress: form.customerAddress.trim(),
      status: 'assigned',
      items: form.items.trim() || 'طلب عادي',
      amountCollected: Number(form.amountCollected || 0),
      restaurantPayout: Number(form.restaurantPayout || 0),
      deliveryFee: Number(form.deliveryFee || 0),
      createdAt: new Date().toISOString(),
      etaMinutes: 25,
      distanceKm: 4.2,
    };

    setOrderList((current) => [newOrder, ...current]);
    setForm(initialForm);
  };

  const assignCourierToOrder = (orderId, courierId) => {
    const courier = couriers.find((item) => item.id === courierId) || couriers[0];
    setOrderList((current) =>
      current.map((order) =>
        order.id === orderId ? { ...order, courierId: courier.id, courierName: courier.fullName, status: 'assigned' } : order,
      ),
    );
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>لوحة الإدارة</Text>

      <View style={styles.summaryGrid}>
        <MetricCard label="طلبات اليوم" value={`${summary.todayCount}`} tone="#1f7a8c" />
        <MetricCard label="المحصل" value={`${summary.todayCollected} ر.س`} tone="#0f766e" />
        <MetricCard label="مدفوع للمطاعم" value={`${summary.monthPayout} ر.س`} tone="#b45309" />
        <MetricCard label="إجمالي الشهر" value={`${summary.monthRevenue} ر.س`} tone="#7c3aed" />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>إنشاء طلب عادي</Text>

        <Text style={styles.label}>المطعم</Text>
        <View style={styles.pillRow}>
          {restaurants.map((restaurant) => (
            <Pressable
              key={restaurant.id}
              style={[styles.pill, form.restaurantId === restaurant.id && styles.pillActive]}
              onPress={() => setForm((current) => ({ ...current, restaurantId: restaurant.id }))}
            >
              <Text style={[styles.pillText, form.restaurantId === restaurant.id && styles.pillTextActive]}>{restaurant.name}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>اسم العميل</Text>
        <TextInput
          value={form.customerName}
          onChangeText={(value) => setForm((current) => ({ ...current, customerName: value }))}
          style={styles.input}
          placeholder="مثال: علي محمد"
        />

        <Text style={styles.label}>عنوان العميل</Text>
        <TextInput
          value={form.customerAddress}
          onChangeText={(value) => setForm((current) => ({ ...current, customerAddress: value }))}
          style={styles.input}
          placeholder="حي النخيل، شارع 12"
        />

        <Text style={styles.label}>تفاصيل الطلب</Text>
        <TextInput
          value={form.items}
          onChangeText={(value) => setForm((current) => ({ ...current, items: value }))}
          style={[styles.input, styles.textArea]}
          multiline
          placeholder="برجر + بطاطس + عصير"
        />

        <View style={styles.inlineGrid}>
          <View style={styles.inlineField}>
            <Text style={styles.label}>المحصل</Text>
            <TextInput
              value={form.amountCollected}
              keyboardType="numeric"
              onChangeText={(value) => setForm((current) => ({ ...current, amountCollected: value }))}
              style={styles.input}
            />
          </View>
          <View style={styles.inlineField}>
            <Text style={styles.label}>للمطعم</Text>
            <TextInput
              value={form.restaurantPayout}
              keyboardType="numeric"
              onChangeText={(value) => setForm((current) => ({ ...current, restaurantPayout: value }))}
              style={styles.input}
            />
          </View>
        </View>

        <Text style={styles.label}>رسوم التوصيل</Text>
        <TextInput
          value={form.deliveryFee}
          keyboardType="numeric"
          onChangeText={(value) => setForm((current) => ({ ...current, deliveryFee: value }))}
          style={styles.input}
        />

        <Text style={styles.label}>اختر المندوب</Text>
        <View style={styles.pillRow}>
          {couriers.map((courier) => (
            <Pressable
              key={courier.id}
              style={[styles.pill, selectedCourierId === courier.id && styles.pillActive]}
              onPress={() => setSelectedCourierId(courier.id)}
            >
              <Text style={[styles.pillText, selectedCourierId === courier.id && styles.pillTextActive]}>{courier.fullName}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable style={styles.primaryButton} onPress={handleCreateOrder}>
          <Text style={styles.primaryButtonText}>إرسال الطلب</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>الطلبات الأخيرة</Text>
        {orderList.slice(0, 5).map((order) => (
          <View key={order.id} style={styles.orderRow}>
            <View style={styles.orderHeader}>
              <Text style={styles.orderId}>{order.id}</Text>
              <Text style={styles.statusBadge}>{orderStatusMap[order.status] || order.status}</Text>
            </View>
            <Text style={styles.orderCustomer}>{order.customerName}</Text>
            <Text style={styles.mutedText}>{order.restaurantName} • {order.customerAddress}</Text>
            <View style={styles.orderFooter}>
              <Text style={styles.amountText}>{order.amountCollected} ر.س</Text>
              <View style={styles.assignWrap}>
                {couriers.map((courier) => (
                  <Pressable
                    key={courier.id}
                    style={[styles.smallAssign, order.courierId === courier.id && styles.smallAssignActive]}
                    onPress={() => assignCourierToOrder(order.id, courier.id)}
                  >
                    <Text style={[styles.smallAssignText, order.courierId === courier.id && styles.smallAssignTextActive]}>{courier.fixedCode}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function MetricCard({ label, value, tone }) {
  return (
    <View style={[styles.metricCard, { borderColor: tone }]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color: tone }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f5f7fb' },
  content: { padding: 20, paddingBottom: 32 },
  title: { fontSize: 24, fontWeight: '800', color: '#111827', marginBottom: 18 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 18 },
  metricCard: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    marginBottom: 12,
  },
  metricLabel: { color: '#475569', fontSize: 12, marginBottom: 8 },
  metricValue: { fontSize: 18, fontWeight: '800' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTitle: { fontSize: 18, fontWeight: '800', color: '#111827', marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 8, marginTop: 10 },
  input: {
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#111827',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  textArea: { minHeight: 90, textAlignVertical: 'top' },
  inlineGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  inlineField: { width: '48%' },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap' },
  pill: {
    backgroundColor: '#ecfeff',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#a5f3fc',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
    marginRight: 8,
  },
  pillActive: { backgroundColor: '#0f766e' },
  pillText: { color: '#0f172a', fontWeight: '700', fontSize: 12 },
  pillTextActive: { color: '#fff' },
  primaryButton: {
    backgroundColor: '#1f7a8c',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 18,
  },
  primaryButtonText: { color: '#fff', fontWeight: '800' },
  orderRow: {
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 12,
    marginTop: 12,
  },
  orderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderId: { fontWeight: '800', color: '#111827' },
  statusBadge: { backgroundColor: '#e0f2fe', color: '#075985', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, fontSize: 11, fontWeight: '700' },
  orderCustomer: { marginTop: 6, fontWeight: '700', color: '#0f172a' },
  mutedText: { color: '#6b7280', marginTop: 4, fontSize: 12 },
  orderFooter: { marginTop: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  amountText: { fontSize: 15, fontWeight: '800', color: '#0f766e' },
  assignWrap: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end' },
  smallAssign: {
    backgroundColor: '#f3f4f6',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginLeft: 6,
    marginBottom: 6,
  },
  smallAssignActive: { backgroundColor: '#dbeafe' },
  smallAssignText: { color: '#374151', fontSize: 10, fontWeight: '700' },
  smallAssignTextActive: { color: '#1d4ed8' },
});
