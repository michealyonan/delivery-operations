import { FlatList, StyleSheet, Text, View } from 'react-native';

import { orders } from '../../data/mockData';

const statusMap = {
  assigned: 'مُسنَد',
  'picked-up': 'تم الاستلام',
  'in-transit': 'قيد التوصيل',
  delivered: 'تم التسليم',
};

export default function OrdersScreen() {
  const allOrders = orders;

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>سجل الطلبات</Text>
      <FlatList
        data={allOrders}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.id}>{item.id}</Text>
              <Text style={styles.status}>{statusMap[item.status]}</Text>
            </View>
            <Text style={styles.restaurant}>{item.restaurantName}</Text>
            <Text style={styles.customer}>{item.customerName}</Text>
            <Text style={styles.address}>{item.customerAddress}</Text>
            <View style={styles.metaRow}>
              <Text style={styles.amount}>{item.amountCollected} ر.س</Text>
              <Text style={styles.meta}>مستحق للمطعم: {item.restaurantPayout} ر.س</Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 20, backgroundColor: '#f5f7fb' },
  title: { fontSize: 24, fontWeight: '800', color: '#111827', marginBottom: 14 },
  list: { paddingBottom: 36 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  id: { fontWeight: '700', color: '#111827' },
  status: { backgroundColor: '#e0f2fe', color: '#075985', fontSize: 11, fontWeight: '700', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  restaurant: { marginTop: 10, fontSize: 16, fontWeight: '700' },
  customer: { marginTop: 4, color: '#374151', fontWeight: '600' },
  address: { marginTop: 6, color: '#6b7280', fontSize: 13 },
  metaRow: { marginTop: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  amount: { fontWeight: '800', color: '#0f766e', fontSize: 16 },
  meta: { color: '#6b7280', fontSize: 12 },
});
