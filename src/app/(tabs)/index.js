import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';
import { router } from 'expo-router';

import { couriers, getCourierSummary, orders } from '../../data/mockData';

const courier = couriers[0];

const statusMap = {
  assigned: 'مُسنَد',
  'picked-up': 'تم الاستلام',
  'in-transit': 'قيد التوصيل',
  delivered: 'تم التسليم',
};

export default function CourierDashboard() {
  const [permission, setPermission] = useState(null);
  const [location, setLocation] = useState(null);

  useEffect(() => {
    let mounted = true;

    const loadPermission = async () => {
      const current = await Location.getForegroundPermissionsAsync();
      if (!mounted) return;
      setPermission(current.status);

      if (current.status === 'granted') {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        if (mounted) {
          setLocation({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          });
        }
      }
    };

    loadPermission();

    return () => {
      mounted = false;
    };
  }, []);

  const requestLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    setPermission(status);

    if (status !== 'granted') {
      Alert.alert('إذن الموقع', 'يحتاج التطبيق إلى إذن الموقع لتتبع موقع المندوب.');
      return;
    }

    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    setLocation({
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
    });

    const background = await Location.requestBackgroundPermissionsAsync();
    if (background.status === 'granted') {
      Alert.alert('تم', 'تم تفعيل تتبع الموقع في الخلفية على الأجهزة التي تدعمه.');
    }
  };

  const summary = getCourierSummary(courier.id);
  const activeOrders = orders.filter((order) => order.courierId === courier.id);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.label}>مندوبي اليوم</Text>
          <Text style={styles.name}>{courier.fullName}</Text>
        </View>
        <View style={styles.codeBadge}>
          <Text style={styles.codeText}>{courier.fixedCode}</Text>
        </View>
      </View>

      <View style={styles.cardPrimary}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle}>حالة الموقع</Text>
          <Text style={[styles.badge, permission === 'granted' ? styles.badgeSuccess : styles.badgeNeutral]}>
            {permission === 'granted' ? 'مفعل' : 'غير مفعل'}
          </Text>
        </View>

        {location ? (
          <View style={styles.locationBox}>
            <Text style={styles.locationText}>Latitude: {location.latitude.toFixed(4)}</Text>
            <Text style={styles.locationText}>Longitude: {location.longitude.toFixed(4)}</Text>
            <Text style={styles.locationText}>Accuracy: {Math.round(location.accuracy || 0)}m</Text>
          </View>
        ) : (
          <Text style={styles.mutedText}>لم يتم تفعيل الموقع بعد. تأكد من السمايات على الهاتف.</Text>
        )}

        <Pressable style={styles.primaryButton} onPress={requestLocation}>
          <Text style={styles.primaryButtonText}>{permission === 'granted' ? 'تحديث الموقع' : 'تفعيل الموقع'}</Text>
        </Pressable>
      </View>

      <View style={styles.summaryGrid}>
        <SummaryCard title="طلبات اليوم" value={`${summary.todayCount}`} accent="#1f7a8c" />
        <SummaryCard title="المحصل" value={`${summary.todayCollected} ر.س`} accent="#0f766e" />
        <SummaryCard title="للمطاعم" value={`${summary.payoutTotal} ر.س`} accent="#b45309" />
        <SummaryCard title="هذا الشهر" value={`${summary.monthTotal} ر.س`} accent="#6d28d9" />
      </View>

      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>الطلبات المعينة</Text>
        <Text style={styles.sectionLink}>عرض الكل</Text>
      </View>

      {activeOrders.map((order) => (
        <Pressable key={order.id} style={styles.orderCard} onPress={() => router.push({ pathname: '/order/[id]', params: { id: order.id } })}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.orderId}>{order.id}</Text>
            <Text style={[styles.statusBadge, order.status === 'delivered' ? styles.statusDelivered : styles.statusAssigned]}>
              {statusMap[order.status]}
            </Text>
          </View>

          <Text style={styles.orderRestaurant}>{order.restaurantName}</Text>
          <Text style={styles.orderAddress}>{order.customerAddress}</Text>
          <View style={styles.orderMetaRow}>
            <Text style={styles.metaText}>العميل: {order.customerName}</Text>
            <Text style={styles.metaText}>{order.etaMinutes} دقيقة</Text>
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function SummaryCard({ title, value, accent }) {
  return (
    <View style={[styles.summaryCard, { borderColor: accent }]}>
      <Text style={styles.summaryTitle}>{title}</Text>
      <Text style={[styles.summaryValue, { color: accent }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f5f7fb',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  label: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 2,
  },
  name: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
  },
  codeBadge: {
    backgroundColor: '#dbeafe',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  codeText: {
    color: '#1d4ed8',
    fontWeight: '700',
  },
  cardPrimary: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 16,
    marginBottom: 18,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 12,
    fontWeight: '700',
  },
  badgeSuccess: {
    backgroundColor: '#dcfce7',
    color: '#166534',
  },
  badgeNeutral: {
    backgroundColor: '#e5e7eb',
    color: '#374151',
  },
  locationBox: {
    marginTop: 16,
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    padding: 12,
  },
  locationText: {
    fontSize: 13,
    color: '#374151',
    marginBottom: 4,
  },
  mutedText: {
    marginTop: 12,
    color: '#6b7280',
    fontSize: 13,
  },
  primaryButton: {
    marginTop: 16,
    backgroundColor: '#1f7a8c',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  summaryCard: {
    width: '48%',
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
  },
  summaryTitle: {
    color: '#475569',
    fontSize: 12,
    marginBottom: 8,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  sectionLink: {
    color: '#1f7a8c',
    fontWeight: '600',
  },
  orderCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    marginBottom: 12,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  orderId: {
    fontWeight: '700',
    color: '#111827',
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 11,
    fontWeight: '700',
  },
  statusAssigned: {
    backgroundColor: '#dbeafe',
    color: '#1d4ed8',
  },
  statusDelivered: {
    backgroundColor: '#dcfce7',
    color: '#166534',
  },
  orderRestaurant: {
    marginTop: 8,
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  orderAddress: {
    color: '#4b5563',
    marginTop: 6,
    fontSize: 13,
  },
  orderMetaRow: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaText: {
    color: '#6b7280',
    fontSize: 12,
  },
});
