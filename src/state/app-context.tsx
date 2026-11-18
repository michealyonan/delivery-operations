import { decode } from 'base64-arraybuffer';
import type { ImagePickerAsset } from 'expo-image-picker';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { Platform } from 'react-native';

import {
  demoCouriers,
  demoOrders,
  demoProfile,
  demoRestaurantMenuItems,
  demoRestaurants,
  demoSupportAgents,
  demoSupportConversations,
  demoSupportMessages,
} from '../lib/demo-data';
import { errorMessage } from '../lib/error-message';
import { orderTransferReasonOptions } from '../lib/order-transfer';
import { isBackendConfigured, supabase } from '../lib/supabase';
import type {
  AppProfile,
  BreakStartedBy,
  Courier,
  CourierBreakPeriod,
  CourierFeeRemittance,
  CourierLocation,
  CourierPrivateDetails,
  CourierProfileUpdateInput,
  CourierShiftBooking,
  CourierShiftDayBlock,
  CourierShiftRecord,
  CourierShiftSlot,
  DeliveryOrder,
  ManagedAccountType,
  NewCourierInput,
  NewOrderInput,
  NewRestaurantInput,
  NewSupportAgentInput,
  OrderAssignmentAttempt,
  OrderAssignmentAttemptStatus,
  OrderReturn,
  OrderReturnStatus,
  OrderTransferReason,
  OrderTransferRequest,
  OrderStatus,
  Restaurant,
  RestaurantMenuItem,
  SupportAgent,
  SupportConversation,
  SupportConversationStatus,
  SupportMessage,
  TemporaryCredentials,
  UserRole,
} from '../types';

interface AppContextValue {
  profile: AppProfile | null;
  isLoading: boolean;
  isDemo: boolean;
  hasLoadedData: boolean;
  refreshError: string | null;
  orders: DeliveryOrder[];
  orderAssignmentAttempts: OrderAssignmentAttempt[];
  orderReturns: OrderReturn[];
  orderTransferRequests: OrderTransferRequest[];
  courierFeeRemittances: CourierFeeRemittance[];
  couriers: Courier[];
  shiftSlots: CourierShiftSlot[];
  shiftBookings: CourierShiftBooking[];
  shiftRecords: CourierShiftRecord[];
  breakPeriods: CourierBreakPeriod[];
  shiftDayBlocks: CourierShiftDayBlock[];
  restaurants: Restaurant[];
  restaurantMenuItems: RestaurantMenuItem[];
  loadRestaurantMenu: (restaurantId?: number) => Promise<void>;
  locations: CourierLocation[];
  breakRequestsEnabled: boolean;
  supportRevision: number;
  loadSupportConversations: () => Promise<SupportConversation[]>;
  loadSupportMessages: (conversationId: string) => Promise<SupportMessage[]>;
  listSupportAgents: () => Promise<SupportAgent[]>;
  createSupportConversation: (
    subject: string,
    body: string,
    relatedOrderId?: string,
  ) => Promise<string>;
  sendSupportMessage: (conversationId: string, body: string) => Promise<void>;
  claimSupportConversation: (conversationId: string) => Promise<void>;
  setSupportConversationStatus: (
    conversationId: string,
    status: SupportConversationStatus,
  ) => Promise<void>;
  createSupportAgent: (input: NewSupportAgentInput) => Promise<TemporaryCredentials>;
  signIn: (email: string, password: string) => Promise<UserRole>;
  signInDemo: (role: UserRole) => void;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  loadOrderDetails: (orderId: string) => Promise<DeliveryOrder | null>;
  publishShiftSlots: (slots: {
    shiftDate: string;
    startsAt: string;
    endsAt: string;
  }[]) => Promise<number>;
  bookShift: (slotId: number) => Promise<void>;
  offerShiftSwap: (bookingId: number) => Promise<void>;
  removeCourierShift: (bookingId: number) => Promise<void>;
  blockCourierShiftDay: (courierId: number, shiftDate: string, reason: string) => Promise<void>;
  unblockCourierShiftDay: (courierId: number, shiftDate: string) => Promise<void>;
  registerCourierPushToken: (token: string, platform: 'ios' | 'android') => Promise<void>;
  notifyUnbookedCouriers: () => Promise<{ sent: number; skipped: number; failed: number }>;
  createOrder: (input: NewOrderInput) => Promise<void>;
  acceptAdminOrder: (orderId: string) => Promise<number | null>;
  saveRestaurantMenuItem: (
    itemId: number | null,
    name: string,
    pricePiasters: number,
    isAvailable: boolean,
  ) => Promise<void>;
  createCourier: (input: NewCourierInput) => Promise<TemporaryCredentials>;
  createRestaurant: (input: NewRestaurantInput) => Promise<TemporaryCredentials>;
  cancelOrder: (orderId: string) => Promise<void>;
  startOrderReturn: (orderId: string) => Promise<void>;
  completeOrderReturn: (
    returnId: string,
    image: ImagePickerAsset,
    courierReceivedRestaurantRefund: boolean,
  ) => Promise<void>;
  confirmOrderReturn: (returnId: string) => Promise<void>;
  requestOrderTransfer: (
    orderId: string,
    reason: OrderTransferReason,
    details: string,
  ) => Promise<void>;
  decideOrderTransfer: (requestId: string, approve: boolean) => Promise<number | null>;
  assignOrder: (
    orderId: string,
    courierId: number,
    deliveryFeePiasters?: number,
  ) => Promise<void>;
  assignOrderToNearestCourier: (
    orderId: string,
    deliveryFeePiasters: number,
  ) => Promise<number>;
  acceptOrder: (orderId: string) => Promise<void>;
  advanceOrder: (orderId: string, status: 'picked_up' | 'delivered') => Promise<void>;
  setShift: (active: boolean) => Promise<void>;
  approveCourierShiftClose: (courierId: number) => Promise<void>;
  rejectCourierShiftClose: (courierId: number) => Promise<void>;
  setCourierOnBreak: (courierId: number, durationMinutes: number) => Promise<string>;
  endCourierBreak: (courierId: number) => Promise<void>;
  recordCourierFeeRemittance: (
    courierId: number,
    amountPiasters: number,
  ) => Promise<CourierFeeRemittance>;
  setCourierActive: (courierId: number, active: boolean) => Promise<void>;
  setBreakRequestsEnabled: (enabled: boolean) => Promise<void>;
  requestCourierBreak: (durationMinutes: number) => Promise<string>;
  renewCourierContract: (courierId: number) => Promise<void>;
  terminateCourier: (courierId: number) => Promise<void>;
  updateCourierProfile: (
    courierId: number,
    input: CourierProfileUpdateInput,
  ) => Promise<void>;
  setAccountPassword: (
    accountType: ManagedAccountType,
    accountId: number | string,
    password?: string,
  ) => Promise<{ temporaryPassword?: string }>;
  getCourierPrivateDetails: (courierId: number) => Promise<CourierPrivateDetails>;
  getCourierContact: (orderId: string) => Promise<{ name: string; phone: string } | null>;
  setRestaurantLocation: (latitude: number, longitude: number) => Promise<void>;
  setRestaurantAcceptingOrders: (restaurantId: number, acceptsOrders: boolean) => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

const cloneDemoOrders = () => demoOrders.map((order) => ({ ...order }));

function distanceInMeters(
  firstLatitude: number,
  firstLongitude: number,
  secondLatitude: number,
  secondLongitude: number,
) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(secondLatitude - firstLatitude);
  const longitudeDelta = radians(secondLongitude - firstLongitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(firstLatitude)) *
      Math.cos(radians(secondLatitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function assertBackend() {
  if (!supabase || !isBackendConfigured) {
    throw new Error('يلزم ربط قاعدة البيانات قبل حفظ بيانات حقيقية.');
  }
  return supabase;
}

function getRefreshErrorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = error.code;
    if (code === '42501' || code === 'PGRST301') {
      return 'تعذر تحميل بيانات الحساب بسبب صلاحيات قاعدة البيانات. تحقق من صلاحيات الإدارة ثم أعد المحاولة.';
    }
  }
  if (error instanceof TypeError) {
    return 'تعذر الاتصال بالخادم. تحقق من الإنترنت وإعدادات الاتصال ثم أعد المحاولة.';
  }
  return 'تعذر تحميل بيانات الحساب كاملة. فشل التحميل لا يعني حذف البيانات؛ أعد المحاولة ولا تُنشئ الحسابات الموجودة من جديد.';
}

async function getAccountFunctionErrorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'context' in error) {
    const response = error.context;
    if (typeof Response !== 'undefined' && response instanceof Response) {
      const payload = await response.clone().json().catch(() => null);
      if (typeof payload?.error === 'string') return payload.error;
      if (typeof payload?.message === 'string') return payload.message;
      if (response.status === 401) return 'انتهت جلسة الدخول. سجّل الخروج ثم ادخل مرة أخرى.';
      if (response.status === 403) {
        return 'لم يقبل الخادم صلاحيات الإدارة. تأكد من الدخول بحساب الإدارة.';
      }
    }
  }
  return error instanceof Error ? error.message : 'تعذر إنشاء الحساب. حاول مرة أخرى.';
}

function asNumber(value: unknown) {
  return typeof value === 'number' ? value : Number(value ?? 0);
}

function isCourierPrivateDetails(value: unknown): value is CourierPrivateDetails {
  if (!value || typeof value !== 'object') return false;
  const details = value as Record<string, unknown>;
  return (
    typeof details.id === 'number' &&
    typeof details.code === 'string' &&
    typeof details.fullName === 'string' &&
    typeof details.email === 'string' &&
    typeof details.phone === 'string' &&
    typeof details.nationalId === 'string' &&
    typeof details.address === 'string' &&
    typeof details.idCardUrl === 'string' &&
    (details.selfieUrl === undefined || typeof details.selfieUrl === 'string') &&
    typeof details.isActive === 'boolean' &&
    typeof details.isOnShift === 'boolean' &&
    (details.breakUntil === undefined || typeof details.breakUntil === 'string') &&
    typeof details.contractStartDate === 'string' &&
    typeof details.contractEndDate === 'string' &&
    (details.terminatedAt === undefined || typeof details.terminatedAt === 'string')
  );
}

function mapOrder(row: Record<string, unknown>): DeliveryOrder {
  return {
    id: String(row.id),
    code: String(row.order_code ?? row.id),
    orderSource: row.order_source === 'admin' ? 'admin' : 'restaurant',
    restaurantId: asNumber(row.restaurant_id),
    restaurantName: String(row.restaurant_name ?? 'مطعم'),
    restaurantAddress: String(row.restaurant_address ?? ''),
    restaurantLatitude:
      row.restaurant_latitude == null ? undefined : asNumber(row.restaurant_latitude),
    restaurantLongitude:
      row.restaurant_longitude == null ? undefined : asNumber(row.restaurant_longitude),
    courierId: row.courier_id == null ? undefined : asNumber(row.courier_id),
    customerName: String(row.customer_name ?? ''),
    customerPhone: String(row.customer_phone ?? ''),
    customerAddress: String(row.customer_address ?? ''),
    itemsText: String(row.items_text ?? ''),
    notes: String(row.notes ?? ''),
    amountDuePiasters: asNumber(row.amount_due_piasters),
    deliveryFeePiasters:
      row.delivery_fee_piasters == null ? undefined : asNumber(row.delivery_fee_piasters),
    deliveryFeeRemittedPiasters:
      row.delivery_fee_remitted_piasters == null
        ? 0
        : asNumber(row.delivery_fee_remitted_piasters),
    restaurantDuePiasters: asNumber(row.restaurant_due_piasters),
    collectedPiasters:
      row.collected_piasters == null ? undefined : asNumber(row.collected_piasters),
    paidToRestaurantPiasters:
      row.paid_to_restaurant_piasters == null
        ? undefined
        : asNumber(row.paid_to_restaurant_piasters),
    status: row.status as OrderStatus,
    createdAt: String(row.created_at),
    restaurantAcceptedAt:
      row.restaurant_accepted_at == null ? undefined : String(row.restaurant_accepted_at),
    assignedAt: row.assigned_at == null ? undefined : String(row.assigned_at),
    lastUnacceptedCourierId:
      row.last_unaccepted_courier_id == null
        ? undefined
        : asNumber(row.last_unaccepted_courier_id),
    assignmentExpiredAt:
      row.assignment_expired_at == null ? undefined : String(row.assignment_expired_at),
    acceptedAt: row.accepted_at == null ? undefined : String(row.accepted_at),
    deliveredAt: row.delivered_at == null ? undefined : String(row.delivered_at),
    cancelledAt:
      row.status === 'cancelled' && row.updated_at != null
        ? String(row.updated_at)
        : undefined,
  };
}

function mapOrderReturn(row: Record<string, unknown>): OrderReturn {
  return {
    id: String(row.id),
    orderId: String(row.order_id),
    courierId: asNumber(row.courier_id),
    restaurantId: asNumber(row.restaurant_id),
    status: row.status as OrderReturnStatus,
    reason: String(row.reason ?? 'رفض العميل الاستلام'),
    startedAt: String(row.started_at),
    returnedAt: row.returned_at == null ? undefined : String(row.returned_at),
    courierReceivedRestaurantRefund:
      row.courier_received_restaurant_refund == null
        ? undefined
        : Boolean(row.courier_received_restaurant_refund),
  };
}

function mapOrderAssignmentAttempt(row: Record<string, unknown>): OrderAssignmentAttempt {
  return {
    id: String(row.id),
    orderId: String(row.order_id),
    orderCode: String(row.order_code),
    courierId: asNumber(row.courier_id),
    assignedAt: String(row.assigned_at),
    status: row.status as OrderAssignmentAttemptStatus,
    acceptedAt: row.accepted_at == null ? undefined : String(row.accepted_at),
    resolvedAt: row.resolved_at == null ? undefined : String(row.resolved_at),
  };
}

function mapOrderTransferRequest(row: Record<string, unknown>): OrderTransferRequest {
  return {
    id: String(row.id),
    orderId: String(row.order_id),
    fromCourierId: asNumber(row.from_courier_id),
    fromCourierName: String(row.from_courier_name),
    fromCourierCode: String(row.from_courier_code),
    fromCourierPhone: String(row.from_courier_phone),
    toCourierId: row.to_courier_id == null ? undefined : asNumber(row.to_courier_id),
    toCourierName: row.to_courier_name == null ? undefined : String(row.to_courier_name),
    toCourierCode: row.to_courier_code == null ? undefined : String(row.to_courier_code),
    reason: row.reason as OrderTransferReason,
    reasonDetails: String(row.reason_details ?? ''),
    status: row.status as OrderTransferRequest['status'],
    requiresHandoff: Boolean(row.requires_handoff),
    requestedAt: String(row.requested_at),
    resolvedAt: row.resolved_at == null ? undefined : String(row.resolved_at),
  };
}

function allocateCourierFeeRemittance(
  orders: DeliveryOrder[],
  courierId: number,
  amountPiasters: number,
) {
  let remaining = amountPiasters;
  const allocations = new Map<string, number>();
  const eligible = orders
    .filter(
      (order) =>
        order.courierId === courierId &&
        order.status === 'delivered' &&
        (order.deliveryFeePiasters ?? 0) > (order.deliveryFeeRemittedPiasters ?? 0),
    )
    .sort((a, b) => {
      const aTime = new Date(a.deliveredAt ?? a.createdAt).getTime();
      const bTime = new Date(b.deliveredAt ?? b.createdAt).getTime();
      return aTime - bTime || a.id.localeCompare(b.id);
    });

  for (const order of eligible) {
    if (remaining <= 0) break;
    const feeDue =
      (order.deliveryFeePiasters ?? 0) - (order.deliveryFeeRemittedPiasters ?? 0);
    const allocation = Math.min(feeDue, remaining);
    allocations.set(order.id, allocation);
    remaining -= allocation;
  }

  return orders.map((order) => {
    const allocation = allocations.get(order.id);
    return allocation == null
      ? order
      : {
          ...order,
          deliveryFeeRemittedPiasters:
            (order.deliveryFeeRemittedPiasters ?? 0) + allocation,
        };
  });
}

function mapSupportConversation(row: Record<string, unknown>): SupportConversation {
  return {
    id: String(row.id),
    openedBy: String(row.opened_by),
    requesterRole: row.requester_role as SupportConversation['requesterRole'],
    requesterName: String(row.requester_name),
    subject: String(row.subject),
    relatedOrderId: row.related_order_id == null ? undefined : String(row.related_order_id),
    relatedOrderCode: row.related_order_code == null ? undefined : String(row.related_order_code),
    status: row.status as SupportConversationStatus,
    assignedTo: row.assigned_to == null ? undefined : String(row.assigned_to),
    assignedName: row.assigned_name == null ? undefined : String(row.assigned_name),
    lastMessageBody: String(row.last_message_body ?? ''),
    lastMessageAt: String(row.last_message_at),
    createdAt: String(row.created_at),
  };
}

function mapSupportMessage(row: Record<string, unknown>): SupportMessage {
  return {
    id: asNumber(row.id),
    conversationId: String(row.conversation_id),
    senderId: String(row.sender_id),
    senderName: String(row.sender_name),
    senderRole: row.sender_role as UserRole,
    body: String(row.body),
    createdAt: String(row.created_at),
  };
}

function mapCourierShiftSlot(row: Record<string, unknown>): CourierShiftSlot {
  return {
    id: asNumber(row.id),
    shiftDate: String(row.shift_date),
    startsAt: String(row.starts_at),
    endsAt: String(row.ends_at),
    isCancelled: Boolean(row.is_cancelled),
  };
}

function mapCourierShiftBooking(row: Record<string, unknown>): CourierShiftBooking {
  return {
    id: asNumber(row.id),
    slotId: asNumber(row.slot_id),
    courierId: asNumber(row.courier_id),
    status: row.status as CourierShiftBooking['status'],
    bookedAt: String(row.booked_at),
    swapListedAt: row.swap_listed_at == null ? undefined : String(row.swap_listed_at),
  };
}

function mapCourierShiftRecord(row: Record<string, unknown>): CourierShiftRecord {
  return {
    id: asNumber(row.id),
    courierId: asNumber(row.courier_id),
    bookingId: row.booking_id == null ? undefined : asNumber(row.booking_id),
    startedAt: row.started_at == null ? undefined : String(row.started_at),
    endedAt: row.ended_at == null ? undefined : String(row.ended_at),
  };
}

function mapCourierBreakPeriod(row: Record<string, unknown>): CourierBreakPeriod {
  return {
    id: asNumber(row.id),
    courierId: asNumber(row.courier_id),
    shiftId: row.shift_id == null ? undefined : asNumber(row.shift_id),
    startedAt: String(row.started_at),
    scheduledEndAt: String(row.scheduled_end_at),
    endedAt: row.ended_at == null ? undefined : String(row.ended_at),
    startedBy: row.started_by as CourierBreakPeriod['startedBy'],
  };
}

function mapCourierShiftDayBlock(row: Record<string, unknown>): CourierShiftDayBlock {
  return {
    courierId: asNumber(row.courier_id),
    shiftDate: String(row.shift_date),
    reason: String(row.reason ?? ''),
  };
}

function createDemoShiftSlots(): CourierShiftSlot[] {
  const slots: CourierShiftSlot[] = [];
  for (let offset = 1; offset <= 7; offset += 1) {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    const shiftDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const startsAt = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 9);
    const endsAt = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 17);
    slots.push({
      id: offset,
      shiftDate,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      isCancelled: false,
    });
  }
  return slots;
}

export function AppProvider({ children }: PropsWithChildren) {
  const [profile, setProfile] = useState<AppProfile | null>(null);
  const courierPhotoUrlCache = useRef(new Map<string, { url: string; expiresAt: number }>());
  const [isLoading, setIsLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);
  const [hasLoadedData, setHasLoadedData] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [orderAssignmentAttempts, setOrderAssignmentAttempts] = useState<OrderAssignmentAttempt[]>([]);
  const [orderReturns, setOrderReturns] = useState<OrderReturn[]>([]);
  const [orderTransferRequests, setOrderTransferRequests] = useState<OrderTransferRequest[]>([]);
  const [courierFeeRemittances, setCourierFeeRemittances] = useState<CourierFeeRemittance[]>([]);
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [shiftSlots, setShiftSlots] = useState<CourierShiftSlot[]>([]);
  const [shiftBookings, setShiftBookings] = useState<CourierShiftBooking[]>([]);
  const [shiftRecords, setShiftRecords] = useState<CourierShiftRecord[]>([]);
  const [breakPeriods, setBreakPeriods] = useState<CourierBreakPeriod[]>([]);
  const [shiftDayBlocks, setShiftDayBlocks] = useState<CourierShiftDayBlock[]>([]);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [restaurantMenuItems, setRestaurantMenuItems] = useState<RestaurantMenuItem[]>([]);
  const [locations, setLocations] = useState<CourierLocation[]>([]);
  const [breakRequestsEnabled, setBreakRequestsEnabledState] = useState(true);
  const [demoConversations, setDemoConversations] = useState(
    demoSupportConversations.map((conversation) => ({ ...conversation })),
  );
  const [demoMessages, setDemoMessages] = useState(
    demoSupportMessages.map((message) => ({ ...message })),
  );
  const [supportRevision, setSupportRevision] = useState(0);

  const loadProfile = useCallback(async (userId: string): Promise<AppProfile> => {
    const client = assertBackend();
    const { data: record, error } = await client
      .from('profiles')
      .select('id, role, full_name, email, phone, profile_photo_path')
      .eq('id', userId)
      .single();
    if (error) throw error;
    if (!record || !['admin', 'restaurant', 'courier', 'support'].includes(record.role)) {
      throw new Error('نوع الحساب غير معروف. تواصل مع الإدارة.');
    }

    const base: AppProfile = {
      id: record.id,
      role: record.role as UserRole,
      name: record.full_name,
      email: record.email ?? undefined,
      phone: record.phone ?? undefined,
    };

    if (base.role === 'courier') {
      const { data: courier, error: courierError } = await client
        .from('couriers')
        .select('id, courier_code, is_active, contract_start_date, contract_end_date, terminated_at')
        .eq('user_id', userId)
        .single();
      if (courierError) throw courierError;
      let profilePhotoUrl: string | undefined;
      if (record.profile_photo_path) {
        const { data: photo, error: photoError } = await client.storage
          .from('courier-profile-photos')
          .createSignedUrl(record.profile_photo_path, 60 * 60 * 24);
        if (photoError) throw photoError;
        profilePhotoUrl = photo.signedUrl;
      }
      const { data: presence, error: presenceError } = await client
        .from('courier_presence')
        .select('is_on_shift, break_until, break_started_by, shift_close_requested_at')
        .eq('courier_id', courier.id)
        .maybeSingle();
      if (presenceError) throw presenceError;
      const { data: shift, error: shiftError } = await client
        .from('courier_shifts')
        .select('started_at, ended_at, created_at')
        .eq('courier_id', courier.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (shiftError) throw shiftError;
      return {
        ...base,
        courierId: asNumber(courier.id),
        courierCode: courier.courier_code,
        profilePhotoUrl,
        isOnShift: Boolean(presence?.is_on_shift),
        shiftStartedAt: shift?.ended_at == null ? shift?.started_at ?? undefined : undefined,
        shiftCloseRequestedAt: presence?.shift_close_requested_at ?? undefined,
        shiftEndedAt: shift?.ended_at ?? undefined,
        breakUntil: presence?.break_until ?? undefined,
        breakStartedBy: presence?.break_started_by as BreakStartedBy | undefined,
        contractStartDate: courier.contract_start_date,
        contractEndDate: courier.contract_end_date,
        isTerminated: Boolean(courier.terminated_at),
      };
    }

    if (base.role === 'restaurant') {
      const { data: restaurant, error: restaurantError } = await client
        .from('restaurants')
        .select('id, address, latitude, longitude, accepts_orders')
        .eq('user_id', userId)
        .single();
      if (restaurantError) throw restaurantError;
      return {
        ...base,
        restaurantId: asNumber(restaurant.id),
        restaurantAddress: restaurant.address,
        restaurantLatitude:
          restaurant.latitude == null ? undefined : asNumber(restaurant.latitude),
        restaurantLongitude:
          restaurant.longitude == null ? undefined : asNumber(restaurant.longitude),
        restaurantAcceptsOrders: restaurant.accepts_orders,
      };
    }

    return base;
  }, []);

  const refreshData = useCallback(async () => {
    if (isDemo) {
      setOrders(cloneDemoOrders());
      setOrderTransferRequests([]);
      setCourierFeeRemittances([]);
      setCouriers(
        demoCouriers.map((courier) => ({
          ...courier,
          isOnBreak: Boolean(courier.breakUntil && new Date(courier.breakUntil) > new Date()),
          contractStartDate: courier.contractStartDate ?? new Date().toISOString().slice(0, 10),
          contractEndDate:
            courier.contractEndDate ??
            new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().slice(0, 10),
          isTerminated: courier.isTerminated ?? false,
        })),
      );
      setRestaurants(demoRestaurants.map((restaurant) => ({ ...restaurant })));
      setRestaurantMenuItems(
        demoRestaurantMenuItems.map((item) => ({ ...item })),
      );
      setBreakRequestsEnabledState(true);
      return;
    }
    if (!profile || !supabase) return;
    const client = assertBackend();

    const [
      { data: slotRows, error: slotError },
      { data: bookingRows, error: bookingError },
      { data: shiftRecordRows, error: shiftRecordError },
      { data: breakPeriodRows, error: breakPeriodError },
      { data: dayBlockRows, error: dayBlockError },
    ] = await Promise.all([
      client
        .from('courier_shift_slots')
        .select('id, shift_date, starts_at, ends_at, is_cancelled')
        .order('starts_at'),
      client
        .from('courier_shift_bookings')
        .select('id, slot_id, courier_id, status, booked_at, swap_listed_at')
        .order('booked_at', { ascending: false }),
      client
        .from('courier_shifts')
        .select('id, courier_id, booking_id, started_at, ended_at')
        .order('started_at', { ascending: false }),
      client
        .from('courier_break_periods')
        .select('id, courier_id, shift_id, started_at, scheduled_end_at, ended_at, started_by')
        .order('started_at', { ascending: false }),
      client
        .from('courier_shift_day_blocks')
        .select('courier_id, shift_date, reason')
        .order('shift_date'),
    ]);
    if (slotError) throw slotError;
    if (bookingError) throw bookingError;
    if (shiftRecordError) throw shiftRecordError;
    if (breakPeriodError) throw breakPeriodError;
    if (dayBlockError) throw dayBlockError;
    setShiftSlots((slotRows ?? []).map((row) => mapCourierShiftSlot(row)));
    setShiftBookings((bookingRows ?? []).map((row) => mapCourierShiftBooking(row)));
    setShiftRecords((shiftRecordRows ?? []).map((row) => mapCourierShiftRecord(row)));
    setBreakPeriods((breakPeriodRows ?? []).map((row) => mapCourierBreakPeriod(row)));
    setShiftDayBlocks((dayBlockRows ?? []).map((row) => mapCourierShiftDayBlock(row)));

    if (profile.role === 'courier' && profile.courierId) {
      const client = assertBackend();
      const { data: presence, error: presenceError } = await client
        .from('courier_presence')
        .select('is_on_shift, break_until, break_started_by, shift_close_requested_at')
        .eq('courier_id', profile.courierId)
        .maybeSingle();
      if (presenceError) throw presenceError;
      const { data: shift, error: shiftError } = await client
        .from('courier_shifts')
        .select('started_at, ended_at, created_at')
        .eq('courier_id', profile.courierId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (shiftError) throw shiftError;
      setProfile((current) =>
        current?.id === profile.id
          ? {
              ...current,
              isOnShift: Boolean(presence?.is_on_shift),
              breakUntil: presence?.break_until ?? undefined,
              breakStartedBy: presence?.break_started_by as BreakStartedBy | undefined,
              shiftStartedAt: shift?.ended_at == null ? shift?.started_at ?? undefined : undefined,
              shiftCloseRequestedAt: presence?.shift_close_requested_at ?? undefined,
              shiftEndedAt: shift?.ended_at ?? undefined,
            }
          : current,
      );
    }

    if (profile.role === 'restaurant' && profile.restaurantId) {
      const { data: restaurantState, error: restaurantError } = await supabase
        .from('restaurants')
        .select('accepts_orders')
        .eq('id', profile.restaurantId)
        .single();
      if (restaurantError) throw restaurantError;
      setProfile((current) =>
        current?.id === profile.id
          ? { ...current, restaurantAcceptsOrders: restaurantState.accepts_orders }
          : current,
      );
    }

    const { data: orderRows, error: ordersError } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });
    if (ordersError) throw ordersError;
    const orderIds = (orderRows ?? []).map((row) => row.id);
    const lineItemsByOrder = new Map<string, DeliveryOrder['lineItems']>();
    if (orderIds.length > 0) {
      const { data: lineRows, error: lineItemsError } = await supabase
        .from('order_items')
        .select('id, order_id, menu_item_id, item_name, unit_price_piasters, quantity, line_total_piasters')
        .in('order_id', orderIds)
        .order('id');
      if (lineItemsError) throw lineItemsError;
      for (const row of lineRows ?? []) {
        const orderItems = lineItemsByOrder.get(row.order_id) ?? [];
        orderItems.push({
          id: asNumber(row.id),
          menuItemId: row.menu_item_id == null ? undefined : asNumber(row.menu_item_id),
          name: row.item_name,
          unitPricePiasters: asNumber(row.unit_price_piasters),
          quantity: row.quantity,
          lineTotalPiasters: asNumber(row.line_total_piasters),
        });
        lineItemsByOrder.set(row.order_id, orderItems);
      }
    }
    let cashByOrder = new Map<
      string,
      { collected: number; paid: number; paidToPreviousCourier: number; previousCourierId?: number }
    >();
    if (profile.role === 'admin' || profile.role === 'courier') {
      const { data: cashRows, error: cashError } = await supabase
        .from('order_cash')
        .select(
          'order_id, collected_piasters, paid_to_restaurant_piasters, paid_to_previous_courier_piasters, previous_courier_id',
        );
      if (cashError) throw cashError;
      cashByOrder = new Map(
        (cashRows ?? []).map((item) => [
          item.order_id,
          {
            collected: asNumber(item.collected_piasters),
            paid: asNumber(item.paid_to_restaurant_piasters),
            paidToPreviousCourier: asNumber(item.paid_to_previous_courier_piasters),
            previousCourierId:
              item.previous_courier_id == null ? undefined : asNumber(item.previous_courier_id),
          },
        ]),
      );
    }
    setOrders(
      (orderRows ?? []).map((row) => {
        const order = mapOrder(row as Record<string, unknown>);
        const cash = cashByOrder.get(order.id);
        return {
          ...order,
          ...(lineItemsByOrder.has(order.id)
            ? { lineItems: lineItemsByOrder.get(order.id) }
            : {}),
          ...(cash
            ? {
                collectedPiasters: cash.collected,
                paidToRestaurantPiasters: cash.paid,
                paidToPreviousCourierPiasters: cash.paidToPreviousCourier,
                previousCourierId: cash.previousCourierId,
              }
            : {}),
        };
      }),
    );
    const { data: returnRows, error: returnError } = await client
      .from('order_returns')
      .select('*')
      .order('started_at', { ascending: false });
    if (returnError) throw returnError;
    const mappedReturns = await Promise.all(
      (returnRows ?? []).map(async (row) => {
        const orderReturn = mapOrderReturn(row as Record<string, unknown>);
        if (!row.photo_path) return orderReturn;
        const { data: photo, error: photoError } = await client.storage
          .from('courier-return-photos')
          .createSignedUrl(String(row.photo_path), 60 * 60);
        if (photoError) throw photoError;
        return { ...orderReturn, photoUrl: photo.signedUrl };
      }),
    );
    setOrderReturns(mappedReturns);
    const { data: assignmentRows, error: assignmentError } = await client
      .from('order_assignment_attempts')
      .select('*')
      .order('assigned_at', { ascending: false });
    if (assignmentError) throw assignmentError;
    setOrderAssignmentAttempts(
      (assignmentRows ?? []).map((row) =>
        mapOrderAssignmentAttempt(row as Record<string, unknown>),
      ),
    );
    const { data: transferRows, error: transferError } = await client
      .from('order_transfer_requests')
      .select('*')
      .order('requested_at', { ascending: false });
    if (transferError) throw transferError;
    setOrderTransferRequests(
      (transferRows ?? []).map((row) =>
        mapOrderTransferRequest(row as Record<string, unknown>),
      ),
    );
    if (profile.role === 'admin' || profile.role === 'courier') {
      const { data: remittanceRows, error: remittancesError } = await supabase
        .from('courier_fee_remittances')
        .select('id, courier_id, amount_piasters, received_at, received_by')
        .order('received_at', { ascending: false });
      if (remittancesError) throw remittancesError;
      setCourierFeeRemittances(
        (remittanceRows ?? []).map((row) => ({
          id: String(row.id),
          courierId: asNumber(row.courier_id),
          amountPiasters: asNumber(row.amount_piasters),
          receivedAt: String(row.received_at),
          receivedBy: String(row.received_by),
        })),
      );
    } else {
      setCourierFeeRemittances([]);
    }

    const { data: settings, error: settingsError } = await supabase
      .from('delivery_settings')
      .select('break_requests_enabled')
      .eq('singleton', true)
      .single();
    if (settingsError) throw settingsError;
    setBreakRequestsEnabledState(settings.break_requests_enabled);

    if (profile.role === 'restaurant' && profile.restaurantId) {
      const { data: menuRows, error: menuError } = await supabase
        .from('restaurant_menu_items')
        .select('id, name, price_piasters, is_available')
        .eq('restaurant_id', profile.restaurantId)
        .order('name');
      if (menuError) throw menuError;
      setRestaurantMenuItems(
        (menuRows ?? []).map((item) => ({
          id: asNumber(item.id),
          name: item.name,
          pricePiasters: asNumber(item.price_piasters),
          isAvailable: item.is_available,
        })),
      );
    } else {
      setRestaurantMenuItems([]);
    }

    if (profile.role !== 'admin') return;

    const { data: courierRows, error: couriersError } = await supabase
      .from('couriers')
      .select('id, courier_code, user_id, full_name, phone, email, is_active, contract_start_date, contract_end_date, terminated_at, courier_presence(is_on_shift, break_until, break_started_by, shift_close_requested_at), profiles!couriers_user_id_fkey(profile_photo_path)');
    if (couriersError) throw couriersError;
    const courierPhotoUrls = new Map<number, string>();
    await Promise.all(
      (courierRows ?? []).map(async (item) => {
        const profileRecord = Array.isArray(item.profiles) ? item.profiles[0] : item.profiles;
        const photoPath = profileRecord?.profile_photo_path;
        if (!photoPath) return;
        const cached = courierPhotoUrlCache.current.get(photoPath);
        if (cached && cached.expiresAt > Date.now() + 60_000) {
          courierPhotoUrls.set(asNumber(item.id), cached.url);
          return;
        }
        const { data: photo, error: photoError } = await client.storage
          .from('courier-profile-photos')
          .createSignedUrl(photoPath, 60 * 60);
        if (photoError) throw photoError;
        courierPhotoUrlCache.current.set(photoPath, {
          url: photo.signedUrl,
          expiresAt: Date.now() + 59 * 60_000,
        });
        courierPhotoUrls.set(asNumber(item.id), photo.signedUrl);
      }),
    );
    const { data: shiftRows, error: shiftsError } = await supabase
      .from('courier_shifts')
      .select('courier_id, started_at, ended_at, created_at')
      .order('created_at', { ascending: false });
    if (shiftsError) throw shiftsError;
    const latestShiftByCourier = new Map<number, { startedAt?: string; endedAt?: string }>();
    for (const shift of shiftRows ?? []) {
      const courierId = asNumber(shift.courier_id);
      if (!latestShiftByCourier.has(courierId)) {
        latestShiftByCourier.set(courierId, {
          startedAt: shift.started_at ?? undefined,
          endedAt: shift.ended_at ?? undefined,
        });
      }
    }
    setCouriers(
      (courierRows ?? []).map((item) => {
        const presence = Array.isArray(item.courier_presence)
          ? item.courier_presence[0]
          : item.courier_presence;
        const shift = latestShiftByCourier.get(asNumber(item.id));
        return {
          id: asNumber(item.id),
          code: item.courier_code,
          fullName: item.full_name,
          phone: item.phone,
          email: item.email,
          isActive: item.is_active && !item.terminated_at,
          isOnShift: item.is_active && Boolean(presence?.is_on_shift),
          shiftStartedAt: shift?.endedAt ? undefined : shift?.startedAt,
          shiftCloseRequestedAt: presence?.shift_close_requested_at ?? undefined,
          shiftEndedAt: shift?.endedAt,
          isOnBreak: Boolean(presence?.break_until && new Date(presence.break_until) > new Date()),
          breakUntil: presence?.break_until ?? undefined,
          breakStartedBy: presence?.break_started_by as BreakStartedBy | undefined,
          profilePhotoUrl: courierPhotoUrls.get(asNumber(item.id)),
          contractStartDate: item.contract_start_date,
          contractEndDate: item.contract_end_date,
          isTerminated: Boolean(item.terminated_at),
        };
      }),
    );

    const { data: restaurantRows, error: restaurantsError } = await supabase
      .from('restaurants')
    .select('id, restaurant_code, name, email, phone, address, latitude, longitude, accepts_orders');
    if (restaurantsError) throw restaurantsError;
    setRestaurants(
      (restaurantRows ?? []).map((item) => ({
        id: asNumber(item.id),
        code: item.restaurant_code,
        name: item.name,
        email: item.email,
        phone: item.phone,
        address: item.address,
        latitude: item.latitude == null ? undefined : asNumber(item.latitude),
        longitude: item.longitude == null ? undefined : asNumber(item.longitude),
        acceptsOrders: item.accepts_orders,
      })),
    );

    const { data: locationRows, error: locationsError } = await supabase
      .from('courier_locations')
      .select('courier_id, latitude, longitude, recorded_at')
      .order('recorded_at', { ascending: false });
    if (locationsError) throw locationsError;
    setLocations(
      (locationRows ?? []).map((item) => ({
        courierId: asNumber(item.courier_id),
        latitude: asNumber(item.latitude),
        longitude: asNumber(item.longitude),
        recordedAt: item.recorded_at,
      })),
    );
  }, [isDemo, profile]);

  const refresh = useCallback(async () => {
    if (!profile && !isDemo) return;
    try {
      await refreshData();
      setHasLoadedData(true);
      setRefreshError(null);
    } catch (error) {
      setRefreshError(getRefreshErrorMessage(error));
      throw error;
    }
  }, [isDemo, profile, refreshData]);

  const loadOrderDetails = useCallback(
    async (orderId: string): Promise<DeliveryOrder | null> => {
      if (!profile) throw new Error('سجّل الدخول أولًا.');
      if (isDemo) return orders.find((order) => order.id === orderId) ?? null;

      const client = assertBackend();
      const { data: row, error } = await client
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .maybeSingle();
      if (error) throw error;
      if (!row) return null;

      const { data: itemRows, error: itemsError } = await client
        .from('order_items')
        .select('id, menu_item_id, item_name, unit_price_piasters, quantity, line_total_piasters')
        .eq('order_id', orderId)
        .order('id');
      if (itemsError) throw itemsError;

      const lineItems = (itemRows ?? []).map((item) => ({
        id: asNumber(item.id),
        menuItemId: item.menu_item_id == null ? undefined : asNumber(item.menu_item_id),
        name: item.item_name,
        unitPricePiasters: asNumber(item.unit_price_piasters),
        quantity: item.quantity,
        lineTotalPiasters: asNumber(item.line_total_piasters),
      }));
      const order = { ...mapOrder(row as Record<string, unknown>), lineItems };

      if (profile.role === 'admin' || profile.role === 'courier') {
        const { data: cash, error: cashError } = await client
          .from('order_cash')
          .select(
            'collected_piasters, paid_to_restaurant_piasters, paid_to_previous_courier_piasters, previous_courier_id',
          )
          .eq('order_id', orderId)
          .maybeSingle();
        if (cashError) throw cashError;
        if (cash) {
          order.collectedPiasters = asNumber(cash.collected_piasters);
          order.paidToRestaurantPiasters = asNumber(cash.paid_to_restaurant_piasters);
          order.paidToPreviousCourierPiasters = asNumber(
            cash.paid_to_previous_courier_piasters,
          );
          order.previousCourierId =
            cash.previous_courier_id == null
              ? undefined
              : asNumber(cash.previous_courier_id);
        }
      }

      setOrders((current) => {
        const found = current.some((item) => item.id === order.id);
        return found
          ? current.map((item) => (item.id === order.id ? order : item))
          : [order, ...current];
      });
      return order;
    },
    [isDemo, orders, profile],
  );

  const publishShiftSlots = useCallback(
    async (slots: { shiftDate: string; startsAt: string; endsAt: string }[]) => {
      if (!profile || profile.role !== 'admin') {
        throw new Error('نشر مواعيد الشفتات متاح للإدارة فقط.');
      }
      if (slots.length < 1 || slots.length > 100) {
        throw new Error('انشر من 1 إلى 100 موعد شيفت في المرة الواحدة.');
      }
      if (isDemo) {
        const nextId = Math.max(0, ...shiftSlots.map((slot) => slot.id)) + 1;
        const added = slots.map((slot, index) => ({
          id: nextId + index,
          shiftDate: slot.shiftDate,
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
          isCancelled: false,
        }));
        setShiftSlots((current) => [...current, ...added]);
        return added.length;
      }

      const { data, error } = await assertBackend().rpc('admin_publish_courier_shift_slots', {
        p_slots: slots.map((slot) => ({
          shift_date: slot.shiftDate,
          starts_at: slot.startsAt,
          ends_at: slot.endsAt,
        })),
      });
      if (error) throw error;
      await refresh();
      const count = Number(data);
      if (!Number.isSafeInteger(count) || count < 0) {
        throw new Error('لم يرجع الخادم عدد مواعيد الشفتات التي تم نشرها.');
      }
      return count;
    },
    [isDemo, profile, refresh, shiftSlots],
  );

  const bookShift = useCallback(
    async (slotId: number) => {
      if (!profile || profile.role !== 'courier' || profile.courierId == null) {
        throw new Error('حجز الشفتات متاح للمندوب فقط.');
      }
      if (isDemo) {
        const slot = shiftSlots.find((item) => item.id === slotId && !item.isCancelled);
        if (!slot) throw new Error('موعد الشيفت غير موجود.');
        const start = new Date(slot.startsAt).getTime();
        if (start <= Date.now() || start > Date.now() + 7 * 24 * 60 * 60_000) {
          throw new Error('يمكنك حجز الشفتات المتاحة خلال الأيام السبعة القادمة فقط.');
        }
        if (shiftDayBlocks.some((block) => block.courierId === profile.courierId && block.shiftDate === slot.shiftDate)) {
          throw new Error('لا يمكنك العمل في هذا اليوم؛ راجع الإدارة.');
        }
        if (shiftBookings.some((booking) => {
          if (booking.courierId !== profile.courierId || !['booked', 'swap_listed', 'completed'].includes(booking.status)) return false;
          const bookedSlot = shiftSlots.find((item) => item.id === booking.slotId);
          return bookedSlot?.shiftDate === slot.shiftDate;
        })) {
          throw new Error('لديك حجز شيفت بالفعل في هذا اليوم.');
        }
        setShiftBookings((current) => [
          {
            id: Math.max(0, ...current.map((booking) => booking.id)) + 1,
            slotId,
            courierId: profile.courierId!,
            status: 'booked',
            bookedAt: new Date().toISOString(),
          },
          ...current,
        ]);
        return;
      }
      const { error } = await assertBackend().rpc('courier_book_shift', { p_slot_id: slotId });
      if (error) throw error;
      await refresh();
    },
    [isDemo, profile, refresh, shiftBookings, shiftDayBlocks, shiftSlots],
  );

  const offerShiftSwap = useCallback(
    async (bookingId: number) => {
      if (!profile || profile.role !== 'courier' || profile.courierId == null) {
        throw new Error('عرض الشيفت للتبديل متاح للمندوب فقط.');
      }
      if (isDemo) {
        const booking = shiftBookings.find(
          (item) =>
            item.id === bookingId &&
            item.courierId === profile.courierId &&
            item.status === 'booked',
        );
        if (!booking) throw new Error('لا يمكن عرض هذا الشيفت للتبديل.');
        setShiftBookings((current) =>
          current.map((item) =>
            item.id === bookingId
              ? { ...item, status: 'swap_listed', swapListedAt: new Date().toISOString() }
              : item,
          ),
        );
        return;
      }
      const { error } = await assertBackend().rpc('courier_offer_shift_swap', {
        p_booking_id: bookingId,
      });
      if (error) throw error;
      await refresh();
    },
    [isDemo, profile, refresh, shiftBookings],
  );

  const removeCourierShift = useCallback(
    async (bookingId: number) => {
      if (!profile || profile.role !== 'admin') {
        throw new Error('رفع حجز الشيفت متاح للإدارة فقط.');
      }
      if (isDemo) {
        const booking = shiftBookings.find(
          (item) =>
            item.id === bookingId &&
            ['booked', 'swap_listed'].includes(item.status),
        );
        const slot = booking && shiftSlots.find((item) => item.id === booking.slotId);
        if (!booking || !slot || new Date(slot.startsAt).getTime() <= Date.now()) {
          throw new Error('لا يمكن رفع شيفت بدأ بالفعل أو لم يعد متاحًا.');
        }
        setShiftBookings((current) =>
          current.map((item) =>
            item.id === bookingId ? { ...item, status: 'admin_removed' } : item,
          ),
        );
        return;
      }
      const { error } = await assertBackend().rpc('admin_remove_courier_shift', {
        p_booking_id: bookingId,
      });
      if (error) throw error;
      await refresh();
    },
    [isDemo, profile, refresh, shiftBookings, shiftSlots],
  );

  const blockCourierShiftDay = useCallback(
    async (courierId: number, shiftDate: string, reason: string) => {
      if (!profile || profile.role !== 'admin') {
        throw new Error('إيقاف عمل المندوب في يوم محدد متاح للإدارة فقط.');
      }
      if (isDemo) {
        setShiftDayBlocks((current) => [
          ...current.filter(
            (block) => block.courierId !== courierId || block.shiftDate !== shiftDate,
          ),
          { courierId, shiftDate, reason: reason.trim() },
        ]);
        setShiftBookings((current) =>
          current.map((booking) => {
            const slot = shiftSlots.find((item) => item.id === booking.slotId);
            return booking.courierId === courierId &&
              slot?.shiftDate === shiftDate &&
              ['booked', 'swap_listed'].includes(booking.status)
              ? { ...booking, status: 'admin_removed' }
              : booking;
          }),
        );
        return;
      }
      const { error } = await assertBackend().rpc('admin_block_courier_shift_date', {
        p_courier_id: courierId,
        p_shift_date: shiftDate,
        p_reason: reason.trim(),
      });
      if (error) throw error;
      await refresh();
    },
    [isDemo, profile, refresh, shiftSlots],
  );

  const unblockCourierShiftDay = useCallback(
    async (courierId: number, shiftDate: string) => {
      if (!profile || profile.role !== 'admin') {
        throw new Error('إعادة تفعيل يوم العمل متاحة للإدارة فقط.');
      }
      if (isDemo) {
        setShiftDayBlocks((current) =>
          current.filter(
            (block) => block.courierId !== courierId || block.shiftDate !== shiftDate,
          ),
        );
        return;
      }
      const { error } = await assertBackend().rpc('admin_unblock_courier_shift_date', {
        p_courier_id: courierId,
        p_shift_date: shiftDate,
      });
      if (error) throw error;
      await refresh();
    },
    [isDemo, profile, refresh],
  );

  const registerCourierPushToken = useCallback(
    async (token: string, platform: 'ios' | 'android') => {
      if (!profile || profile.role !== 'courier' || profile.courierId == null || isDemo) return;
      const { error } = await assertBackend().from('courier_push_tokens').upsert(
        { expo_push_token: token, courier_id: profile.courierId, platform },
        { onConflict: 'expo_push_token' },
      );
      if (error) throw error;
    },
    [isDemo, profile],
  );

  const notifyUnbookedCouriers = useCallback(async () => {
    if (!profile || profile.role !== 'admin') {
      throw new Error('إرسال تذكير بحجز الشفت متاح للإدارة فقط.');
    }
    if (isDemo) return { sent: 0, skipped: 0, failed: 0 };
    const { data, error } = await assertBackend().functions.invoke(
      'notify-unbooked-couriers',
      { body: {} },
    );
    if (error) throw new Error(await getAccountFunctionErrorMessage(error));
    if (
      !data ||
      typeof data.sent !== 'number' ||
      typeof data.skipped !== 'number' ||
      typeof data.failed !== 'number'
    ) {
      throw new Error('لم يرجع الخادم نتيجة إرسال التنبيهات.');
    }
    return { sent: data.sent, skipped: data.skipped, failed: data.failed };
  }, [isDemo, profile]);

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      if (!supabase) {
        if (active) setIsLoading(false);
        return;
      }
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      if (data.session) {
        const nextProfile = await loadProfile(data.session.user.id);
        if (active) setProfile(nextProfile);
      }
      if (active) setIsLoading(false);
    };
    initialize().catch((error: unknown) => {
      if (active) {
        setIsLoading(false);
        setProfile(null);
      }
      console.error('تعذر استعادة جلسة المستخدم:', error);
    });
    return () => {
      active = false;
    };
  }, [loadProfile]);

  useEffect(() => {
    if (!profile) return;
    const timer = setTimeout(() => {
      refresh().catch((error: unknown) => {
        console.error('تعذر تحميل بيانات الحساب:', error);
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [profile, refresh]);

  useEffect(() => {
    if (!profile || isDemo || !supabase) return;
    const channel = supabase
      .channel(`delivery-${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        refresh().catch((error: unknown) => {
          console.error('تعذر تحديث الطلبات فورًا:', error);
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_returns' }, () => {
        refresh().catch((error: unknown) => {
          console.error('تعذر تحديث عمليات الإرجاع فورًا:', error);
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_assignment_attempts' }, () => {
        refresh().catch((error: unknown) => {
          console.error('تعذر تحديث سجل عدم قبول الطلبات فورًا:', error);
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_transfer_requests' }, () => {
        refresh().catch((error: unknown) => {
          console.error('تعذر تحديث طلبات تحويل الطلبات فورًا:', error);
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'courier_shift_slots' }, () => {
        refresh().catch((error: unknown) => {
          console.error('تعذر تحديث مواعيد الشفتات فورًا:', error);
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'courier_shift_bookings' }, () => {
        refresh().catch((error: unknown) => {
          console.error('تعذر تحديث حجوزات الشفتات فورًا:', error);
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'courier_shift_day_blocks' }, () => {
        refresh().catch((error: unknown) => {
          console.error('تعذر تحديث أيام إيقاف الشفتات فورًا:', error);
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'courier_shifts' }, () => {
        refresh().catch((error: unknown) => {
          console.error('تعذر تحديث سجل ساعات الشفت فورًا:', error);
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'courier_break_periods' }, () => {
        refresh().catch((error: unknown) => {
          console.error('تعذر تحديث سجل البريكات فورًا:', error);
        });
      });
    if (profile.role === 'admin' || profile.role === 'courier') {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'courier_fee_remittances' },
        () => {
          refresh().catch((error: unknown) => {
            console.error('تعذر تحديث توريدات رسوم التوصيل فورًا:', error);
          });
        },
      );
    }
    if (profile.role === 'admin' || profile.role === 'restaurant' || profile.role === 'courier') {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'courier_locations' },
        () => {
          refresh().catch((error: unknown) => {
            console.error('تعذر تحديث مواقع المندوبين:', error);
          });
        },
      );
    }
    if (profile.role === 'admin' || profile.role === 'restaurant') {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'restaurants' },
        () => {
          refresh().catch((error: unknown) => {
            console.error('تعذر تحديث حالة استقبال طلبات المطعم:', error);
          });
        },
      );
    }
    if (profile.role === 'admin' || profile.role === 'courier') {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'courier_presence' },
        () => {
          refresh().catch((error: unknown) => {
            console.error('تعذر تحديث حالة الشيفت:', error);
          });
        },
      );
    }
    channel.subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.error(`تعذر الاتصال الفوري بالخادم: ${status}`);
      }
    });
    return () => {
      void supabase?.removeChannel(channel);
    };
  }, [isDemo, profile, refresh]);

  useEffect(() => {
    if (
      isDemo ||
      profile?.role !== 'courier' ||
      profile.courierId == null ||
      Platform.OS === 'web'
    ) return;
    let active = true;
    const registerForShiftReminders = async () => {
      const Notifications = await import('expo-notifications');
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('shift-reminders', {
          name: 'تذكيرات الشيفت',
          importance: Notifications.AndroidImportance.DEFAULT,
        });
      }
      const existing = await Notifications.getPermissionsAsync();
      const permissions =
        existing.status === 'granted'
          ? existing
          : await Notifications.requestPermissionsAsync();
      if (permissions.status !== 'granted') return;
      const Constants = await import('expo-constants');
      const projectId =
        Constants.default.expoConfig?.extra?.eas?.projectId ??
        Constants.default.easConfig?.projectId;
      if (!projectId) throw new Error('إعداد مشروع الإشعارات غير موجود.');
      const token = await Notifications.getExpoPushTokenAsync({ projectId });
      if (active) {
        const platform = Platform.OS;
        if (platform === 'ios' || platform === 'android') {
          await registerCourierPushToken(token.data, platform);
        }
      }
    };
    registerForShiftReminders().catch((error: unknown) => {
      console.error('تعذر تسجيل إشعارات تذكير الشيفت:', error);
    });
    return () => {
      active = false;
    };
  }, [isDemo, profile?.courierId, profile?.role, registerCourierPushToken]);

  useEffect(() => {
    if (isDemo || profile?.role !== 'courier' || profile.isOnShift) return;
    import('../lib/location')
      .then(({ stopShiftLocationUpdates }) => stopShiftLocationUpdates())
      .catch((error: unknown) => {
        console.error('تعذر إيقاف مشاركة موقع المندوب بعد إغلاق الشيفت:', error);
      });
  }, [isDemo, profile?.isOnShift, profile?.role]);

  useEffect(() => {
    if (isDemo || profile?.role !== 'courier' || !profile.isOnShift) return;
    import('../lib/location')
      .then(({ startShiftLocationUpdates }) => {
        if (Platform.OS === 'web' && profile.courierId) {
          return startShiftLocationUpdates(profile.courierId);
        }
      })
      .catch((error: unknown) => {
        console.error('تعذر استعادة مشاركة موقع المندوب:', error);
      });
  }, [isDemo, profile]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const client = assertBackend();
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (!data.user) throw new Error('لم يتم العثور على حساب بعد تسجيل الدخول.');
      const nextProfile = await loadProfile(data.user.id);
      setIsDemo(false);
      setHasLoadedData(false);
      setRefreshError(null);
      setProfile(nextProfile);
      return nextProfile.role;
    },
    [loadProfile],
  );

  const signInDemo = useCallback((role: UserRole) => {
    const demoShiftSlots = createDemoShiftSlots();
    setIsDemo(true);
    setHasLoadedData(false);
    setRefreshError(null);
    setProfile(demoProfile(role));
    setOrders(cloneDemoOrders());
    setOrderAssignmentAttempts([]);
    setOrderReturns([]);
    setOrderTransferRequests([]);
    setCourierFeeRemittances([]);
    const today = new Date();
    const startDate = today.toISOString().slice(0, 10);
    const end = new Date(today);
    end.setFullYear(end.getFullYear() + 1);
    setCouriers(
      demoCouriers.map((courier) => ({
        ...courier,
        isOnBreak: false,
        contractStartDate: startDate,
        contractEndDate: end.toISOString().slice(0, 10),
        isTerminated: false,
      })),
    );
    setShiftSlots(demoShiftSlots);
    setShiftBookings([
      {
        id: 1,
        slotId: demoShiftSlots[0].id,
        courierId: demoCouriers[0].id,
        status: 'booked',
        bookedAt: new Date().toISOString(),
      },
    ]);
    setShiftRecords([]);
    setBreakPeriods([]);
    setShiftDayBlocks([]);
    setRestaurants(demoRestaurants.map((restaurant) => ({ ...restaurant })));
    setRestaurantMenuItems(demoRestaurantMenuItems.map((item) => ({ ...item })));
    setLocations([]);
    setDemoConversations(demoSupportConversations.map((conversation) => ({ ...conversation })));
    setDemoMessages(demoSupportMessages.map((message) => ({ ...message })));
  }, []);

  const signOut = useCallback(async () => {
    if (!isDemo && profile?.role === 'courier' && profile.isOnShift) {
      throw new Error('لا يمكن تسجيل الخروج قبل موافقة الإدارة على إغلاق الشيفت.');
    }
    if (!isDemo && profile?.role === 'courier' && supabase) {
      const { stopShiftLocationUpdates } = await import('../lib/location');
      await stopShiftLocationUpdates();
    }
    if (!isDemo && supabase) {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) throw error;
    }
    setProfile(null);
    setIsDemo(false);
    setHasLoadedData(false);
    setRefreshError(null);
    setOrders([]);
    setOrderAssignmentAttempts([]);
    setOrderReturns([]);
    setOrderTransferRequests([]);
    setCourierFeeRemittances([]);
    setCouriers([]);
    setShiftSlots([]);
    setShiftBookings([]);
    setShiftRecords([]);
    setBreakPeriods([]);
    setShiftDayBlocks([]);
    setRestaurants([]);
    setRestaurantMenuItems([]);
    setLocations([]);
  }, [isDemo, profile]);

  const loadRestaurantMenu = useCallback(async (requestedRestaurantId?: number) => {
    if (!profile) throw new Error('سجّل الدخول أولًا.');
    const restaurantId =
      profile.role === 'restaurant'
        ? profile.restaurantId
        : profile.role === 'admin'
          ? requestedRestaurantId
          : undefined;
    if (restaurantId == null) {
      throw new Error('اختر مطعمًا لعرض قائمة أصنافه.');
    }
    if (isDemo) return;
    setRestaurantMenuItems([]);
    const { data, error } = await assertBackend()
      .from('restaurant_menu_items')
      .select('id, name, price_piasters, is_available')
      .eq('restaurant_id', restaurantId)
      .order('name');
    if (error) throw error;
    setRestaurantMenuItems(
      (data ?? []).map((item) => ({
        id: asNumber(item.id),
        name: item.name,
        pricePiasters: asNumber(item.price_piasters),
        isAvailable: item.is_available,
      })),
    );
  }, [isDemo, profile]);

  const saveRestaurantMenuItem = useCallback(
    async (
      itemId: number | null,
      name: string,
      pricePiasters: number,
      isAvailable: boolean,
    ) => {
      if (!profile || profile.role !== 'restaurant') {
        throw new Error('إدارة الأصناف متاحة لحساب المطعم فقط.');
      }
      if (!name.trim() || name.trim().length > 120 || !Number.isSafeInteger(pricePiasters) || pricePiasters < 1) {
        throw new Error('أدخل اسم الصنف وسعرًا صحيحًا أكبر من صفر.');
      }
      if (isDemo) {
        setRestaurantMenuItems((current) => {
          if (itemId === null) {
            return [
              ...current,
              {
                id: Math.max(0, ...current.map((item) => item.id)) + 1,
                name: name.trim(),
                pricePiasters,
                isAvailable,
              },
            ];
          }
          return current.map((item) =>
            item.id === itemId
              ? { ...item, name: name.trim(), pricePiasters, isAvailable }
              : item,
          );
        });
        return;
      }
      const { error } = await assertBackend().rpc('save_restaurant_menu_item', {
        p_item_id: itemId,
        p_name: name.trim(),
        p_price_piasters: pricePiasters,
        p_is_available: isAvailable,
      });
      if (error) throw error;
      await loadRestaurantMenu();
    },
    [isDemo, loadRestaurantMenu, profile],
  );

  const createOrder = useCallback(
    async (input: NewOrderInput) => {
      if (!profile || !['restaurant', 'admin'].includes(profile.role)) {
        throw new Error('إنشاء الطلبات متاح للإدارة والمطاعم فقط.');
      }
      const restaurantId =
        profile.role === 'restaurant' ? profile.restaurantId : input.restaurantId;
      if (restaurantId == null) {
        throw new Error('اختر المطعم المرتبط بالطلب.');
      }
      if (profile.role === 'restaurant' && profile.restaurantAcceptsOrders === false) {
        throw new Error('أوقفت الإدارة استقبال الطلبات الجديدة لهذا المطعم.');
      }
      if (profile.role === 'admin' && !restaurants.some((item) => item.id === restaurantId)) {
        throw new Error('المطعم المحدد غير موجود؛ حدّث قائمة المطاعم وحاول مرة أخرى.');
      }
      if (
        profile.role === 'admin' &&
        (!Number.isSafeInteger(input.deliveryFeePiasters) || (input.deliveryFeePiasters ?? -1) < 0)
      ) {
        throw new Error('حدد رسوم التوصيل قبل إرسال الطلب للمطعم.');
      }
      if (isDemo) {
        const restaurant =
          restaurants.find((item) => item.id === restaurantId) ??
          demoRestaurants.find((item) => item.id === restaurantId);
        const selectedItems = input.items.map(({ itemId, quantity }) => {
          const item = restaurantMenuItems.find((candidate) => candidate.id === itemId);
          if (!item || !item.isAvailable || quantity < 1 || quantity > 99) {
            throw new Error('يوجد صنف غير متاح أو كمية غير صحيحة؛ راجع القائمة وحاول مرة أخرى.');
          }
          return {
            id: item.id,
            menuItemId: item.id,
            name: item.name,
            quantity,
            unitPricePiasters: item.pricePiasters,
            lineTotalPiasters: item.pricePiasters * quantity,
          };
        });
        if (selectedItems.length === 0) throw new Error('اختر صنفًا واحدًا على الأقل.');
        const restaurantDuePiasters = selectedItems.reduce(
          (total, item) => total + item.lineTotalPiasters,
          0,
        );
        const newOrder: DeliveryOrder = {
            id: `demo-order-${Date.now()}`,
            code: `DEMO-${Date.now().toString().slice(-5)}`,
            orderSource: profile.role === 'admin' ? 'admin' : 'restaurant',
            restaurantId,
            restaurantName: restaurant?.name ?? profile.name,
            restaurantAddress:
              profile.role === 'restaurant'
                ? profile.restaurantAddress ?? restaurant?.address ?? ''
                : restaurant?.address ?? '',
            restaurantLatitude:
              profile.role === 'restaurant'
                ? profile.restaurantLatitude ?? restaurant?.latitude
                : restaurant?.latitude,
            restaurantLongitude:
              profile.role === 'restaurant'
                ? profile.restaurantLongitude ?? restaurant?.longitude
                : restaurant?.longitude,
            customerName: input.customerName,
            customerPhone: input.customerPhone,
            customerAddress: input.customerAddress,
            itemsText: selectedItems.map((item) => `${item.name} × ${item.quantity}`).join('\n'),
            lineItems: selectedItems,
            notes: input.notes,
            restaurantDuePiasters,
            amountDuePiasters: restaurantDuePiasters + (input.deliveryFeePiasters ?? 0),
            deliveryFeePiasters:
              profile.role === 'admin' ? input.deliveryFeePiasters : undefined,
            status: 'pending',
            createdAt: new Date().toISOString(),
          };
        setOrders((current) => [newOrder, ...current]);
        return;
      }
      const client = assertBackend();
      const { data: order, error } =
        profile.role === 'admin'
          ? await client.rpc('admin_create_order', {
              p_restaurant_id: restaurantId,
              p_customer_name: input.customerName,
              p_customer_phone: input.customerPhone,
              p_customer_address: input.customerAddress,
              p_notes: input.notes,
              p_delivery_fee_piasters: input.deliveryFeePiasters,
              p_items: input.items,
            })
          : await client.rpc('submit_restaurant_order', {
              p_customer_name: input.customerName,
              p_customer_phone: input.customerPhone,
              p_customer_address: input.customerAddress,
              p_notes: input.notes,
              p_items: input.items,
            });
      if (error) throw error;
      if (!order || typeof order !== 'object' || Array.isArray(order)) {
        throw new Error('لم يؤكد الخادم إنشاء الطلب. تحقق من قائمة الطلبات قبل إعادة الإرسال.');
      }
      setOrders((current) => [mapOrder(order), ...current]);
    },
    [isDemo, profile, restaurantMenuItems, restaurants],
  );

  const acceptAdminOrder = useCallback(
    async (orderId: string) => {
      if (!profile || profile.role !== 'restaurant') {
        throw new Error('قبول طلبات الإدارة متاح للمطعم المحدد فقط.');
      }
      const order = orders.find((item) => item.id === orderId);
      if (
        !order ||
        order.restaurantId !== profile.restaurantId ||
        order.orderSource !== 'admin' ||
        order.status !== 'pending' ||
        order.restaurantAcceptedAt
      ) {
        throw new Error('الطلب غير متاح للقبول أو سبق التعامل معه.');
      }

      if (isDemo) {
        const acceptedAt = new Date().toISOString();
        const availableCouriers = couriers
          .filter(
            (courier) =>
              courier.isActive &&
              !courier.isTerminated &&
              courier.isOnShift &&
              !courier.shiftCloseRequestedAt &&
              !courier.isOnBreak &&
              courier.contractEndDate >= acceptedAt.slice(0, 10) &&
              !orders.some(
                (item) =>
                  item.courierId === courier.id &&
                  ['assigned', 'accepted', 'picked_up'].includes(item.status),
              ),
          )
          .map((courier) => ({
            courier,
            location:
              locations.find((location) => location.courierId === courier.id) ??
              courier.location,
          }))
          .filter(
            (candidate): candidate is typeof candidate & { location: CourierLocation } =>
              Boolean(candidate.location),
          )
          .sort((first, second) => {
            if (
              order.restaurantLatitude == null ||
              order.restaurantLongitude == null
            ) {
              return first.courier.id - second.courier.id;
            }
            return (
              distanceInMeters(
                order.restaurantLatitude,
                order.restaurantLongitude,
                first.location.latitude,
                first.location.longitude,
              ) -
              distanceInMeters(
                order.restaurantLatitude,
                order.restaurantLongitude,
                second.location.latitude,
                second.location.longitude,
              )
            );
          });
        const courier = availableCouriers[0]?.courier;
        setOrders((current) =>
          current.map((item) =>
            item.id === orderId
              ? {
                  ...item,
                  restaurantAcceptedAt: acceptedAt,
                  ...(courier
                    ? {
                        courierId: courier.id,
                        status: 'assigned' as const,
                        assignedAt: acceptedAt,
                      }
                    : {}),
                }
              : item,
          ),
        );
        if (courier) {
          setOrderAssignmentAttempts((current) => [
            {
              id: `demo-${orderId}-${acceptedAt}`,
              orderId,
              orderCode: order.code,
              courierId: courier.id,
              assignedAt: acceptedAt,
              status: 'awaiting',
            },
            ...current,
          ]);
        }
        return courier?.id ?? null;
      }

      const { data, error } = await assertBackend().rpc('restaurant_accept_admin_order', {
        p_order_id: orderId,
      });
      if (error) throw error;
      if (data != null && (!Number.isSafeInteger(Number(data)) || Number(data) < 1)) {
        throw new Error('الخادم أتم قبول الطلب لكنه أعاد رقم مندوب غير صالح.');
      }
      await refresh();
      return data == null ? null : Number(data);
    },
    [couriers, isDemo, locations, orders, profile, refresh],
  );

  const createCourier = useCallback(
    async (input: NewCourierInput) => {
      if (isDemo) {
        throw new Error('لا تدخل بيانات هوية حقيقية في المعاينة. اربط قاعدة البيانات أولًا.');
      }
      const client = assertBackend();
      if (!profile || profile.role !== 'admin') {
        throw new Error('إنشاء حسابات المندوبين متاح للإدارة فقط.');
      }
      if (input.idCard.fileSize && input.idCard.fileSize > 8 * 1024 * 1024) {
        throw new Error('حجم صورة البطاقة أكبر من 8 ميجابايت.');
      }
      if (input.selfie.fileSize && input.selfie.fileSize > 8 * 1024 * 1024) {
        throw new Error('حجم صورة السيلفي أكبر من 8 ميجابايت.');
      }

      const extension = input.idCard.mimeType.includes('png') ? 'png' : 'jpg';
      const path = `${profile.id}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
      const { error: uploadError } = await client.storage
        .from('courier-id-cards')
        .upload(path, decode(input.idCard.base64), {
          contentType: input.idCard.mimeType,
          upsert: false,
        });
      if (uploadError) throw uploadError;

      const selfieExtension = input.selfie.mimeType.includes('png') ? 'png' : 'jpg';
      const selfiePath = `${profile.id}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${selfieExtension}`;
      const { error: selfieUploadError } = await client.storage
        .from('courier-profile-photos')
        .upload(selfiePath, decode(input.selfie.base64), {
          contentType: input.selfie.mimeType,
          upsert: false,
        });
      if (selfieUploadError) {
        const { error: cleanupError } = await client.storage
          .from('courier-id-cards')
          .remove([path]);
        if (cleanupError) {
          throw new Error(`${selfieUploadError.message} وتعذر حذف صورة البطاقة المؤقتة.`);
        }
        throw selfieUploadError;
      }

      const { data, error } = await client.functions.invoke('admin-create-account', {
        body: {
          role: 'courier',
          email: input.email.trim(),
          fullName: input.fullName.trim(),
          phone: input.phone.trim(),
          nationalId: input.nationalId.trim(),
          address: input.address.trim(),
          idCardPath: path,
          selfiePath,
        },
      });
      if (error || !data?.code || !data?.temporaryPassword) {
        const { error: cardCleanupError } = await client.storage
          .from('courier-id-cards')
          .remove([path]);
        const { error: selfieCleanupError } = await client.storage
          .from('courier-profile-photos')
          .remove([selfiePath]);
        const reason = error
          ? await getAccountFunctionErrorMessage(error)
          : 'لم يرجع الخادم بيانات الحساب.';
        if (cardCleanupError || selfieCleanupError) {
          throw new Error(`${reason} وتعذر حذف صورة مؤقتة؛ راجع التخزين الخاص.`);
        }
        throw new Error(reason);
      }
      await refresh();
      return {
        code: data.code as string,
        email: data.email as string,
        temporaryPassword: data.temporaryPassword as string,
      };
    },
    [isDemo, profile, refresh],
  );

  const createRestaurant = useCallback(
    async (input: NewRestaurantInput) => {
      if (isDemo) {
        throw new Error('إنشاء الحسابات الحقيقية يحتاج إلى ربط قاعدة البيانات.');
      }
      const client = assertBackend();
      if (!profile || profile.role !== 'admin') {
        throw new Error('إنشاء حسابات المطاعم متاح للإدارة فقط.');
      }
      const { data, error } = await client.functions.invoke('admin-create-account', {
        body: {
          role: 'restaurant',
          email: input.email.trim(),
          fullName: input.name.trim(),
          phone: input.phone.trim(),
          address: input.address.trim(),
        },
      });
      if (error || !data?.code || !data?.temporaryPassword) {
        throw new Error(
          error
            ? await getAccountFunctionErrorMessage(error)
            : 'لم يرجع الخادم بيانات الحساب.',
        );
      }
      await refresh();
      return {
        code: data.code as string,
        email: data.email as string,
        temporaryPassword: data.temporaryPassword as string,
      };
    },
    [isDemo, profile, refresh],
  );

  const cancelOrder = useCallback(
    async (orderId: string) => {
      if (!profile || profile.role !== 'admin') {
        throw new Error('إلغاء الطلبات متاح للإدارة فقط.');
      }
      if (isDemo) {
        const order = orders.find((item) => item.id === orderId);
        if (!order || order.status !== 'pending') {
          throw new Error('يمكن إلغاء الطلبات التي ما زالت بانتظار مراجعة الإدارة فقط.');
        }
        setOrders((current) =>
          current.map((item) =>
            item.id === orderId
              ? { ...item, status: 'cancelled', cancelledAt: new Date().toISOString() }
              : item,
          ),
        );
        return;
      }
      const { error } = await assertBackend().rpc('admin_cancel_order', {
        p_order_id: orderId,
      });
      if (error) throw error;
      await refresh();
    },
    [isDemo, orders, profile, refresh],
  );

  const startOrderReturn = useCallback(
    async (orderId: string) => {
      if (!profile || profile.role !== 'courier' || profile.courierId == null) {
        throw new Error('بدء رحلة الإرجاع متاح للمندوب المسند إليه الطلب فقط.');
      }
      const order = orders.find((item) => item.id === orderId);
      if (!order || order.courierId !== profile.courierId || order.status !== 'picked_up') {
        throw new Error('يمكن بدء الإرجاع لطلب استلمه هذا المندوب ولم يُسلّم للعميل فقط.');
      }
      if (orderReturns.some((item) => item.orderId === orderId)) {
        throw new Error('بدأت رحلة إرجاع لهذا الطلب بالفعل.');
      }
      if (isDemo) {
        const startedAt = new Date().toISOString();
        const returnRecord: OrderReturn = {
          id: `demo-return-${Date.now()}`,
          orderId,
          courierId: profile.courierId,
          restaurantId: order.restaurantId,
          status: 'in_transit',
          reason: 'رفض العميل الاستلام',
          startedAt,
        };
        setOrders((current) =>
          current.map((item) =>
            item.id === orderId ? { ...item, status: 'cancelled', cancelledAt: startedAt } : item,
          ),
        );
        setOrderReturns((current) => [returnRecord, ...current]);
        return;
      }
      const { error } = await assertBackend().rpc('start_order_return', {
        p_order_id: orderId,
      });
      if (error) throw error;
      await refresh();
    },
    [isDemo, orderReturns, orders, profile, refresh],
  );

  const completeOrderReturn = useCallback(
    async (
      returnId: string,
      image: ImagePickerAsset,
      courierReceivedRestaurantRefund: boolean,
    ) => {
      if (!profile || profile.role !== 'courier' || profile.courierId == null) {
        throw new Error('تأكيد وصول المرتجع متاح للمندوب فقط.');
      }
      const returnRecord = orderReturns.find((item) => item.id === returnId);
      if (
        !returnRecord ||
        returnRecord.courierId !== profile.courierId ||
        returnRecord.status !== 'in_transit'
      ) {
        throw new Error('رحلة الإرجاع غير متاحة لهذا المندوب أو تم إنهاؤها بالفعل.');
      }
      if (image.fileSize && image.fileSize > 8 * 1024 * 1024) {
        throw new Error('حجم صورة المرتجع أكبر من 8 ميجابايت.');
      }
      const imageInput = toImagePickerInput(image);
      if (isDemo) {
        setOrderReturns((current) =>
          current.map((item) =>
            item.id === returnId
              ? {
                  ...item,
                  status: 'returned_by_courier',
                  returnedAt: new Date().toISOString(),
                  courierReceivedRestaurantRefund,
                  photoUrl: image.uri,
                }
              : item,
          ),
        );
        return;
      }
      const client = assertBackend();
      const extension = imageInput.mimeType.includes('png')
        ? 'png'
        : imageInput.mimeType.includes('webp')
          ? 'webp'
          : 'jpg';
      const photoPath = `${profile.courierId}/${returnRecord.orderId}/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 10)}.${extension}`;
      const { error: uploadError } = await client.storage
        .from('courier-return-photos')
        .upload(photoPath, decode(imageInput.base64), {
          contentType: imageInput.mimeType,
          upsert: false,
        });
      if (uploadError) throw uploadError;
      let completed = false;
      try {
        const { error } = await client.rpc('complete_order_return', {
          p_return_id: returnId,
          p_photo_path: photoPath,
          p_courier_received_restaurant_refund: courierReceivedRestaurantRefund,
        });
        if (error) throw error;
        completed = true;
        await refresh();
      } catch (error) {
        if (!completed) {
          const { error: cleanupError } = await client.storage
            .from('courier-return-photos')
            .remove([photoPath]);
          if (cleanupError) {
            throw new Error(
              `${error instanceof Error ? error.message : 'تعذر تسجيل إرجاع الطلب.'} وتعذر حذف صورة الإرجاع المؤقتة.`,
            );
          }
        }
        throw error;
      }
    },
    [isDemo, orderReturns, profile, refresh],
  );

  const confirmOrderReturn = useCallback(
    async (returnId: string) => {
      if (!profile || profile.role !== 'restaurant' || profile.restaurantId == null) {
        throw new Error('تأكيد استلام المرتجع متاح لحساب المطعم فقط.');
      }
      const returnRecord = orderReturns.find((item) => item.id === returnId);
      if (
        !returnRecord ||
        returnRecord.restaurantId !== profile.restaurantId ||
        returnRecord.status !== 'returned_by_courier'
      ) {
        throw new Error('لا يوجد مرتجع جاهز للتأكيد لهذا المطعم.');
      }
      if (isDemo) {
        setOrderReturns((current) =>
          current.map((item) =>
            item.id === returnId ? { ...item, status: 'closed' } : item,
          ),
        );
        return;
      }
      const { error } = await assertBackend().rpc('confirm_order_return', {
        p_return_id: returnId,
      });
      if (error) throw error;
      await refresh();
    },
    [isDemo, orderReturns, profile, refresh],
  );

  const requestOrderTransfer = useCallback(
    async (orderId: string, reason: OrderTransferReason, details: string) => {
      if (!profile || profile.role !== 'courier' || profile.courierId == null) {
        throw new Error('طلب تحويل الطلب متاح للمندوب المسند إليه فقط.');
      }
      const courierId = profile.courierId;
      if (!orderTransferReasonOptions.some((option) => option.id === reason)) {
        throw new Error('اختر سببًا صحيحًا للتحويل.');
      }
      const order = orders.find((item) => item.id === orderId);
      if (
        !order ||
        order.courierId !== courierId ||
        !['accepted', 'picked_up'].includes(order.status)
      ) {
        throw new Error('لا يمكن طلب تحويل الطلب إلا بعد قبوله وقبل تسليمه.');
      }
      if (orderTransferRequests.some(
        (request) => request.orderId === orderId && request.status === 'pending',
      )) {
        throw new Error('يوجد طلب تحويل معلق لهذا الطلب بالفعل.');
      }
      const reasonDetails = details.trim();
      if (reasonDetails.length > 500) {
        throw new Error('التفاصيل الإضافية يجب ألا تتجاوز 500 حرف.');
      }
      if (reason === 'other' && !reasonDetails) {
        throw new Error('اكتب تفاصيل السبب الآخر قبل إرسال طلب التحويل.');
      }
      if (isDemo) {
        setOrderTransferRequests((current) => [
          {
            id: `demo-transfer-${orderId}-${Date.now()}`,
            orderId,
            fromCourierId: courierId,
            fromCourierName: profile.name,
            fromCourierCode: profile.courierCode ?? '',
            fromCourierPhone: profile.phone ?? '',
            reason,
            reasonDetails,
            status: 'pending',
            requiresHandoff: order.status === 'picked_up',
            requestedAt: new Date().toISOString(),
          },
          ...current,
        ]);
        return;
      }
      const { error } = await assertBackend().rpc('request_order_transfer', {
        p_order_id: orderId,
        p_reason: reason,
        p_reason_details: reasonDetails,
      });
      if (error) throw error;
      await refresh();
    },
    [isDemo, orderTransferRequests, orders, profile, refresh],
  );

  const decideOrderTransfer = useCallback(
    async (requestId: string, approve: boolean) => {
      if (!profile || !['admin', 'support'].includes(profile.role)) {
        throw new Error('مراجعة طلبات التحويل متاحة للإدارة والدعم فقط.');
      }
      const transferRequest = orderTransferRequests.find((item) => item.id === requestId);
      if (!transferRequest || transferRequest.status !== 'pending') {
        throw new Error('طلب التحويل غير موجود أو تم اتخاذ قرار بشأنه بالفعل.');
      }
      if (isDemo) {
        const order = orders.find((item) => item.id === transferRequest.orderId);
        if (
          !order ||
          order.courierId !== transferRequest.fromCourierId ||
          !['accepted', 'picked_up'].includes(order.status)
        ) {
          throw new Error('لم يعد الطلب متاحًا للتحويل.');
        }
        if (!approve) {
          const resolvedAt = new Date().toISOString();
          setOrderTransferRequests((current) =>
            current.map((item) =>
              item.id === requestId ? { ...item, status: 'rejected', resolvedAt } : item,
            ),
          );
          return null;
        }
        if (order.restaurantLatitude == null || order.restaurantLongitude == null) {
          throw new Error('لا يمكن تحديد أقرب مندوب؛ موقع المطعم غير متاح.');
        }
        const restaurantLatitude = order.restaurantLatitude;
        const restaurantLongitude = order.restaurantLongitude;
        const candidate = couriers
          .flatMap((courier) => {
            const location = locations.find((item) => item.courierId === courier.id) ?? courier.location;
            const hasActiveOrder = orders.some(
              (item) =>
                item.id !== order.id &&
                item.courierId === courier.id &&
                ['assigned', 'accepted', 'picked_up'].includes(item.status),
            );
            if (
              courier.id !== transferRequest.fromCourierId &&
              courier.isActive &&
              courier.isOnShift &&
              !courier.shiftCloseRequestedAt &&
              !courier.isOnBreak &&
              !courier.isTerminated &&
              courier.contractStartDate <= new Date().toISOString().slice(0, 10) &&
              courier.contractEndDate >= new Date().toISOString().slice(0, 10) &&
              !hasActiveOrder &&
              location != null
            ) {
              return [{ courier, location }];
            }
            return [];
          })
          .sort((first, second) =>
            distanceInMeters(
              restaurantLatitude,
              restaurantLongitude,
              first.location.latitude,
              first.location.longitude,
            ) -
            distanceInMeters(
              restaurantLatitude,
              restaurantLongitude,
              second.location.latitude,
              second.location.longitude,
            ),
          )[0]?.courier;
        if (!candidate) {
          throw new Error('لا يوجد مندوب متاح بموقع مسجل لاستلام التحويل.');
        }
        const assignedAt = new Date().toISOString();
        setOrders((current) =>
          current.map((item) =>
            item.id === order.id
              ? {
                  ...item,
                  courierId: candidate.id,
                  courierName: candidate.fullName,
                  courierPhone: candidate.phone,
                  status: 'assigned',
                  assignedAt,
                  acceptedAt: undefined,
                }
              : item,
          ),
        );
        setOrderTransferRequests((current) =>
          current.map((item) =>
            item.id === requestId
              ? {
                  ...item,
                  status: 'approved',
                  toCourierId: candidate.id,
                  toCourierName: candidate.fullName,
                  toCourierCode: candidate.code,
                  requiresHandoff: order.status === 'picked_up',
                  resolvedAt: assignedAt,
                }
              : item,
          ),
        );
        setOrderAssignmentAttempts((current) => [
          {
            id: `demo-transfer-${order.id}-${assignedAt}`,
            orderId: order.id,
            orderCode: order.code,
            courierId: candidate.id,
            assignedAt,
            status: 'awaiting',
          },
          ...current,
        ]);
        return candidate.id;
      }
      const { data, error } = await assertBackend().rpc('admin_decide_order_transfer', {
        p_request_id: requestId,
        p_approve: approve,
      });
      if (error) throw error;
      await refresh();
      if (!approve) return null;
      const courierId = Number(data);
      if (!Number.isSafeInteger(courierId) || courierId < 1) {
        throw new Error('لم يرجع الخادم هوية المندوب الجديد.');
      }
      return courierId;
    },
    [couriers, isDemo, locations, orderTransferRequests, orders, profile, refresh],
  );

  const assignOrder = useCallback(
    async (orderId: string, courierId: number, deliveryFeePiasters?: number) => {
      if (!profile || profile.role !== 'admin') {
        throw new Error('إسناد الطلبات متاح للإدارة فقط.');
      }
      if (
        deliveryFeePiasters !== undefined &&
        (!Number.isSafeInteger(deliveryFeePiasters) || deliveryFeePiasters < 0)
      ) {
        throw new Error('أدخل رسوم توصيل صحيحة لا تقل عن صفر.');
      }
      if (
        orders.find((order) => order.id === orderId)?.status === 'pending' &&
        deliveryFeePiasters == null
      ) {
        throw new Error('أدخل رسوم التوصيل لهذا الطلب قبل إرساله للمندوب.');
      }
      if (isDemo) {
        const courier = couriers.find((item) => item.id === courierId);
        if (
          !courier?.isActive ||
          !courier.isOnShift ||
          courier.shiftCloseRequestedAt ||
          courier.isOnBreak ||
          courier.isTerminated ||
          courier.contractEndDate < new Date().toISOString().slice(0, 10)
        ) {
          throw new Error('اختر مندوبًا نشطًا وعلى الشيفت.');
        }
        const order = orders.find((item) => item.id === orderId);
        if (!order || !['pending', 'assigned', 'accepted', 'picked_up'].includes(order.status)) {
          throw new Error('لا يمكن تحويل هذا الطلب بعد الآن.');
        }
        const feePiasters = deliveryFeePiasters ?? order.deliveryFeePiasters;
        if (feePiasters == null) {
          throw new Error('أدخل رسوم التوصيل لهذا الطلب عند إسناده للمندوب.');
        }
        const assignedAt = new Date().toISOString();
        setOrders((current) =>
          current.map((order) =>
            order.id === orderId
              ? {
                  ...order,
                  courierId,
                  courierName: courier.fullName,
                  courierPhone: courier.phone,
                  deliveryFeePiasters: feePiasters,
                  amountDuePiasters: order.restaurantDuePiasters + feePiasters,
                  status: 'assigned',
                  assignedAt,
                  acceptedAt: undefined,
                  assignmentExpiredAt: undefined,
                  lastUnacceptedCourierId: undefined,
                }
                : order,
          ),
        );
        setOrderAssignmentAttempts((current) => [
          {
            id: `demo-${orderId}-${assignedAt}`,
            orderId,
            orderCode: order.code,
            courierId,
            assignedAt,
            status: 'awaiting',
          },
          ...current.map((attempt) =>
            attempt.orderId === orderId && attempt.status === 'awaiting'
              ? { ...attempt, status: 'not_accepted' as const, resolvedAt: assignedAt }
              : attempt,
          ),
        ]);
        return;
      }
      const client = assertBackend();
      const { error } = await client.rpc('admin_assign_order', {
        p_order_id: orderId,
        p_courier_id: courierId,
        p_delivery_fee_piasters: deliveryFeePiasters ?? null,
      });
      if (error) throw error;
      await refresh();
    },
    [couriers, isDemo, orders, profile, refresh],
  );

  const setCourierActive = useCallback(
    async (courierId: number, active: boolean) => {
      if (!profile || profile.role !== 'admin') {
        throw new Error('إدارة حسابات المندوبين متاحة للإدارة فقط.');
      }
      if (isDemo) {
        if (!active && orders.some(
          (order) =>
            order.courierId === courierId &&
            ['assigned', 'accepted', 'picked_up'].includes(order.status),
        )) {
          throw new Error('حوّل أو أكمل طلبات المندوب غير المنتهية قبل إيقاف الحساب.');
        }
        if (!couriers.some((item) => item.id === courierId)) {
          throw new Error('حساب المندوب غير موجود.');
        }
        setCouriers((current) =>
          current.map((item) =>
            item.id === courierId
            ? {
                ...item,
                isActive: active,
                isOnShift: active && item.isOnShift,
                breakUntil: active ? item.breakUntil : undefined,
                isOnBreak: active && item.isOnBreak,
                breakStartedBy: active ? item.breakStartedBy : undefined,
              }
            : item,
          ),
        );
        return;
      }
      const { data, error } = await assertBackend().functions.invoke('admin-manage-courier', {
        body: { courierId, isActive: active },
      });
      if (error) {
        if (error.context instanceof Response) {
          const response = await error.context.json().catch(() => null);
          if (typeof response?.error === 'string') throw new Error(response.error);
        }
        throw error;
      }
      if (data?.isActive !== active) {
        throw new Error(
          typeof data?.error === 'string' ? data.error : 'لم يؤكد الخادم تغيير حالة الحساب.',
        );
      }
      setCouriers((current) =>
        current.map((item) =>
          item.id === courierId
            ? {
                ...item,
                isActive: active,
                isOnShift: active && item.isOnShift,
                isOnBreak: active && item.isOnBreak,
                breakUntil: active ? item.breakUntil : undefined,
                breakStartedBy: active ? item.breakStartedBy : undefined,
              }
            : item,
        ),
      );
      try {
        await refresh();
      } catch (error) {
        throw new Error(
          `تم ${active ? 'تفعيل' : 'إيقاف'} الحساب، لكن تعذر تحديث بقية البيانات. حدّث القائمة يدويًا. ${
            error instanceof Error ? error.message : ''
          }`.trim(),
        );
      }
    },
    [couriers, isDemo, orders, profile, refresh],
  );

  const setBreakRequestsEnabled = useCallback(
    async (enabled: boolean) => {
      if (!profile || profile.role !== 'admin') {
        throw new Error('إدارة طلبات البريك متاحة للإدارة فقط.');
      }
      if (isDemo) {
        setBreakRequestsEnabledState(enabled);
        return;
      }
      const { error } = await assertBackend().rpc('admin_set_break_requests_enabled', {
        p_enabled: enabled,
      });
      if (error) throw error;
      setBreakRequestsEnabledState(enabled);
    },
    [isDemo, profile],
  );

  const requestCourierBreak = useCallback(
    async (durationMinutes: number) => {
      if (!profile || profile.role !== 'courier') {
        throw new Error('طلب البريك متاح لحسابات المناديب فقط.');
      }
      if (![5, 10, 15, 20, 30, 60].includes(durationMinutes)) {
        throw new Error('مدة البريك غير مدعومة.');
      }
      if (!breakRequestsEnabled) {
        throw new Error('طلبات البريك متوقفة حاليًا من الإدارة بسبب ضغط الطلبات.');
      }
      if (!profile.isOnShift) throw new Error('ابدأ الشيفت أولًا لطلب بريك.');
      if (isDemo) {
        const breakUntil = new Date(Date.now() + durationMinutes * 60_000).toISOString();
        setProfile({ ...profile, breakUntil, breakStartedBy: 'courier' });
        return breakUntil;
      }
      const { data, error } = await assertBackend().rpc('request_courier_break', {
        p_duration_minutes: durationMinutes,
      });
      if (error) throw error;
      if (typeof data !== 'string') {
        throw new Error('لم يرجع الخادم موعد انتهاء البريك.');
      }
      setProfile({ ...profile, breakUntil: data, breakStartedBy: 'courier' });
      return data;
    },
    [breakRequestsEnabled, isDemo, profile],
  );

  const endCourierBreak = useCallback(
    async (courierId: number) => {
      if (!profile) throw new Error('سجّل الدخول أولًا.');
      if (profile.role === 'courier') {
        if (profile.courierId !== courierId) {
          throw new Error('يمكنك فك البريك الخاص بحسابك فقط.');
        }
        if (profile.breakStartedBy !== 'courier') {
          throw new Error('هذا البريك بدأته الإدارة؛ اطلب من الإدارة إرجاعك للشغل.');
        }
      } else if (profile.role !== 'admin') {
        throw new Error('فك البريك متاح للمندوب نفسه أو للإدارة فقط.');
      }

      if (isDemo) {
        if (profile.role === 'courier') {
          setProfile({ ...profile, breakUntil: undefined, breakStartedBy: undefined });
        } else {
          setCouriers((current) =>
            current.map((courier) =>
              courier.id === courierId
                ? { ...courier, isOnBreak: false, breakUntil: undefined, breakStartedBy: undefined }
                : courier,
            ),
          );
        }
        return;
      }

      const client = assertBackend();
      const { error } = profile.role === 'admin'
        ? await client.rpc('admin_end_courier_break', { p_courier_id: courierId })
        : await client.rpc('end_courier_break');
      if (error) throw error;

      if (profile.role === 'courier') {
        setProfile({ ...profile, breakUntil: undefined, breakStartedBy: undefined });
      } else {
        setCouriers((current) =>
          current.map((courier) =>
            courier.id === courierId
              ? { ...courier, isOnBreak: false, breakUntil: undefined, breakStartedBy: undefined }
              : courier,
          ),
        );
      }
    },
    [isDemo, profile],
  );

  const renewCourierContract = useCallback(
    async (courierId: number) => {
      if (!profile || profile.role !== 'admin') {
        throw new Error('تجديد العقود متاح للإدارة فقط.');
      }
      if (isDemo) {
        const today = new Date();
        const startDate = today.toISOString().slice(0, 10);
        const end = new Date(today);
        end.setFullYear(end.getFullYear() + 1);
        setCouriers((current) =>
          current.map((courier) =>
            courier.id === courierId
              ? { ...courier, contractStartDate: startDate, contractEndDate: end.toISOString().slice(0, 10) }
              : courier,
          ),
        );
        return;
      }
      const { error } = await assertBackend().rpc('admin_renew_courier_contract', {
        p_courier_id: courierId,
      });
      if (error) throw error;
      await refresh();
    },
    [isDemo, profile, refresh],
  );

  const updateCourierProfile = useCallback(
    async (courierId: number, input: CourierProfileUpdateInput) => {
      if (!profile || profile.role !== 'admin') {
        throw new Error('تعديل بيانات المندوب متاح للإدارة فقط.');
      }
      if (isDemo) throw new Error('تعديل الملفات الحقيقية غير متاح في المعاينة.');
      if (input.idCard?.fileSize && input.idCard.fileSize > 8 * 1024 * 1024) {
        throw new Error('حجم صورة البطاقة أكبر من 8 ميجابايت.');
      }
      if (input.selfie?.fileSize && input.selfie.fileSize > 8 * 1024 * 1024) {
        throw new Error('حجم صورة السيلفي أكبر من 8 ميجابايت.');
      }

      const client = assertBackend();
      const uploaded: { bucket: string; path: string }[] = [];
      let saved = false;
      const uploadImage = async (
        image: CourierProfileUpdateInput['idCard'],
        bucket: 'courier-id-cards' | 'courier-profile-photos',
      ) => {
        if (!image) return undefined;
        const extension = image.mimeType.includes('png')
          ? 'png'
          : image.mimeType.includes('webp')
            ? 'webp'
            : 'jpg';
        const path = `${profile.id}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
        const { error } = await client.storage.from(bucket).upload(path, decode(image.base64), {
          contentType: image.mimeType,
          upsert: false,
        });
        if (error) throw error;
        uploaded.push({ bucket, path });
        return path;
      };

      try {
        const idCardPath = await uploadImage(input.idCard, 'courier-id-cards');
        const selfiePath = await uploadImage(input.selfie, 'courier-profile-photos');
        const { data, error } = await client.functions.invoke('admin-manage-account', {
          body: {
            action: 'update-courier',
            accountId: courierId,
            fullName: input.fullName.trim(),
            email: input.email.trim(),
            phone: input.phone.trim(),
            nationalId: input.nationalId.trim(),
            address: input.address.trim(),
            idCardPath,
            selfiePath,
          },
        });
        if (error) throw new Error(await getAccountFunctionErrorMessage(error));
        if (data?.success !== true) throw new Error('لم يؤكد الخادم حفظ بيانات المندوب.');
        saved = true;
        await refresh();
      } catch (error) {
        if (saved) throw error;
        const cleanupResults = await Promise.all(
          uploaded.map(({ bucket, path }) => client.storage.from(bucket).remove([path])),
        );
        if (cleanupResults.some((result) => result.error)) {
          throw new Error(
            `${error instanceof Error ? error.message : 'تعذر حفظ ملف المندوب.'} وتعذر حذف صورة مؤقتة من التخزين.`,
          );
        }
        throw error;
      }
    },
    [isDemo, profile, refresh],
  );

  const terminateCourier = useCallback(
    async (courierId: number) => {
      if (!profile || profile.role !== 'admin') {
        throw new Error('إنهاء حساب المندوب متاح للإدارة فقط.');
      }
      if (isDemo) {
        const courier = couriers.find((item) => item.id === courierId);
        if (!courier) throw new Error('حساب المندوب غير موجود.');
        if (orders.some((order) => order.courierId === courierId && ['assigned', 'accepted', 'picked_up'].includes(order.status))) {
          throw new Error('حوّل أو أكمل طلبات المندوب غير المنتهية قبل الإيقاف النهائي.');
        }
        setCouriers((current) =>
          current.map((item) =>
            item.id === courierId
              ? { ...item, isActive: false, isOnShift: false, isTerminated: true, isOnBreak: false, breakUntil: undefined, breakStartedBy: undefined }
              : item,
          ),
        );
        return;
      }
      const { data, error } = await assertBackend().functions.invoke('admin-manage-account', {
        body: { action: 'terminate-courier', accountId: courierId },
      });
      if (error) throw new Error(await getAccountFunctionErrorMessage(error));
      if (data?.success !== true) throw new Error('لم يؤكد الخادم الإيقاف النهائي.');
      await refresh();
    },
    [couriers, isDemo, orders, profile, refresh],
  );

  const setAccountPassword = useCallback(
    async (
      accountType: ManagedAccountType,
      accountId: number | string,
      password?: string,
    ) => {
      if (!profile || profile.role !== 'admin') {
        throw new Error('تغيير كلمات المرور متاح للإدارة فقط.');
      }
      if (isDemo) throw new Error('المعاينة لا تغيّر كلمات مرور حقيقية.');

      const { data, error } = await assertBackend().functions.invoke('admin-manage-account', {
        body: { action: 'set-password', accountType, accountId, password: password || undefined },
      });
      if (error) throw new Error(await getAccountFunctionErrorMessage(error));
      if (
        !data ||
        (typeof data.temporaryPassword !== 'string' && data.updated !== true)
      ) {
        throw new Error('لم يرجع الخادم نتيجة تغيير كلمة المرور.');
      }
      return { temporaryPassword: data.temporaryPassword as string | undefined };
    },
    [isDemo, profile],
  );

  const getCourierPrivateDetails = useCallback(
    async (courierId: number) => {
      if (!profile || profile.role !== 'admin') {
        throw new Error('عرض بيانات هوية المندوب متاح للإدارة فقط.');
      }
      if (isDemo) throw new Error('بيانات الهوية غير متاحة في المعاينة.');

      const { data, error } = await assertBackend().functions.invoke('admin-manage-account', {
        body: { action: 'get-courier-details', accountType: 'courier', accountId: courierId },
      });
      if (error) throw new Error(await getAccountFunctionErrorMessage(error));
      if (!isCourierPrivateDetails(data)) {
        throw new Error('لم تصل بيانات ملف المندوب كاملة. أعد تحميل الملف أو حدّث التطبيق.');
      }
      return data;
    },
    [isDemo, profile],
  );

  const loadSupportConversations = useCallback(async () => {
    if (!profile) throw new Error('سجّل الدخول لفتح الدعم الفني.');
    if (isDemo) {
      return demoConversations
        .filter(
          (conversation) =>
            profile.role === 'admin' ||
            profile.role === 'support' ||
            conversation.openedBy === profile.id,
        )
        .sort((left, right) => right.lastMessageAt.localeCompare(left.lastMessageAt));
    }

    const { data, error } = await assertBackend()
      .from('support_conversations')
      .select(
        'id, opened_by, requester_role, requester_name, subject, related_order_id, related_order_code, status, assigned_to, assigned_name, last_message_body, last_message_at, created_at',
      )
      .order('last_message_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) =>
      mapSupportConversation(row as Record<string, unknown>),
    );
  }, [demoConversations, isDemo, profile]);

  const loadSupportMessages = useCallback(
    async (conversationId: string) => {
      if (!profile) throw new Error('سجّل الدخول لفتح المحادثة.');
      if (isDemo) {
        const conversation = demoConversations.find((item) => item.id === conversationId);
        if (
          !conversation ||
          (profile.role !== 'admin' &&
            profile.role !== 'support' &&
            conversation.openedBy !== profile.id)
        ) {
          throw new Error('هذه المحادثة غير متاحة لهذا الحساب.');
        }
        if (
          conversation.status === 'resolved' &&
          (profile.role === 'courier' || profile.role === 'restaurant')
        ) {
          throw new Error('تم حل المشكلة وإغلاق المحادثة؛ لا يمكن إرسال رسائل جديدة.');
        }
        return demoMessages.filter((message) => message.conversationId === conversationId);
      }

      const { data, error } = await assertBackend()
        .from('support_messages')
        .select('id, conversation_id, sender_id, sender_name, sender_role, body, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => mapSupportMessage(row as Record<string, unknown>));
    },
    [demoConversations, demoMessages, isDemo, profile],
  );

  const listSupportAgents = useCallback(async () => {
    if (!profile || profile.role !== 'admin') {
      throw new Error('قائمة موظفي الدعم متاحة للإدارة فقط.');
    }
    if (isDemo) return demoSupportAgents.map((agent) => ({ ...agent }));

    const { data, error } = await assertBackend()
      .from('profiles')
      .select('id, full_name, email, phone, created_at')
      .eq('role', 'support')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => ({
      id: row.id,
      name: row.full_name,
      email: row.email,
      phone: row.phone ?? undefined,
      createdAt: row.created_at,
    }));
  }, [isDemo, profile]);

  const createSupportConversation = useCallback(
    async (subject: string, body: string, relatedOrderId?: string) => {
      if (!profile || (profile.role !== 'courier' && profile.role !== 'restaurant')) {
        throw new Error('بدء محادثة دعم متاح للمندوبين والمطاعم فقط.');
      }
      const cleanSubject = subject.trim();
      const cleanBody = body.trim();
      if (cleanSubject.length < 3 || cleanSubject.length > 120) {
        throw new Error('اكتب عنوانًا من 3 إلى 120 حرفًا.');
      }
      if (!cleanBody || cleanBody.length > 4000) {
        throw new Error('اكتب رسالة من 1 إلى 4000 حرف.');
      }
      if (isDemo) {
        const relatedOrder = relatedOrderId
          ? orders.find(
              (order) =>
                order.id === relatedOrderId &&
                (profile.role === 'restaurant'
                  ? order.restaurantId === profile.restaurantId
                  : order.courierId === profile.courierId),
            )
          : undefined;
        if (relatedOrderId && !relatedOrder) {
          throw new Error('الطلب المختار غير متاح لهذا الحساب.');
        }
        const id = `demo-support-${Date.now()}`;
        const createdAt = new Date().toISOString();
        const conversation: SupportConversation = {
          id,
          openedBy: profile.id,
          requesterRole: profile.role,
          requesterName: profile.name,
          subject: cleanSubject,
          relatedOrderId: relatedOrder?.id,
          relatedOrderCode: relatedOrder?.code,
          status: 'open',
          lastMessageBody: cleanBody.slice(0, 300),
          lastMessageAt: createdAt,
          createdAt,
        };
        const message: SupportMessage = {
          id: Date.now(),
          conversationId: id,
          senderId: profile.id,
          senderName: profile.name,
          senderRole: profile.role,
          body: cleanBody,
          createdAt,
        };
        setDemoConversations((current) => [conversation, ...current]);
        setDemoMessages((current) => [...current, message]);
        setSupportRevision((revision) => revision + 1);
        return id;
      }

      const { data, error } = await assertBackend().rpc('create_support_conversation', {
        p_subject: cleanSubject,
        p_body: cleanBody,
        p_related_order_id: relatedOrderId ?? null,
      });
      if (error) throw error;
      if (typeof data !== 'string') throw new Error('لم يرجع الخادم رقم المحادثة.');
      setSupportRevision((revision) => revision + 1);
      return data;
    },
    [isDemo, orders, profile],
  );

  const sendSupportMessage = useCallback(
    async (conversationId: string, body: string) => {
      if (!profile) throw new Error('سجّل الدخول لإرسال الرسالة.');
      const cleanBody = body.trim();
      if (!cleanBody || cleanBody.length > 4000) {
        throw new Error('اكتب رسالة من 1 إلى 4000 حرف.');
      }
      if (isDemo) {
        const conversation = demoConversations.find((item) => item.id === conversationId);
        if (
          !conversation ||
          (profile.role !== 'admin' &&
            profile.role !== 'support' &&
            conversation.openedBy !== profile.id)
        ) {
          throw new Error('هذه المحادثة غير متاحة لهذا الحساب.');
        }
        const createdAt = new Date().toISOString();
        const message: SupportMessage = {
          id: Date.now(),
          conversationId,
          senderId: profile.id,
          senderName: profile.name,
          senderRole: profile.role,
          body: cleanBody,
          createdAt,
        };
        setDemoMessages((current) => [...current, message]);
        setDemoConversations((current) =>
          current.map((item) =>
            item.id === conversationId
              ? {
                  ...item,
                  lastMessageBody: cleanBody.slice(0, 300),
                  lastMessageAt: createdAt,
                  status:
                    item.status === 'resolved' &&
                    (profile.role === 'courier' || profile.role === 'restaurant')
                      ? 'open'
                      : item.status,
                  assignedTo:
                    item.status === 'resolved' &&
                    (profile.role === 'courier' || profile.role === 'restaurant')
                      ? undefined
                      : item.assignedTo,
                  assignedName:
                    item.status === 'resolved' &&
                    (profile.role === 'courier' || profile.role === 'restaurant')
                      ? undefined
                      : item.assignedName,
                }
              : item,
          ),
        );
        setSupportRevision((revision) => revision + 1);
        return;
      }

      const { error } = await assertBackend().from('support_messages').insert({
        conversation_id: conversationId,
        body: cleanBody,
      });
      if (error) throw error;
      setSupportRevision((revision) => revision + 1);
    },
    [demoConversations, isDemo, profile],
  );

  const claimSupportConversation = useCallback(
    async (conversationId: string) => {
      if (!profile || !['admin', 'support'].includes(profile.role)) {
        throw new Error('استلام المحادثات متاح لفريق الدعم فقط.');
      }
      if (isDemo) {
        const conversation = demoConversations.find((item) => item.id === conversationId);
        if (!conversation || conversation.status === 'resolved') {
          throw new Error('المحادثة غير متاحة للاستلام.');
        }
        if (conversation.assignedTo && conversation.assignedTo !== profile.id && profile.role !== 'admin') {
          throw new Error('استلم موظف آخر هذه المحادثة بالفعل.');
        }
        setDemoConversations((current) =>
          current.map((item) =>
            item.id === conversationId
              ? {
                  ...item,
                  assignedTo: profile.id,
                  assignedName: profile.name,
                  status: item.status === 'open' ? 'in_progress' : item.status,
                }
              : item,
          ),
        );
        setSupportRevision((revision) => revision + 1);
        return;
      }

      const { error } = await assertBackend().rpc('claim_support_conversation', {
        p_conversation_id: conversationId,
      });
      if (error) throw error;
      setSupportRevision((revision) => revision + 1);
    },
    [demoConversations, isDemo, profile],
  );

  const setSupportConversationStatus = useCallback(
    async (conversationId: string, status: SupportConversationStatus) => {
      if (!profile || !['admin', 'support'].includes(profile.role)) {
        throw new Error('تغيير حالة المحادثة متاح لفريق الدعم فقط.');
      }
      if (isDemo) {
        const conversation = demoConversations.find((item) => item.id === conversationId);
        if (!conversation) throw new Error('المحادثة غير موجودة.');
        if (conversation.assignedTo && conversation.assignedTo !== profile.id && profile.role !== 'admin') {
          throw new Error('المحادثة مستلمة بواسطة موظف آخر.');
        }
        setDemoConversations((current) =>
          current.map((item) =>
            item.id === conversationId ? { ...item, status } : item,
          ),
        );
        setSupportRevision((revision) => revision + 1);
        return;
      }

      const { error } = await assertBackend().rpc('set_support_conversation_status', {
        p_conversation_id: conversationId,
        p_status: status,
      });
      if (error) throw error;
      setSupportRevision((revision) => revision + 1);
    },
    [demoConversations, isDemo, profile],
  );

  const createSupportAgent = useCallback(
    async (input: NewSupportAgentInput) => {
      if (!profile || profile.role !== 'admin') {
        throw new Error('إنشاء حسابات الدعم متاح للإدارة فقط.');
      }
      if (isDemo) {
        throw new Error('المعاينة لا تنشئ حسابات حقيقية.');
      }
      const fullName = input.fullName.trim();
      const email = input.email.trim();
      const phone = input.phone.trim();
      if (!fullName || !email || !/^[+\d][\d\s-]{7,16}$/.test(phone)) {
        throw new Error('راجع الاسم والبريد الإلكتروني ورقم الهاتف.');
      }

      const { data, error } = await assertBackend().functions.invoke('admin-create-account', {
        body: { role: 'support', email, fullName, phone },
      });
      if (error) throw new Error(await getAccountFunctionErrorMessage(error));
      if (!data?.code || !data?.temporaryPassword || !data?.email) {
        throw new Error('لم يرجع الخادم بيانات الحساب المؤقتة.');
      }
      return {
        code: data.code as string,
        email: data.email as string,
        temporaryPassword: data.temporaryPassword as string,
      };
    },
    [isDemo, profile],
  );

  const acceptOrder = useCallback(
    async (orderId: string) => {
      if (isDemo) {
        const acceptedAt = new Date().toISOString();
        setOrders((current) =>
          current.map((order) =>
            order.id === orderId
              ? { ...order, status: 'accepted', acceptedAt }
              : order,
          ),
        );
        setOrderAssignmentAttempts((current) =>
          current.map((attempt) =>
            attempt.orderId === orderId && attempt.status === 'awaiting'
              ? { ...attempt, status: 'accepted', acceptedAt, resolvedAt: acceptedAt }
              : attempt,
          ),
        );
        return;
      }
      const { error } = await assertBackend().rpc('accept_order', { p_order_id: orderId });
      if (error) {
        if (error.message.includes('acceptance window has expired')) {
          throw new Error('انتهت مهلة قبول الطلب؛ لم يعد بإمكانك قبوله وسيعود للإدارة تلقائيًا.');
        }
        throw error;
      }
      await refresh();
    },
    [isDemo, refresh],
  );

  const advanceOrder = useCallback(
    async (orderId: string, status: 'picked_up' | 'delivered') => {
      if (isDemo) {
        const handoff = orderTransferRequests.find(
          (request) =>
            request.orderId === orderId &&
            request.status === 'approved' &&
            request.toCourierId === profile?.courierId &&
            request.requiresHandoff,
        );
        setOrders((current) =>
          current.map((order) =>
            order.id === orderId
              ? {
                  ...order,
                  status,
                  paidToRestaurantPiasters:
                    status === 'picked_up'
                      ? handoff
                        ? 0
                        : order.restaurantDuePiasters
                      : order.paidToRestaurantPiasters ?? order.restaurantDuePiasters,
                  paidToPreviousCourierPiasters:
                    status === 'picked_up' && handoff
                      ? order.restaurantDuePiasters
                      : order.paidToPreviousCourierPiasters,
                  previousCourierId: handoff?.fromCourierId ?? order.previousCourierId,
                  collectedPiasters:
                    status === 'delivered'
                      ? order.amountDuePiasters
                      : order.collectedPiasters,
                  deliveredAt: status === 'delivered' ? new Date().toISOString() : undefined,
                }
              : order,
          ),
        );
        return;
      }
      const { error } = await assertBackend().rpc('advance_order_status', {
        p_order_id: orderId,
        p_next_status: status,
      });
      if (error) throw error;
      await refresh();
    },
    [isDemo, orderTransferRequests, profile?.courierId, refresh],
  );

  const setShift = useCallback(
    async (active: boolean) => {
      if (!profile || profile.role !== 'courier' || !profile.courierId) {
        throw new Error('تغيير حالة الشيفت متاح لحساب المندوب فقط.');
      }
      if (isDemo) {
        const now = new Date().toISOString();
        const nowMs = Date.now();
        const nextBooking = active
          ? shiftBookings.find((booking) => {
              const slot = shiftSlots.find((item) => item.id === booking.slotId);
              return (
                booking.courierId === profile.courierId &&
                ['booked', 'swap_listed'].includes(booking.status) &&
                slot != null &&
                nowMs >= new Date(slot.startsAt).getTime() - 30 * 60_000 &&
                nowMs < new Date(slot.endsAt).getTime() &&
                !shiftDayBlocks.some(
                  (block) =>
                    block.courierId === booking.courierId &&
                    block.shiftDate === slot.shiftDate,
                )
              );
            })
          : undefined;
        if (active && !nextBooking) {
          throw new Error('لا يمكنك بدء الشيفت إلا قبل موعده بـ30 دقيقة، ويجب أن يكون لديك حجز.');
        }
        const nextProfile = active
          ? {
              ...profile,
              isOnShift: true,
              shiftStartedAt: now,
              shiftCloseRequestedAt: undefined,
              shiftEndedAt: undefined,
            }
          : { ...profile, isOnShift: true, shiftCloseRequestedAt: now };
        setProfile(nextProfile);
        if (active && nextBooking) {
          setShiftBookings((current) =>
            current.map((booking) =>
              booking.id === nextBooking.id
                ? { ...booking, status: 'booked', swapListedAt: undefined }
                : booking,
            ),
          );
          setShiftRecords((current) => [
            {
              id: Date.now(),
              courierId: profile.courierId!,
              bookingId: nextBooking.id,
              startedAt: now,
            },
            ...current,
          ]);
        }
        setCouriers((current) =>
          current.map((courier) =>
            courier.id === profile.courierId
              ? {
                  ...courier,
                  isOnShift: true,
                  shiftStartedAt: active ? now : courier.shiftStartedAt,
                  shiftCloseRequestedAt: active ? undefined : now,
                  shiftEndedAt: active ? undefined : courier.shiftEndedAt,
                }
              : courier,
          ),
        );
        return;
      }

      const client = assertBackend();
      const {
        requestShiftLocationPermissions,
        startShiftLocationUpdates,
      } = await import('../lib/location');
      if (active) await requestShiftLocationPermissions();
      const { error } = await client.rpc('set_courier_shift', {
        p_active: active,
      });
      if (error) throw error;
      if (active) {
        try {
          await startShiftLocationUpdates(profile.courierId);
        } catch (locationError) {
          const { error: rollbackError } = await client.rpc('set_courier_shift', {
            p_active: false,
          });
          setProfile({
            ...profile,
            isOnShift: true,
            shiftCloseRequestedAt: rollbackError ? undefined : new Date().toISOString(),
          });
          if (rollbackError) {
            throw new Error(
              `تعذر بدء مشاركة الموقع (${errorMessage(locationError, 'حاول مرة أخرى.')}) وكذلك إرسال طلب إغلاق الشيفت (${rollbackError.message}). تواصل مع الإدارة.`,
            );
          }
          throw new Error(
            `تعذر بدء مشاركة الموقع (${errorMessage(locationError, 'حاول مرة أخرى.')})؛ أُرسل طلب إغلاق الشيفت إلى الإدارة للموافقة.`,
          );
        }
      }
      setProfile({
        ...profile,
        isOnShift: true,
        shiftStartedAt: active ? new Date().toISOString() : profile.shiftStartedAt,
        shiftCloseRequestedAt: active ? undefined : new Date().toISOString(),
      });
      await refresh();
    },
    [isDemo, profile, refresh, shiftBookings, shiftDayBlocks, shiftSlots],
  );

  const approveCourierShiftClose = useCallback(
    async (courierId: number) => {
      if (!profile || profile.role !== 'admin') {
        throw new Error('الموافقة على إغلاق الشيفت متاحة للإدارة فقط.');
      }
      if (isDemo) {
        const endedAt = new Date().toISOString();
        const openShift = shiftRecords.find(
          (shift) => shift.courierId === courierId && !shift.endedAt,
        );
        if (openShift) {
          setShiftRecords((current) =>
            current.map((shift) =>
              shift.id === openShift.id ? { ...shift, endedAt } : shift,
            ),
          );
          if (openShift.bookingId != null) {
            setShiftBookings((current) =>
              current.map((booking) =>
                booking.id === openShift.bookingId
                  ? { ...booking, status: 'completed' }
                  : booking,
              ),
            );
          }
        }
        setCouriers((current) =>
          current.map((courier) =>
            courier.id === courierId
              ? {
                  ...courier,
                  isOnShift: false,
                  shiftCloseRequestedAt: undefined,
                  shiftEndedAt: endedAt,
                  shiftStartedAt: undefined,
                  isOnBreak: false,
                  breakUntil: undefined,
                  breakStartedBy: undefined,
                }
              : courier,
          ),
        );
        return;
      }
      const { error } = await assertBackend().rpc('admin_approve_courier_shift_close', {
        p_courier_id: courierId,
      });
      if (error) throw error;
      const endedAt = new Date().toISOString();
      setCouriers((current) =>
        current.map((courier) =>
          courier.id === courierId
            ? {
                ...courier,
                isOnShift: false,
                shiftCloseRequestedAt: undefined,
                shiftEndedAt: endedAt,
                shiftStartedAt: undefined,
                isOnBreak: false,
                breakUntil: undefined,
                breakStartedBy: undefined,
              }
            : courier,
        ),
      );
    },
    [isDemo, profile, shiftRecords],
  );
  const getCourierContact = useCallback(
    async (orderId: string) => {
      if (isDemo) {
        const order = orders.find((item) => item.id === orderId);
        if (!order || !['accepted', 'picked_up', 'delivered'].includes(order.status)) return null;
        return order.courierName && order.courierPhone
          ? { name: order.courierName, phone: order.courierPhone }
          : null;
      }
      const { data, error } = await assertBackend().rpc('get_order_courier_contact', {
        p_order_id: orderId,
      });
      if (error) throw error;
      const contact = Array.isArray(data) ? data[0] : data;
      return contact?.full_name && contact?.phone
        ? { name: contact.full_name, phone: contact.phone }
        : null;
    },
    [isDemo, orders],
  );

  const setRestaurantLocation = useCallback(
    async (latitude: number, longitude: number) => {
      if (isDemo) throw new Error('تحديد موقع مطعم حقيقي يحتاج إلى ربط قاعدة البيانات.');
      if (!profile || profile.role !== 'restaurant') {
        throw new Error('تحديد موقع المطعم متاح لحساب المطعم فقط.');
      }
      const { error } = await assertBackend().rpc('update_restaurant_location', {
        p_latitude: latitude,
        p_longitude: longitude,
      });
      if (error) throw error;
      setProfile({ ...profile, restaurantLatitude: latitude, restaurantLongitude: longitude });
      await refresh();
    },
    [isDemo, profile, refresh],
  );

  const assignOrderToNearestCourier = useCallback(
    async (orderId: string, deliveryFeePiasters: number) => {
      if (!profile || profile.role !== 'admin') {
        throw new Error('إسناد الطلبات متاح للإدارة فقط.');
      }
      if (!Number.isSafeInteger(deliveryFeePiasters) || deliveryFeePiasters < 0) {
        throw new Error('أدخل رسوم توصيل صحيحة لا تقل عن صفر.');
      }
      if (isDemo) {
        const order = orders.find((item) => item.id === orderId);
        const restaurantLatitude = order?.restaurantLatitude;
        const restaurantLongitude = order?.restaurantLongitude;
        if (
          !order ||
          order.status !== 'pending' ||
          restaurantLatitude == null ||
          restaurantLongitude == null
        ) {
          throw new Error('لا يمكن تحديد أقرب مندوب؛ تأكد من أن الطلب ينتظر الإسناد وموقع المطعم محدد.');
        }
        const candidates = couriers
          .flatMap((courier) => {
            const hasActiveOrder = orders.some(
              (item) =>
                item.courierId === courier.id &&
                ['assigned', 'accepted', 'picked_up'].includes(item.status),
            );
            const location = courier.location;
            if (
              courier.isActive &&
              courier.isOnShift &&
              !courier.shiftCloseRequestedAt &&
              !courier.isOnBreak &&
              !courier.isTerminated &&
              courier.contractEndDate >= new Date().toISOString().slice(0, 10) &&
              !hasActiveOrder &&
              location != null
            ) {
              return [{ courier, location }];
            }
            return [];
          })
          .sort((first, second) => {
            const firstDistance = distanceInMeters(
              restaurantLatitude,
              restaurantLongitude,
              first.location.latitude,
              first.location.longitude,
            );
            const secondDistance = distanceInMeters(
              restaurantLatitude,
              restaurantLongitude,
              second.location.latitude,
              second.location.longitude,
            );
            return firstDistance - secondDistance || first.courier.id - second.courier.id;
          });
        const courier = candidates[0]?.courier;
        if (!courier) {
          throw new Error('لا يوجد مندوب على الشيفت بلا طلب حالي ولديه موقع متاح.');
        }
        const assignedAt = new Date().toISOString();
        setOrders((current) =>
          current.map((item) =>
            item.id === orderId
              ? {
                  ...item,
                  courierId: courier.id,
                  courierName: courier.fullName,
                  courierPhone: courier.phone,
                  deliveryFeePiasters,
                  amountDuePiasters: item.restaurantDuePiasters + deliveryFeePiasters,
                  status: 'assigned',
                  assignedAt,
                  acceptedAt: undefined,
                  assignmentExpiredAt: undefined,
                  lastUnacceptedCourierId: undefined,
                }
              : item,
          ),
        );
        setOrderAssignmentAttempts((current) => [
          {
            id: `demo-${orderId}-${assignedAt}`,
            orderId,
            orderCode: order.code,
            courierId: courier.id,
            assignedAt,
            status: 'awaiting',
          },
          ...current.map((attempt) =>
            attempt.orderId === orderId && attempt.status === 'awaiting'
              ? { ...attempt, status: 'not_accepted' as const, resolvedAt: assignedAt }
              : attempt,
          ),
        ]);
        return courier.id;
      }

      const { data, error } = await assertBackend().rpc(
        'admin_assign_order_to_nearest_courier',
        {
          p_order_id: orderId,
          p_delivery_fee_piasters: deliveryFeePiasters,
        },
      );
      if (error) throw error;
      const courierId = Number(data);
      if (!Number.isSafeInteger(courierId) || courierId < 1) {
        throw new Error('لم يرجع الخادم هوية المندوب الذي استلم الطلب.');
      }
      await refresh();
      return courierId;
    },
    [couriers, isDemo, orders, profile, refresh],
  );

  const setRestaurantAcceptingOrders = useCallback(
    async (restaurantId: number, acceptsOrders: boolean) => {
      if (!profile || profile.role !== 'admin') {
        throw new Error('تغيير استقبال الطلبات متاح للإدارة فقط.');
      }
      if (isDemo) {
        throw new Error('تغيير استقبال الطلبات يحتاج إلى قاعدة بيانات متصلة.');
      }
      const { error } = await assertBackend().rpc('admin_set_restaurant_ordering', {
        p_restaurant_id: restaurantId,
        p_accepts_orders: acceptsOrders,
      });
      if (error) throw error;
      setRestaurants((current) =>
        current.map((restaurant) =>
          restaurant.id === restaurantId ? { ...restaurant, acceptsOrders } : restaurant,
        ),
      );
    },
    [isDemo, profile],
  );

  const rejectCourierShiftClose = useCallback(
    async (courierId: number) => {
      if (!profile || profile.role !== 'admin') {
        throw new Error('رفض طلب إغلاق الشيفت متاح للإدارة فقط.');
      }
      if (isDemo) {
        setCouriers((current) =>
          current.map((courier) =>
            courier.id === courierId
              ? { ...courier, shiftCloseRequestedAt: undefined }
              : courier,
          ),
        );
        return;
      }
      const { error } = await assertBackend().rpc('admin_reject_courier_shift_close', {
        p_courier_id: courierId,
      });
      if (error) throw error;
      setCouriers((current) =>
        current.map((courier) =>
          courier.id === courierId
            ? { ...courier, shiftCloseRequestedAt: undefined }
            : courier,
        ),
      );
    },
    [isDemo, profile],
  );

  const setCourierOnBreak = useCallback(
    async (courierId: number, durationMinutes: number) => {
      if (!profile || profile.role !== 'admin') {
        throw new Error('إخراج المندوب لبريك متاح للإدارة فقط.');
      }
      if (![5, 10, 15, 20, 30, 60].includes(durationMinutes)) {
        throw new Error('اختر مدة بريك مدعومة.');
      }
      const courier = couriers.find((item) => item.id === courierId);
      if (!courier || !courier.isActive || courier.isTerminated) {
        throw new Error('المندوب غير متاح للبريك.');
      }
      if (!courier.isOnShift || courier.shiftCloseRequestedAt) {
        throw new Error('المندوب ليس على شيفت متاح.');
      }
      if (courier.breakUntil && new Date(courier.breakUntil) > new Date()) {
        throw new Error('المندوب في بريك بالفعل.');
      }
      if (orders.some(
        (order) =>
          order.courierId === courierId &&
          ['assigned', 'accepted', 'picked_up'].includes(order.status),
      )) {
        throw new Error('حوّل أو أكمل طلب المندوب قبل إخراجه لبريك.');
      }
      if (isDemo) {
        const breakUntil = new Date(Date.now() + durationMinutes * 60_000).toISOString();
        setCouriers((current) =>
          current.map((item) =>
            item.id === courierId
              ? { ...item, isOnBreak: true, breakUntil, breakStartedBy: 'admin' }
              : item,
          ),
        );
        return breakUntil;
      }
      const { data, error } = await assertBackend().rpc('admin_start_courier_break', {
        p_courier_id: courierId,
        p_duration_minutes: durationMinutes,
      });
      if (error) throw error;
      if (typeof data !== 'string') {
        throw new Error('لم يرجع الخادم موعد انتهاء البريك.');
      }
      setCouriers((current) =>
        current.map((item) =>
          item.id === courierId
            ? { ...item, isOnBreak: true, breakUntil: data, breakStartedBy: 'admin' }
            : item,
        ),
      );
      return data;
    },
    [couriers, isDemo, orders, profile],
  );

  const recordCourierFeeRemittance = useCallback(
    async (courierId: number, amountPiasters: number) => {
      if (!profile || profile.role !== 'admin') {
        throw new Error('تسجيل استلام التوريد متاح للإدارة فقط.');
      }
      if (!Number.isSafeInteger(amountPiasters) || amountPiasters <= 0) {
        throw new Error('أدخل مبلغًا صحيحًا أكبر من صفر.');
      }
      const courier = couriers.find((item) => item.id === courierId);
      if (!courier) throw new Error('لم يتم العثور على حساب المندوب.');

      if (isDemo) {
        const outstanding = orders
          .filter((order) => order.courierId === courierId && order.status === 'delivered')
          .reduce(
            (total, order) =>
              total +
              Math.max(
                0,
                (order.deliveryFeePiasters ?? 0) -
                  (order.deliveryFeeRemittedPiasters ?? 0),
              ),
            0,
          );
        if (amountPiasters > outstanding) {
          throw new Error('المبلغ أكبر من مديونية رسوم التوصيل المستحقة.');
        }
      }

      let id: string;
      if (isDemo) {
        id = `demo-${Date.now()}`;
      } else {
        const { data, error } = await assertBackend().rpc(
          'admin_record_courier_fee_remittance',
          {
            p_courier_id: courierId,
            p_amount_piasters: amountPiasters,
          },
        );
        if (error) throw error;
        if (
          (typeof data !== 'number' && typeof data !== 'string') ||
          String(data).trim() === ''
        ) {
          throw new Error('لم يرجع الخادم رقم إيصال التوريد.');
        }
        id = String(data);
      }

      const remittance: CourierFeeRemittance = {
        id,
        courierId,
        amountPiasters,
        receivedAt: new Date().toISOString(),
        receivedBy: profile.id,
      };
      setOrders((current) =>
        allocateCourierFeeRemittance(current, courierId, amountPiasters),
      );
      setCourierFeeRemittances((current) => [remittance, ...current]);
      return remittance;
    },
    [couriers, isDemo, orders, profile],
  );

  const contextValue = useMemo<AppContextValue>(
    () => ({
      profile,
      isLoading,
      isDemo,
      hasLoadedData,
      refreshError,
      orders,
      orderAssignmentAttempts,
      orderReturns,
      orderTransferRequests,
      courierFeeRemittances,
      couriers,
      shiftSlots,
      shiftBookings,
      shiftRecords,
      breakPeriods,
      shiftDayBlocks,
      restaurants,
      restaurantMenuItems,
      locations,
      breakRequestsEnabled,
      supportRevision,
      loadSupportConversations,
      loadSupportMessages,
      listSupportAgents,
      createSupportConversation,
      sendSupportMessage,
      claimSupportConversation,
      setSupportConversationStatus,
      createSupportAgent,
      signIn,
      signInDemo,
      signOut,
      refresh,
      loadOrderDetails,
      publishShiftSlots,
      bookShift,
      offerShiftSwap,
      removeCourierShift,
      blockCourierShiftDay,
      unblockCourierShiftDay,
      registerCourierPushToken,
      notifyUnbookedCouriers,
      createOrder,
      acceptAdminOrder,
      loadRestaurantMenu,
      saveRestaurantMenuItem,
      createCourier,
      createRestaurant,
      cancelOrder,
      startOrderReturn,
      completeOrderReturn,
      confirmOrderReturn,
      requestOrderTransfer,
      decideOrderTransfer,
      assignOrder,
      assignOrderToNearestCourier,
      acceptOrder,
      advanceOrder,
      setShift,
      approveCourierShiftClose,
      rejectCourierShiftClose,
      setCourierOnBreak,
      endCourierBreak,
      recordCourierFeeRemittance,
      setCourierActive,
      setBreakRequestsEnabled,
      requestCourierBreak,
      renewCourierContract,
      updateCourierProfile,
      terminateCourier,
      setAccountPassword,
      getCourierPrivateDetails,
      getCourierContact,
      setRestaurantLocation,
      setRestaurantAcceptingOrders,
    }),
    [
      profile,
      isLoading,
      isDemo,
      hasLoadedData,
      refreshError,
      orders,
      orderAssignmentAttempts,
      orderReturns,
      orderTransferRequests,
      courierFeeRemittances,
      couriers,
      shiftSlots,
      shiftBookings,
      shiftRecords,
      breakPeriods,
      shiftDayBlocks,
      restaurants,
      restaurantMenuItems,
      locations,
      breakRequestsEnabled,
      supportRevision,
      loadSupportConversations,
      loadSupportMessages,
      listSupportAgents,
      createSupportConversation,
      sendSupportMessage,
      claimSupportConversation,
      setSupportConversationStatus,
      createSupportAgent,
      signIn,
      signInDemo,
      signOut,
      refresh,
      loadOrderDetails,
      publishShiftSlots,
      bookShift,
      offerShiftSwap,
      removeCourierShift,
      blockCourierShiftDay,
      unblockCourierShiftDay,
      registerCourierPushToken,
      notifyUnbookedCouriers,
      createOrder,
      acceptAdminOrder,
      loadRestaurantMenu,
      saveRestaurantMenuItem,
      createCourier,
      createRestaurant,
      cancelOrder,
      startOrderReturn,
      completeOrderReturn,
      confirmOrderReturn,
      requestOrderTransfer,
      decideOrderTransfer,
      assignOrder,
      assignOrderToNearestCourier,
      acceptOrder,
      advanceOrder,
      setShift,
      approveCourierShiftClose,
      rejectCourierShiftClose,
      setCourierOnBreak,
      endCourierBreak,
      recordCourierFeeRemittance,
      setCourierActive,
      setBreakRequestsEnabled,
      requestCourierBreak,
      renewCourierContract,
      updateCourierProfile,
      terminateCourier,
      setAccountPassword,
      getCourierPrivateDetails,
      getCourierContact,
      setRestaurantLocation,
      setRestaurantAcceptingOrders,
    ],
  );

  return <AppContext.Provider value={contextValue}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp يجب أن يعمل داخل AppProvider.');
  return context;
}

export function parsePiasters(value: string) {
  const normalized = value.replace(/[,\u066c]/g, '').replace('\u066b', '.').trim();
  if (!normalized) {
    throw new Error('أدخل المبلغ أولًا.');
  }
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('اكتب مبلغًا صحيحًا أكبر من أو يساوي صفر.');
  }
  return Math.round(amount * 100);
}

export function toImagePickerInput(asset: ImagePickerAsset) {
  if (!asset.base64) throw new Error('تعذر قراءة الصورة؛ التقطها أو اخترها مرة أخرى.');
  return {
    base64: asset.base64,
    mimeType: asset.mimeType ?? 'image/jpeg',
    fileSize: asset.fileSize,
  };
}
