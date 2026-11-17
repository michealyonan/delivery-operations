import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { orderStatusMap, orders, restaurants } from '../../data/mockData';

export default function RestaurantsScreen() {
  const [selectedRestaurantId, setSelectedRestaurantId] = useState(restaurants[0].id);

  const selectedRestaurant = useMemo(
    () => restaurants.find((restaurant) => restaurant.id === selectedRestaurantId) || restaurants[0],
    [selectedRestaurantId],
  );

  const restaurantOrders = useMemo(
    () => orders.filter((order) => order.restaurantId === selectedRestaurant.id),
    [selectedRestaurant.id],
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>حساب المطعم</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>المطعم المختار</Text>
        <View style={styles.pillRow}>
          {restaurants.map((restaurant) => (
            <Pressable
              key={restaurant.id}
              style={[styles.pill, selectedRestaurantId === restaurant.id && styles.pillActive]}
              onPress={() => setSelectedRestaurantId(restaurant.id)}
            >
              <Text style={[styles.pillText, selectedRestaurantId === restaurant.id && styles.pillTextActive]}>{restaurant.name}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.restaurantName}>{selectedRestaurant.name}</Text>
        <Text style={styles.mutedText}>المدير: {selectedRestaurant.manager}</Text>
        <Text style={styles.mutedText}>العنوان: {selectedRestaurant.address}</Text>
        <Text style={styles.mutedText}>الهاتف: {selectedRestaurant.phone}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>طلبات المطعم</Text>
        {restaurantOrders.length === 0 ? (
          <Text style={styles.emptyText}>لا توجد طلبات حالياً لهذا المطعم.</Text>
        ) : (
          restaurantOrders.map((order) => (
            <View key={order.id} style={styles.orderRow}>
              <View style={styles.orderTopRow}>
                <Text style={styles.orderId}>{order.id}</Text>
                <Text style={styles.statusBadge}>{orderStatusMap[order.status] || order.status}</Text>
              </View>
              <Text style={styles.customerName}>{order.customerName}</Text>
              <Text style={styles.addressText}>{order.customerAddress}</Text>
              <Text style={styles.itemsText}>{order.items}</Text>
              <View style={styles.metaRow}>
                <Text style={styles.amountText}>{order.amountCollected} ر.س</Text>
                <Text style={styles.metaText}>المندوب: {order.courierName}</Text>
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f5f7fb' },
  content: { padding: 20, paddingBottom: 32 },
  title: { fontSize: 24, fontWeight: '800', color: '#111827', marginBottom: 18 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTitle: { fontSize: 18, fontWeight: '800', color: '#111827', marginBottom: 12 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
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
  restaurantName: { marginTop: 6, fontSize: 20, fontWeight: '800', color: '#111827' },
  mutedText: { marginTop: 5, color: '#4b5563', fontSize: 13 },
  emptyText: { color: '#6b7280', fontSize: 13 },
  orderRow: {
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 12,
    marginTop: 12,
  },
  orderTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderId: { fontWeight: '800', color: '#111827' },
  statusBadge: { backgroundColor: '#dcfce7', color: '#166534', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, fontSize: 11, fontWeight: '700' },
  customerName: { marginTop: 8, fontWeight: '700', color: '#0f172a' },
  addressText: { marginTop: 4, color: '#6b7280', fontSize: 12 },
  itemsText: { marginTop: 8, color: '#374151' },
  metaRow: { marginTop: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  amountText: { fontSize: 15, fontWeight: '800', color: '#0f766e' },
  metaText: { fontSize: 12, color: '#475569' },
});
