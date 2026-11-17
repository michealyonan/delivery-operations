import React, { useMemo, useState } from "react";
import {
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const roleMeta = {
  admin: { label: "الإدارة", accent: "#1f6feb" },
  courier: { label: "المندوب", accent: "#0f9d58" },
  restaurant: { label: "المطعم", accent: "#f59e0b" },
};

const initialCourierOrders = [
  {
    id: "OD-101",
    customer: "أحمد علي",
    address: "شارع التحرير، القاهرة",
    amount: 1540,
    status: "تم التوصيل",
    paid: 2200,
    toRestaurant: 1500,
  },
  {
    id: "OD-102",
    customer: "سارة محمد",
    address: "مدينة نصر، القاهرة",
    amount: 980,
    status: "قيد التوصيل",
    paid: 1200,
    toRestaurant: 900,
  },
  {
    id: "OD-103",
    customer: "خالد سامي",
    address: "الدوحة، الدقي",
    amount: 2100,
    status: "تم الاستلام",
    paid: 1800,
    toRestaurant: 1750,
  },
];

const initialAdminOrders = [
  {
    id: "A-240",
    customer: "يوسف حسن",
    courier: "محمود سليم",
    total: 1280,
    status: "تم التوصيل",
    date: "2026-11-17",
  },
  {
    id: "A-241",
    customer: "ليلى نبيل",
    courier: "أحمد كمال",
    total: 980,
    status: "قيد التنفيذ",
    date: "2026-11-17",
  },
  {
    id: "A-242",
    customer: "رامي جابر",
    courier: "محمود سليم",
    total: 1540,
    status: "ملغية",
    date: "2026-11-16",
  },
];

const initialRestaurantOrders = [
  {
    id: "R-08",
    customer: "مروة فرج",
    address: "الزمالك",
    amount: 520,
    status: "بانتظار التوصيل",
  },
  {
    id: "R-09",
    customer: "ياسر أحمد",
    address: "مدينة نصر",
    amount: 760,
    status: "تم التوصيل",
  },
  {
    id: "R-10",
    customer: "سارة عمرو",
    address: "المعادي",
    amount: 600,
    status: "قيد التنفيذ",
  },
];

const formatCurrency = (value) => `${(value / 100).toFixed(2)} ج.م`;

export default function App() {
  const [activeRole, setActiveRole] = useState("admin");
  const [adminOrders, setAdminOrders] = useState(initialAdminOrders);
  const [courierOrders, setCourierOrders] = useState(initialCourierOrders);
  const [restaurantOrders, setRestaurantOrders] = useState(initialRestaurantOrders);
  const [shiftOn, setShiftOn] = useState(true);
  const [newOrder, setNewOrder] = useState({
    customer: "",
    address: "",
    amount: "",
  });

  const metrics = useMemo(() => {
    const deliveredCount = adminOrders.filter((order) => order.status === "تم التوصيل").length;
    const thisMonth = adminOrders.reduce((total, order) => total + order.total, 0);
    const courierCollected = courierOrders.reduce((total, order) => total + order.paid, 0);
    const restaurantPayout = courierOrders.reduce((total, order) => total + order.toRestaurant, 0);

    return {
      deliveredCount,
      thisMonth,
      courierCollected,
      restaurantPayout,
    };
  }, [adminOrders, courierOrders]);

  const assignOrderToCourier = () => {
    const firstPending = adminOrders.find((order) => order.status === "قيد التنفيذ");

    if (!firstPending) {
      return;
    }

    setAdminOrders((current) =>
      current.map((order) =>
        order.id === firstPending.id ? { ...order, status: "تم التوصيل" } : order,
      ),
    );

    setCourierOrders((current) => [
      {
        id: `OD-${Math.floor(Math.random() * 1000)}`,
        customer: firstPending.customer,
        address: firstPending.customer,
        amount: firstPending.total,
        status: "قيد التوصيل",
        paid: firstPending.total,
        toRestaurant: Math.max(700, firstPending.total - 120),
      },
      ...current,
    ]);
  };

  const handleCreateRestaurantOrder = () => {
    if (!newOrder.customer.trim() || !newOrder.address.trim() || !newOrder.amount) {
      return;
    }

    const nextOrder = {
      id: `R-${Math.floor(Math.random() * 90 + 10)}`,
      customer: newOrder.customer,
      address: newOrder.address,
      amount: Number(newOrder.amount) * 100,
      status: "بانتظار التوصيل",
    };

    setRestaurantOrders((current) => [nextOrder, ...current]);
    setNewOrder({ customer: "", address: "", amount: "" });
  };

  const handleCourierDelivery = (id) => {
    setCourierOrders((current) =>
      current.map((order) =>
        order.id === id ? { ...order, status: "تم التوصيل" } : order,
      ),
    );
  };

  const renderAdmin = () => (
    <View style={styles.sectionGroup}>
      <SectionHeader title="لوحة الإدارة" />
      <View style={styles.statsGrid}>
        <MetricCard label="الطلبات المنجزة" value={`${metrics.deliveredCount}`} tone="blue" />
        <MetricCard label="إجمالي الشهر" value={formatCurrency(metrics.thisMonth)} tone="green" />
        <MetricCard label="مندوبون" value="08" tone="amber" />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>موقع المندوب</Text>
        <Text style={styles.locationText}>آخر موقع: 30.0444، 31.2357</Text>
        <View style={styles.mapBox}>
          <Text style={styles.mapText}>GPS نشط • آخر تحديث قبل 32 ثانية</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>طلبات اليوم</Text>
        {adminOrders.map((order) => (
          <View key={order.id} style={styles.orderRow}>
            <View>
              <Text style={styles.orderTitle}>{order.customer}</Text>
              <Text style={styles.orderMeta}>{order.id} • {order.courier}</Text>
            </View>
            <View style={styles.orderRight}>
              <Text style={styles.orderAmount}>{formatCurrency(order.total)}</Text>
              <Text style={styles.orderStatus}>{order.status}</Text>
            </View>
          </View>
        ))}
        <TouchableOpacity style={styles.primaryButton} onPress={assignOrderToCourier}>
          <Text style={styles.primaryButtonText}>إرسال طلب إلى مندوب</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderCourier = () => (
    <View style={styles.sectionGroup}>
      <SectionHeader title="لوحة المندوب" />
      <View style={styles.statsGrid}>
        <MetricCard label="الطلبات" value={`${courierOrders.length}`} tone="blue" />
        <MetricCard label="المقبوض" value={formatCurrency(metrics.courierCollected)} tone="green" />
        <MetricCard label="المدفوع للمطاعم" value={formatCurrency(metrics.restaurantPayout)} tone="amber" />
      </View>

      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <Text style={styles.cardTitle}>حالة الشيفت</Text>
          <TouchableOpacity
            style={[styles.toggle, shiftOn && styles.toggleActive]}
            onPress={() => setShiftOn((value) => !value)}
          >
            <Text style={styles.toggleText}>{shiftOn ? "تشغيل" : "إيقاف"}</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.locationText}>الموقع الحالي: 30.0444، 31.2357</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>طلبات التوصيل</Text>
        {courierOrders.map((order) => (
          <View key={order.id} style={styles.orderRow}>
            <View>
              <Text style={styles.orderTitle}>{order.customer}</Text>
              <Text style={styles.orderMeta}>{order.address}</Text>
            </View>
            <View style={styles.orderRight}>
              <Text style={styles.orderAmount}>{formatCurrency(order.amount)}</Text>
              <Text style={styles.orderStatus}>{order.status}</Text>
              {order.status !== "تم التوصيل" && (
                <TouchableOpacity style={styles.minorButton} onPress={() => handleCourierDelivery(order.id)}>
                  <Text style={styles.minorButtonText}>تسليم</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ))}
      </View>
    </View>
  );

  const renderRestaurant = () => (
    <View style={styles.sectionGroup}>
      <SectionHeader title="لوحة المطعم" />
      <View style={styles.card}>
        <Text style={styles.cardTitle}>إرسال طلب جديد</Text>
        <TextInput
          style={styles.input}
          placeholder="اسم العميل"
          value={newOrder.customer}
          onChangeText={(value) => setNewOrder((current) => ({ ...current, customer: value }))}
        />
        <TextInput
          style={styles.input}
          placeholder="العنوان"
          value={newOrder.address}
          onChangeText={(value) => setNewOrder((current) => ({ ...current, address: value }))}
        />
        <TextInput
          style={styles.input}
          placeholder="المبلغ بالريال"
          keyboardType="numeric"
          value={newOrder.amount}
          onChangeText={(value) => setNewOrder((current) => ({ ...current, amount: value }))}
        />
        <TouchableOpacity style={styles.primaryButton} onPress={handleCreateRestaurantOrder}>
          <Text style={styles.primaryButtonText}>إرسال الطلب</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>طلبات المطعم</Text>
        {restaurantOrders.map((order) => (
          <View key={order.id} style={styles.orderRow}>
            <View>
              <Text style={styles.orderTitle}>{order.customer}</Text>
              <Text style={styles.orderMeta}>{order.address}</Text>
            </View>
            <View style={styles.orderRight}>
              <Text style={styles.orderAmount}>{formatCurrency(order.amount)}</Text>
              <Text style={styles.orderStatus}>{order.status}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#f6f8ff" />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.headerTitle}>منصة التوصيل</Text>

        <View style={styles.roleSelector}>
          {Object.entries(roleMeta).map(([key, item]) => (
            <TouchableOpacity
              key={key}
              activeOpacity={0.85}
              style={[
                styles.roleButton,
                activeRole === key && styles.roleButtonActive,
                activeRole === key && { borderColor: item.accent },
              ]}
              onPress={() => setActiveRole(key)}
            >
              <Text
                style={[
                  styles.roleButtonText,
                  activeRole === key && { color: item.accent },
                ]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {activeRole === "admin" && renderAdmin()}
        {activeRole === "courier" && renderCourier()}
        {activeRole === "restaurant" && renderRestaurant()}
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionHeader({ title }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

function MetricCard({ label, value, tone }) {
  const background =
    tone === "green" ? "#e8f7ee" : tone === "amber" ? "#fff3d9" : "#eaf2ff";
  const color = tone === "green" ? "#0f9d58" : tone === "amber" ? "#b36d00" : "#1f6feb";

  return (
    <View style={[styles.metricCard, { backgroundColor: background }]}>
      <Text style={[styles.metricLabel, { color }]}>{label}</Text>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f6f8ff",
  },
  container: {
    flex: 1,
  },
  content: {
    padding: 18,
    paddingBottom: 50,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "700",
    textAlign: "right",
    marginBottom: 18,
    color: "#10213a",
  },
  roleSelector: {
    flexDirection: "row-reverse",
    backgroundColor: "#eef3ff",
    borderRadius: 16,
    padding: 6,
    marginBottom: 18,
  },
  roleButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "transparent",
    alignItems: "center",
  },
  roleButtonActive: {
    backgroundColor: "#ffffff",
  },
  roleButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#3a4b67",
  },
  sectionGroup: {
    gap: 14,
  },
  sectionHeader: {
    fontSize: 20,
    fontWeight: "700",
    color: "#11213d",
    textAlign: "right",
  },
  statsGrid: {
    flexDirection: "row-reverse",
    gap: 10,
    justifyContent: "space-between",
  },
  metricCard: {
    flex: 1,
    borderRadius: 16,
    padding: 14,
    minHeight: 90,
    justifyContent: "center",
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: "700",
    textAlign: "right",
    marginBottom: 8,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: "800",
    textAlign: "right",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 16,
    shadowColor: "#9aa7c8",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  rowBetween: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#182844",
    textAlign: "right",
    marginBottom: 12,
  },
  orderRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#edf1f7",
    paddingTop: 12,
    marginTop: 12,
  },
  orderTitle: {
    fontSize: 16,
    fontWeight: "700",
    textAlign: "right",
    color: "#0f172a",
  },
  orderMeta: {
    fontSize: 12,
    color: "#5d6c82",
    textAlign: "right",
    marginTop: 4,
  },
  orderRight: {
    alignItems: "flex-end",
  },
  orderAmount: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f172a",
    textAlign: "right",
  },
  orderStatus: {
    fontSize: 11,
    color: "#4b5563",
    textAlign: "right",
    marginTop: 4,
  },
  primaryButton: {
    backgroundColor: "#1d4ed8",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 18,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#ffffff",
  },
  minorButton: {
    backgroundColor: "#eafff2",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 8,
  },
  minorButtonText: {
    color: "#0f9d58",
    fontWeight: "700",
    fontSize: 12,
  },
  mapBox: {
    backgroundColor: "#eaf3ff",
    borderRadius: 16,
    padding: 16,
    height: 130,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#d8e6ff",
  },
  mapText: {
    color: "#174e9b",
    fontWeight: "700",
    textAlign: "center",
  },
  locationText: {
    fontSize: 13,
    color: "#425267",
    textAlign: "right",
    marginBottom: 12,
  },
  toggle: {
    backgroundColor: "#e5e7eb",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  toggleActive: {
    backgroundColor: "#d9fbe7",
  },
  toggleText: {
    fontWeight: "700",
    color: "#10213a",
  },
  input: {
    backgroundColor: "#f5f7ff",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    textAlign: "right",
    borderWidth: 1,
    borderColor: "#e4ebff",
    fontSize: 15,
  },
});

