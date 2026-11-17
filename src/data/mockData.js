export const couriers = [
  {
    id: 'CR-1001',
    fullName: 'محمود علي حسن',
    nationalId: '29801010123456',
    address: 'شارع النيل، الرياض',
    phone: '+966500123456',
    fixedCode: 'MD-1001',
    profileImage: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=600&q=80',
  },
  {
    id: 'CR-1002',
    fullName: 'أحمد سالم محمد',
    nationalId: '29502020234567',
    address: 'حي العليا، جدة',
    phone: '+966511987654',
    fixedCode: 'MD-1002',
    profileImage: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=600&q=80',
  },
  {
    id: 'CR-1003',
    fullName: 'سامي عبدالله فهد',
    nationalId: '29403030345678',
    address: 'حي الروضة، الخبر',
    phone: '+966555321987',
    fixedCode: 'MD-1003',
    profileImage: 'https://images.unsplash.com/photo-1504593811423-6dd665756598?auto=format&fit=crop&w=600&q=80',
  },
];

export const restaurants = [
  {
    id: 'RS-2001',
    name: 'مطعم النخلة',
    manager: 'سارة أحمد',
    phone: '+966540112233',
    address: 'الرياض - حي المروج',
  },
  {
    id: 'RS-2002',
    name: 'برجر هاوس',
    manager: 'أحمد الزهراني',
    phone: '+966500998877',
    address: 'جدة - حي الروضة',
  },
  {
    id: 'RS-2003',
    name: 'سفرة المزارع',
    manager: 'ليلى فلاح',
    phone: '+966545665544',
    address: 'الدمام - حي الشاطئ',
  },
];

export const orderStatusMap = {
  assigned: 'مُسنَد',
  'picked-up': 'تم الاستلام',
  'in-transit': 'قيد التوصيل',
  delivered: 'تم التسليم',
};

export const orders = [
  {
    id: 'OD-1048',
    restaurantId: 'RS-2001',
    restaurantName: 'مطعم النخلة',
    courierId: 'CR-1001',
    courierName: 'محمود علي حسن',
    customerName: 'سلمان محمد',
    customerAddress: 'حي السليمانية، عمارة 7، الطابق 2',
    status: 'assigned',
    items: 'برجر دجاج + جانب 2 + عصير',
    amountCollected: 160,
    restaurantPayout: 92,
    deliveryFee: 18,
    createdAt: '2026-11-17T09:15:00Z',
    etaMinutes: 24,
    distanceKm: 4.6,
  },
  {
    id: 'OD-1049',
    restaurantId: 'RS-2002',
    restaurantName: 'برجر هاوس',
    courierId: 'CR-1001',
    courierName: 'محمود علي حسن',
    customerName: 'رنا سعيد',
    customerAddress: 'حي الحمراء، شارع الملك فهد',
    status: 'picked-up',
    items: '2 شاورما + بطاطس',
    amountCollected: 132,
    restaurantPayout: 76,
    deliveryFee: 16,
    createdAt: '2026-11-17T10:00:00Z',
    etaMinutes: 18,
    distanceKm: 3.4,
  },
  {
    id: 'OD-1051',
    restaurantId: 'RS-2003',
    restaurantName: 'سفرة المزارع',
    courierId: 'CR-1001',
    courierName: 'محمود علي حسن',
    customerName: 'طارق أمين',
    customerAddress: 'المنطقة الشرقية، شارع الأمير',
    status: 'delivered',
    items: 'وجبة عائلة + سلطة',
    amountCollected: 240,
    restaurantPayout: 140,
    deliveryFee: 22,
    createdAt: '2026-11-16T18:20:00Z',
    etaMinutes: 0,
    distanceKm: 6.2,
  },
  {
    id: 'OD-1052',
    restaurantId: 'RS-2001',
    restaurantName: 'مطعم النخلة',
    courierId: 'CR-1002',
    courierName: 'أحمد سالم محمد',
    customerName: 'فاطمة ناصر',
    customerAddress: 'حي الروضة، شارع المطار',
    status: 'assigned',
    items: 'بيتزا مارجريتا + كوكا',
    amountCollected: 118,
    restaurantPayout: 72,
    deliveryFee: 14,
    createdAt: '2026-11-17T11:30:00Z',
    etaMinutes: 30,
    distanceKm: 5.1,
  },
  {
    id: 'OD-1053',
    restaurantId: 'RS-2002',
    restaurantName: 'برجر هاوس',
    courierId: 'CR-1001',
    courierName: 'محمود علي حسن',
    customerName: 'جمال نبيل',
    customerAddress: 'حي الشاطئ، مبنى 11',
    status: 'in-transit',
    items: '3 ساندويتشات + مياه',
    amountCollected: 194,
    restaurantPayout: 110,
    deliveryFee: 20,
    createdAt: '2026-11-17T12:40:00Z',
    etaMinutes: 12,
    distanceKm: 2.7,
  },
  {
    id: 'OD-1054',
    restaurantId: 'RS-2003',
    restaurantName: 'سفرة المزارع',
    courierId: 'CR-1003',
    courierName: 'سامي عبدالله فهد',
    customerName: 'مروان خالد',
    customerAddress: 'حي الخالدية، شارع السلام',
    status: 'delivered',
    items: 'مندي لحم + أرز + سلطة',
    amountCollected: 268,
    restaurantPayout: 152,
    deliveryFee: 25,
    createdAt: '2026-11-15T17:10:00Z',
    etaMinutes: 0,
    distanceKm: 7.8,
  },
];

export const getCourierSummary = (courierId) => {
  const list = orders.filter((order) => order.courierId === courierId);
  const today = list.filter((order) => order.createdAt.startsWith('2026-11-17'));
  const monthTotal = list.reduce((sum, order) => sum + order.amountCollected, 0);
  const payoutTotal = list.reduce((sum, order) => sum + order.restaurantPayout, 0);
  const delivered = list.filter((order) => order.status === 'delivered').length;

  return {
    todayCount: today.length,
    todayCollected: today.reduce((sum, order) => sum + order.amountCollected, 0),
    payoutTotal,
    monthTotal,
    delivered,
  };
};

export const getAdminSummary = (list = orders) => {
  const today = list.filter((order) => order.createdAt.startsWith('2026-11-17'));
  const month = list.filter((order) => order.createdAt.startsWith('2026-11'));

  return {
    totalOrders: list.length,
    todayCount: today.length,
    todayCollected: today.reduce((sum, order) => sum + order.amountCollected, 0),
    monthRevenue: month.reduce((sum, order) => sum + order.amountCollected, 0),
    monthPayout: month.reduce((sum, order) => sum + order.restaurantPayout, 0),
    delivered: list.filter((order) => order.status === 'delivered').length,
  };
};
