import type {
  AppProfile,
  Courier,
  DeliveryOrder,
  Restaurant,
  RestaurantMenuItem,
  SupportAgent,
  SupportConversation,
  SupportMessage,
} from '../types';

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
    status: 'picked_up',
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
    isActive: true,
    isOnShift: true,
    isOnBreak: false,
    contractStartDate: today.slice(0, 10),
    contractEndDate: new Date(new Date(today).setFullYear(now.getFullYear() + 1)).toISOString().slice(0, 10),
    isTerminated: false,
  },
  {
    id: 2,
    code: 'CR-000002',
    fullName: 'مندوب تجريبي آخر',
    phone: '010 0000 0004',
    email: 'courier2@example.test',
    isActive: true,
    isOnShift: true,
    isOnBreak: false,
    contractStartDate: today.slice(0, 10),
    contractEndDate: new Date(new Date(today).setFullYear(now.getFullYear() + 1)).toISOString().slice(0, 10),
    isTerminated: false,
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
    deliveryFeePiasters: 4500,
  },
  {
    id: 2,
    code: 'RS-000002',
    name: 'مطبخ تجريبي آخر',
    email: 'restaurant2@example.test',
    phone: '02 0000 0001',
    address: 'عنوان توضيحي آخر',
    deliveryFeePiasters: 2750,
  },
];

export const demoRestaurantMenuItems: RestaurantMenuItem[] = [
  { id: 1, name: 'وجبة دجاج', pricePiasters: 16500, isAvailable: true },
  { id: 2, name: 'وجبة لحم', pricePiasters: 22000, isAvailable: true },
  { id: 3, name: 'مشروب', pricePiasters: 2500, isAvailable: true },
  { id: 4, name: 'بطاطس', pricePiasters: 4500, isAvailable: false },
];

export const demoSupportAgents: SupportAgent[] = [
  {
    id: 'demo-support',
    name: 'موظف الدعم التجريبي',
    email: 'support@example.test',
    createdAt: today,
  },
];

export const demoSupportConversations: SupportConversation[] = [
  {
    id: 'demo-support-conversation',
    openedBy: 'demo-courier',
    requesterRole: 'courier',
    requesterName: 'مندوب تجريبي',
    subject: 'مشكلة في استلام الطلب',
    relatedOrderId: 'demo-order-1002',
    relatedOrderCode: 'DEMO-1002',
    status: 'in_progress',
    assignedTo: 'demo-support',
    assignedName: 'موظف الدعم التجريبي',
    lastMessageBody: 'راجع حالة الطلب وأبلغني لو احتجت مساعدة أخرى.',
    lastMessageAt: today,
    createdAt: today,
  },
];

export const demoSupportMessages: SupportMessage[] = [
  {
    id: 1,
    conversationId: 'demo-support-conversation',
    senderId: 'demo-courier',
    senderName: 'مندوب تجريبي',
    senderRole: 'courier',
    body: 'الطلب ظاهر عندي لكن المطعم يقول إنه لم يجهزه بعد.',
    createdAt: today,
  },
  {
    id: 2,
    conversationId: 'demo-support-conversation',
    senderId: 'demo-support',
    senderName: 'موظف الدعم التجريبي',
    senderRole: 'support',
    body: 'راجع حالة الطلب وأبلغني لو احتجت مساعدة أخرى.',
    createdAt: today,
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
      deliveryFeePiasters: demoRestaurants[0].deliveryFeePiasters,
    };
  }
  if (role === 'support') {
    return {
      id: 'demo-support',
      role,
      name: demoSupportAgents[0].name,
      email: demoSupportAgents[0].email,
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
