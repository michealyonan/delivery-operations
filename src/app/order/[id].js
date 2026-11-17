import { useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { orderStatusMap, orders } from '../../data/mockData';

export default function OrderDetail() {
  const { id } = useLocalSearchParams();
  const order = orders.find((item) => item.id === String(id));

  if (!order) {
    return (
      <View style={styles.container}>
        <Text style={styles.empty}>الطلب غير موجود</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.header}>{order.id}</Text>
      <Text style={styles.title}>{order.restaurantName}</Text>
      <Text style={styles.subtitle}>العميل: {order.customerName}</Text>
      <Text style={styles.subtitle}>العنوان: {order.customerAddress}</Text>
      <Text style={styles.subtitle}>المندوب: {order.courierName}</Text>

      <View style={styles.card}>
        <Text style={styles.label}>تفاصيل الطلب</Text>
        <Text style={styles.value}>{order.items}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>الماليات</Text>
        <Text style={styles.value}>المحصل: {order.amountCollected} ر.س</Text>
        <Text style={styles.value}>مدفوع للمطعم: {order.restaurantPayout} ر.س</Text>
        <Text style={styles.value}>رسوم التوصيل: {order.deliveryFee} ر.س</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>حالة الطلب</Text>
        <Text style={styles.value}>{orderStatusMap[order.status] || order.status}</Text>
        <Text style={styles.value}>الوقت المتوقع: {order.etaMinutes} دقيقة</Text>
        <Text style={styles.value}>المسافة: {order.distanceKm} كم</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f5f7fb' },
  content: { padding: 20, paddingBottom: 40 },
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f7fb' },
  header: { fontSize: 28, fontWeight: '800', color: '#111827' },
  title: { marginTop: 8, fontSize: 22, fontWeight: '700', color: '#0f172a' },
  subtitle: { marginTop: 6, color: '#475569', fontSize: 14 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginTop: 18 },
  label: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 8 },
  value: { color: '#374151', marginTop: 6 },
  empty: { fontSize: 18, color: '#374151' },
});
