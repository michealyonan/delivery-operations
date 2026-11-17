import { decode } from 'base64-arraybuffer';
import type { ImagePickerAsset } from 'expo-image-picker';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
import { isBackendConfigured, supabase } from '../lib/supabase';
import type {
  AppProfile,
  Courier,
  CourierLocation,
  CourierPrivateDetails,
  CourierProfileUpdateInput,
  DeliveryOrder,
  ManagedAccountType,
  NewCourierInput,
  NewOrderInput,
  NewRestaurantInput,
  NewSupportAgentInput,
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
  orders: DeliveryOrder[];
  couriers: Courier[];
  restaurants: Restaurant[];
  restaurantMenuItems: RestaurantMenuItem[];
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
  createOrder: (input: NewOrderInput) => Promise<void>;
  loadRestaurantMenu: () => Promise<void>;
  saveRestaurantMenuItem: (
    itemId: number | null,
    name: string,
    pricePiasters: number,
    isAvailable: boolean,
  ) => Promise<void>;
  createCourier: (input: NewCourierInput) => Promise<TemporaryCredentials>;
  createRestaurant: (input: NewRestaurantInput) => Promise<TemporaryCredentials>;
  setRestaurantDeliveryFee: (restaurantId: number, feePiasters: number) => Promise<void>;
  assignOrder: (orderId: string, courierId: number) => Promise<void>;
  acceptOrder: (orderId: string) => Promise<void>;
  advanceOrder: (orderId: string, status: 'picked_up' | 'delivered') => Promise<void>;
  recordCash: (orderId: string, collectedPiasters: number, paidPiasters: number) => Promise<void>;
  setShift: (active: boolean) => Promise<void>;
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
}

const AppContext = createContext<AppContextValue | null>(null);

const cloneDemoOrders = () => demoOrders.map((order) => ({ ...order }));

function assertBackend() {
  if (!supabase || !isBackendConfigured) {
    throw new Error('يلزم ربط قاعدة البيانات قبل حفظ بيانات حقيقية.');
  }
  return supabase;
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

function mapOrder(row: Record<string, unknown>): DeliveryOrder {
  return {
    id: String(row.id),
    code: String(row.order_code ?? row.id),
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
    restaurantDuePiasters: asNumber(row.restaurant_due_piasters),
    collectedPiasters:
      row.collected_piasters == null ? undefined : asNumber(row.collected_piasters),
    paidToRestaurantPiasters:
      row.paid_to_restaurant_piasters == null
        ? undefined
        : asNumber(row.paid_to_restaurant_piasters),
    status: row.status as OrderStatus,
    createdAt: String(row.created_at),
    acceptedAt: row.accepted_at == null ? undefined : String(row.accepted_at),
    deliveredAt: row.delivered_at == null ? undefined : String(row.delivered_at),
  };
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

export function AppProvider({ children }: PropsWithChildren) {
  const [profile, setProfile] = useState<AppProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [couriers, setCouriers] = useState<Courier[]>([]);
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
        .select('is_on_shift, break_until')
        .eq('courier_id', courier.id)
        .maybeSingle();
      if (presenceError) throw presenceError;
      return {
        ...base,
        courierId: asNumber(courier.id),
        courierCode: courier.courier_code,
        profilePhotoUrl,
        isOnShift: Boolean(presence?.is_on_shift),
        breakUntil: presence?.break_until ?? undefined,
        contractStartDate: courier.contract_start_date,
        contractEndDate: courier.contract_end_date,
        isTerminated: Boolean(courier.terminated_at),
      };
    }

    if (base.role === 'restaurant') {
      const { data: restaurant, error: restaurantError } = await client
        .from('restaurants')
        .select('id, address, latitude, longitude, delivery_fee_piasters')
        .eq('user_id', userId)
        .single();
      if (restaurantError) throw restaurantError;
      return {
        ...base,
        restaurantId: asNumber(restaurant.id),
        restaurantAddress: restaurant.address,
        deliveryFeePiasters: asNumber(restaurant.delivery_fee_piasters),
        restaurantLatitude:
          restaurant.latitude == null ? undefined : asNumber(restaurant.latitude),
        restaurantLongitude:
          restaurant.longitude == null ? undefined : asNumber(restaurant.longitude),
      };
    }

    return base;
  }, []);

  const refresh = useCallback(async () => {
    if (isDemo) {
      setOrders(cloneDemoOrders());
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
    let cashByOrder = new Map<string, { collected: number; paid: number }>();
    if (profile.role === 'admin' || profile.role === 'courier') {
      const { data: cashRows, error: cashError } = await supabase
        .from('order_cash')
        .select('order_id, collected_piasters, paid_to_restaurant_piasters');
      if (cashError) throw cashError;
      cashByOrder = new Map(
        (cashRows ?? []).map((item) => [
          item.order_id,
          {
            collected: asNumber(item.collected_piasters),
            paid: asNumber(item.paid_to_restaurant_piasters),
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
              }
            : {}),
        };
      }),
    );

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
      .select('id, courier_code, user_id, full_name, phone, email, is_active, contract_start_date, contract_end_date, terminated_at, courier_presence(is_on_shift, break_until)');
    if (couriersError) throw couriersError;
    setCouriers(
      (courierRows ?? []).map((item) => {
        const presence = Array.isArray(item.courier_presence)
          ? item.courier_presence[0]
          : item.courier_presence;
        return {
          id: asNumber(item.id),
          code: item.courier_code,
          fullName: item.full_name,
          phone: item.phone,
          email: item.email,
          isActive: item.is_active && !item.terminated_at,
          isOnShift: item.is_active && Boolean(presence?.is_on_shift),
          isOnBreak: Boolean(presence?.break_until && new Date(presence.break_until) > new Date()),
          breakUntil: presence?.break_until ?? undefined,
          contractStartDate: item.contract_start_date,
          contractEndDate: item.contract_end_date,
          isTerminated: Boolean(item.terminated_at),
        };
      }),
    );

    const { data: restaurantRows, error: restaurantsError } = await supabase
      .from('restaurants')
      .select('id, restaurant_code, name, email, phone, address, latitude, longitude, delivery_fee_piasters');
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
        deliveryFeePiasters: asNumber(item.delivery_fee_piasters),
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
      });
    if (profile.role === 'admin') {
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
      setProfile(nextProfile);
      return nextProfile.role;
    },
    [loadProfile],
  );

  const signInDemo = useCallback((role: UserRole) => {
    setIsDemo(true);
    setProfile(demoProfile(role));
    setOrders(cloneDemoOrders());
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
    setRestaurants(demoRestaurants.map((restaurant) => ({ ...restaurant })));
    setRestaurantMenuItems(demoRestaurantMenuItems.map((item) => ({ ...item })));
    setLocations([]);
    setDemoConversations(demoSupportConversations.map((conversation) => ({ ...conversation })));
    setDemoMessages(demoSupportMessages.map((message) => ({ ...message })));
  }, []);

  const signOut = useCallback(async () => {
    if (!isDemo && profile?.role === 'courier' && profile.courierId && supabase) {
      const { stopShiftLocationUpdates } = await import('../lib/location');
      await stopShiftLocationUpdates();
      const { error: shiftError } = await supabase.rpc('set_courier_shift', {
        p_active: false,
      });
      if (shiftError) throw shiftError;
    }
    if (!isDemo && supabase) {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) throw error;
    }
    setProfile(null);
    setIsDemo(false);
    setOrders([]);
    setCouriers([]);
    setRestaurants([]);
    setRestaurantMenuItems([]);
    setLocations([]);
  }, [isDemo, profile]);

  const loadRestaurantMenu = useCallback(async () => {
    if (!profile || profile.role !== 'restaurant' || !profile.restaurantId) {
      throw new Error('إدارة قائمة الأصناف متاحة لحساب المطعم فقط.');
    }
    if (isDemo) return;
    const { data, error } = await assertBackend()
      .from('restaurant_menu_items')
      .select('id, name, price_piasters, is_available')
      .eq('restaurant_id', profile.restaurantId)
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
      if (!profile || profile.role !== 'restaurant') {
        throw new Error('إنشاء الطلبات متاح لحسابات المطاعم فقط.');
      }
      if (isDemo) {
        const restaurant = demoRestaurants.find((item) => item.id === profile.restaurantId);
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
        const deliveryFeePiasters =
          profile.deliveryFeePiasters ?? restaurant?.deliveryFeePiasters ?? 0;
        setOrders((current) => [
          {
            id: `demo-order-${Date.now()}`,
            code: `DEMO-${Date.now().toString().slice(-5)}`,
            restaurantId: profile.restaurantId ?? 1,
            restaurantName: restaurant?.name ?? profile.name,
            restaurantAddress: profile.restaurantAddress ?? restaurant?.address ?? '',
            restaurantLatitude: profile.restaurantLatitude ?? restaurant?.latitude,
            restaurantLongitude: profile.restaurantLongitude ?? restaurant?.longitude,
            customerName: input.customerName,
            customerPhone: input.customerPhone,
            customerAddress: input.customerAddress,
            itemsText: selectedItems.map((item) => `${item.name} × ${item.quantity}`).join('\n'),
            lineItems: selectedItems,
            notes: input.notes,
            restaurantDuePiasters,
            amountDuePiasters: restaurantDuePiasters + deliveryFeePiasters,
            deliveryFeePiasters,
            status: 'pending',
            createdAt: new Date().toISOString(),
          },
          ...current,
        ]);
        return;
      }
      const client = assertBackend();
      const { data: order, error } = await client.rpc('submit_restaurant_order', {
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
    [isDemo, profile, restaurantMenuItems],
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

  const setRestaurantDeliveryFee = useCallback(
    async (restaurantId: number, feePiasters: number) => {
      if (!profile || profile.role !== 'admin') {
        throw new Error('تحديد رسوم التوصيل متاح للإدارة فقط.');
      }
      if (!Number.isSafeInteger(feePiasters) || feePiasters < 0) {
        throw new Error('أدخل رسوم توصيل صحيحة لا تقل عن صفر.');
      }
      if (isDemo) {
        setRestaurants((current) =>
          current.map((restaurant) =>
            restaurant.id === restaurantId
              ? { ...restaurant, deliveryFeePiasters: feePiasters }
              : restaurant,
          ),
        );
        return;
      }
      const { error } = await assertBackend().rpc('admin_set_restaurant_delivery_fee', {
        p_restaurant_id: restaurantId,
        p_delivery_fee_piasters: feePiasters,
      });
      if (error) throw error;
      await refresh();
    },
    [isDemo, profile, refresh],
  );

  const assignOrder = useCallback(
    async (orderId: string, courierId: number) => {
      if (!profile || profile.role !== 'admin') {
        throw new Error('إسناد الطلبات متاح للإدارة فقط.');
      }
      if (isDemo) {
        const courier = couriers.find((item) => item.id === courierId);
        if (
          !courier?.isActive ||
          !courier.isOnShift ||
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
        setOrders((current) =>
          current.map((order) =>
            order.id === orderId
              ? {
                  ...order,
                  courierId,
                  courierName: courier.fullName,
                  courierPhone: courier.phone,
                  status: 'assigned',
                  acceptedAt: undefined,
                }
                : order,
          ),
        );
        return;
      }
      const client = assertBackend();
      const { error } = await client.rpc('admin_assign_order', {
        p_order_id: orderId,
        p_courier_id: courierId,
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
      if (typeof data?.error === 'string') throw new Error(data.error);
      await refresh();
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
        setProfile({ ...profile, breakUntil });
        return breakUntil;
      }
      const { data, error } = await assertBackend().rpc('request_courier_break', {
        p_duration_minutes: durationMinutes,
      });
      if (error) throw error;
      if (typeof data !== 'string') {
        throw new Error('لم يرجع الخادم موعد انتهاء البريك.');
      }
      setProfile({ ...profile, breakUntil: data });
      return data;
    },
    [breakRequestsEnabled, isDemo, profile],
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
              ? { ...item, isActive: false, isOnShift: false, isTerminated: true, isOnBreak: false, breakUntil: undefined }
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
      if (
        !data ||
        typeof data.id !== 'number' ||
        typeof data.code !== 'string' ||
        typeof data.fullName !== 'string' ||
        typeof data.email !== 'string' ||
        typeof data.phone !== 'string' ||
        typeof data.nationalId !== 'string' ||
        typeof data.address !== 'string' ||
        typeof data.idCardUrl !== 'string' ||
        (data.selfieUrl != null && typeof data.selfieUrl !== 'string') ||
        typeof data.isActive !== 'boolean' ||
        typeof data.isOnShift !== 'boolean' ||
        typeof data.contractStartDate !== 'string' ||
        typeof data.contractEndDate !== 'string' ||
        (data.breakUntil != null && typeof data.breakUntil !== 'string') ||
        (data.terminatedAt != null && typeof data.terminatedAt !== 'string')
      ) {
        throw new Error('بيانات هوية المندوب غير مكتملة.');
      }
      return {
        id: data.id,
        code: data.code,
        fullName: data.fullName,
        email: data.email,
        phone: data.phone,
        nationalId: data.nationalId,
        address: data.address,
        idCardUrl: data.idCardUrl,
        ...(data.selfieUrl ? { selfieUrl: data.selfieUrl } : {}),
        isActive: data.isActive,
        isOnShift: data.isOnShift,
        ...(data.breakUntil ? { breakUntil: data.breakUntil } : {}),
        contractStartDate: data.contractStartDate,
        contractEndDate: data.contractEndDate,
        ...(data.terminatedAt ? { terminatedAt: data.terminatedAt } : {}),
      } satisfies CourierPrivateDetails;
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
        setOrders((current) =>
          current.map((order) =>
            order.id === orderId
              ? { ...order, status: 'accepted', acceptedAt: new Date().toISOString() }
              : order,
          ),
        );
        return;
      }
      const { error } = await assertBackend().rpc('accept_order', { p_order_id: orderId });
      if (error) throw error;
      await refresh();
    },
    [isDemo, refresh],
  );

  const advanceOrder = useCallback(
    async (orderId: string, status: 'picked_up' | 'delivered') => {
      if (isDemo) {
        setOrders((current) =>
          current.map((order) =>
            order.id === orderId
              ? {
                  ...order,
                  status,
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
    [isDemo, refresh],
  );

  const recordCash = useCallback(
    async (orderId: string, collectedPiasters: number, paidPiasters: number) => {
      if (isDemo) {
        setOrders((current) =>
          current.map((order) =>
            order.id === orderId
              ? {
                  ...order,
                  collectedPiasters,
                  paidToRestaurantPiasters: paidPiasters,
                }
              : order,
          ),
        );
        return;
      }
      const { error } = await assertBackend().rpc('record_order_cash', {
        p_order_id: orderId,
        p_collected_piasters: collectedPiasters,
        p_paid_piasters: paidPiasters,
      });
      if (error) throw error;
      await refresh();
    },
    [isDemo, refresh],
  );

  const setShift = useCallback(
    async (active: boolean) => {
      if (!profile || profile.role !== 'courier' || !profile.courierId) {
        throw new Error('تغيير حالة الشيفت متاح لحساب المندوب فقط.');
      }
      if (isDemo) {
        const nextProfile = { ...profile, isOnShift: active };
        setProfile(nextProfile);
        setCouriers((current) =>
          current.map((courier) =>
            courier.id === profile.courierId ? { ...courier, isOnShift: active } : courier,
          ),
        );
        return;
      }

      const client = assertBackend();
      const {
        requestShiftLocationPermissions,
        startShiftLocationUpdates,
        stopShiftLocationUpdates,
      } = await import('../lib/location');
      if (active) await requestShiftLocationPermissions();
      if (!active) await stopShiftLocationUpdates();
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
          if (rollbackError) {
            throw new Error(
              `تعذر بدء مشاركة الموقع (${String(locationError)}) كما تعذر إيقاف الشيفت على الخادم (${rollbackError.message}).`,
            );
          }
          throw locationError;
        }
      }
      setProfile({
        ...profile,
        isOnShift: active,
        breakUntil: active ? profile.breakUntil : undefined,
      });
      await refresh();
    },
    [isDemo, profile, refresh],
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

  const contextValue = useMemo<AppContextValue>(
    () => ({
      profile,
      isLoading,
      isDemo,
      orders,
      couriers,
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
      createOrder,
      loadRestaurantMenu,
      saveRestaurantMenuItem,
      createCourier,
      createRestaurant,
      setRestaurantDeliveryFee,
      assignOrder,
      acceptOrder,
      advanceOrder,
      recordCash,
      setShift,
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
    }),
    [
      profile,
      isLoading,
      isDemo,
      orders,
      couriers,
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
      createOrder,
      loadRestaurantMenu,
      saveRestaurantMenuItem,
      createCourier,
      createRestaurant,
      setRestaurantDeliveryFee,
      assignOrder,
      acceptOrder,
      advanceOrder,
      recordCash,
      setShift,
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
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('اكتب مبلغًا صحيحًا أكبر من أو يساوي صفر.');
  }
  return Math.round(amount * 100);
}

export function toImagePickerInput(asset: ImagePickerAsset) {
  if (!asset.base64) throw new Error('تعذر قراءة صورة البطاقة؛ اختر الصورة مرة أخرى.');
  return {
    base64: asset.base64,
    mimeType: asset.mimeType ?? 'image/jpeg',
    fileSize: asset.fileSize,
  };
}
