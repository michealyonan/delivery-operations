import type { AppProfile, Courier, DeliveryOrder, Restaurant } from '../types';

const now = new Date();
const today = now.toISOString();

export const demoOrders: DeliveryOrder[] = [
  {
    id: 'demo-order-1001',
    code: 'DEMO-1001',
    restaurantId: 1,
    restaurantName: 'مطعم تجريبي',
    restaurantAddress: 'عنوان المطعم التجريبي',
    restaurantLatitude: 30.0444,
    restaurantLongitude: 31.2357,
    courierId: 1,
    courierName: 'مندوب تجريبي',
    courierPhone: '010 0000 0000',
    customerName: 'عميل تجريبي',
    customerPhone: '010 0000 0001',
    customerAddress: 'عنوان تجريبي — القاهرة',
    itemsText: 'وجبة تجريبية × 1\nمشروب × 2',
    notes: 'بيانات توضيحية فقط',
    amountDuePiasters: 23500,
    restaurantDuePiasters: 19000,
    collectedPiasters: 23500,
    paidToRestaurantPiasters: 19000,
    status: 'delivered',
    createdAt: today,
    deliveredAt: today,
  },
  {
    id: 'demo-order-1002',
    code: 'DEMO-1002',
    restaurantId: 1,
    restaurantName: 'مطعم تجريبي',
    restaurantAddress: 'عنوان المطعم التجريبي',
    restaurantLatitude: 30.0444,
    restaurantLongitude: 31.2357,
    courierId: 1,
    courierName: 'مندوب تجريبي',
    courierPhone: '010 0000 0000',
    customerName: 'عميل تجريبي',
    customerPhone: '010 0000 0002',
    customerAddress: 'عنوان توضيحي — الجيزة',
    itemsText: 'صنف تجريبي × 2',
    notes: '',
    amountDuePiasters: 18000,
    restaurantDuePiasters: 14500,
    status: 'accepted',
    createdAt: today,
    acceptedAt: today,
  },
  {
    id: 'demo-order-1003',
    code: 'DEMO-1003',
    restaurantId: 2,
    restaurantName: 'مطبخ تجريبي آخر',
    restaurantAddress: 'عنوان توضيحي آخر',
    courierId: undefined,
    customerName: 'عميل تجريبي',
    customerPhone: '010 0000 0003',
    customerAddress: 'عنوان تجريبي — القاهرة',
    itemsText: 'طلب تجريبي',
    notes: '',
    amountDuePiasters: 12750,
    restaurantDuePiasters: 10000,
    status: 'pending',
    createdAt: today,
  },
];

export const demoCouriers: Courier[] = [
  {
    id: 1,
    code: 'CR-000001',
    fullName: 'مندوب تجريبي',
    phone: '010 0000 0000',
    email: 'courier@example.test',
    isOnShift: true,
  },
  {
    id: 2,
    code: 'CR-000002',
    fullName: 'مندوب تجريبي آخر',
    phone: '010 0000 0004',
    email: 'courier2@example.test',
    isOnShift: false,
  },
];

export const demoRestaurants: Restaurant[] = [
  {
    id: 1,
    code: 'RS-000001',
    name: 'مطعم تجريبي',
    email: 'restaurant@example.test',
    phone: '02 0000 0000',
    address: 'عنوان المطعم التجريبي',
    latitude: 30.0444,
    longitude: 31.2357,
  },
  {
    id: 2,
    code: 'RS-000002',
    name: 'مطبخ تجريبي آخر',
    email: 'restaurant2@example.test',
    phone: '02 0000 0001',
    address: 'عنوان توضيحي آخر',
  },
];

export function demoProfile(role: AppProfile['role']): AppProfile {
  if (role === 'admin') {
    return { id: 'demo-admin', role, name: 'إدارة تجريبية' };
  }
  if (role === 'restaurant') {
    return {
      id: 'demo-restaurant',
      role,
      name: demoRestaurants[0].name,
      email: demoRestaurants[0].email,
      restaurantId: demoRestaurants[0].id,
    };
  }
  return {
    id: 'demo-courier',
    role,
    name: demoCouriers[0].fullName,
    phone: demoCouriers[0].phone,
    courierId: demoCouriers[0].id,
    courierCode: demoCouriers[0].code,
    isOnShift: demoCouriers[0].isOnShift,
  };
}
