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

import { demoCouriers, demoOrders, demoProfile, demoRestaurants } from '../lib/demo-data';
import { isBackendConfigured, supabase } from '../lib/supabase';
import type {
  AppProfile,
  Courier,
  CourierLocation,
  DeliveryOrder,
  NewCourierInput,
  NewOrderInput,
  NewRestaurantInput,
  OrderStatus,
  Restaurant,
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
  locations: CourierLocation[];
  signIn: (email: string, password: string) => Promise<void>;
  signInDemo: (role: UserRole) => void;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  createOrder: (input: NewOrderInput) => Promise<void>;
  createCourier: (input: NewCourierInput) => Promise<TemporaryCredentials>;
  createRestaurant: (input: NewRestaurantInput) => Promise<TemporaryCredentials>;
  assignOrder: (orderId: string, courierId: number) => Promise<void>;
  acceptOrder: (orderId: string) => Promise<void>;
  advanceOrder: (orderId: string, status: 'picked_up' | 'delivered') => Promise<void>;
  recordCash: (orderId: string, collectedPiasters: number, paidPiasters: number) => Promise<void>;
  setShift: (active: boolean) => Promise<void>;
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

export function AppProvider({ children }: PropsWithChildren) {
  const [profile, setProfile] = useState<AppProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [locations, setLocations] = useState<CourierLocation[]>([]);

  const loadProfile = useCallback(async (userId: string): Promise<AppProfile> => {
    const client = assertBackend();
    const { data: record, error } = await client
      .from('profiles')
      .select('id, role, full_name, email, phone')
      .eq('id', userId)
      .single();
    if (error) throw error;
    if (!record || !['admin', 'restaurant', 'courier'].includes(record.role)) {
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
        .select('id, courier_code')
        .eq('user_id', userId)
        .single();
      if (courierError) throw courierError;
      const { data: presence, error: presenceError } = await client
        .from('courier_presence')
        .select('is_on_shift')
        .eq('courier_id', courier.id)
        .maybeSingle();
      if (presenceError) throw presenceError;
      return {
        ...base,
        courierId: asNumber(courier.id),
        courierCode: courier.courier_code,
        isOnShift: Boolean(presence?.is_on_shift),
      };
    }

    if (base.role === 'restaurant') {
      const { data: restaurant, error: restaurantError } = await client
        .from('restaurants')
        .select('id, address, latitude, longitude')
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
      };
    }

    return base;
  }, []);

  const refresh = useCallback(async () => {
    if (isDemo) {
      setOrders(cloneDemoOrders());
      setCouriers(demoCouriers.map((courier) => ({ ...courier })));
      setRestaurants(demoRestaurants.map((restaurant) => ({ ...restaurant })));
      return;
    }
    if (!profile || !supabase) return;

    const { data: orderRows, error: ordersError } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });
    if (ordersError) throw ordersError;
    let cashByOrder = new Map<string, { collected: number; paid: number }>();
    if (profile.role !== 'restaurant') {
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
        return cash
          ? {
              ...order,
              collectedPiasters: cash.collected,
              paidToRestaurantPiasters: cash.paid,
            }
          : order;
      }),
    );

    if (profile.role !== 'admin') return;

    const { data: courierRows, error: couriersError } = await supabase
      .from('couriers')
      .select('id, courier_code, user_id, full_name, phone, email, courier_presence(is_on_shift)');
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
          isOnShift: Boolean(presence?.is_on_shift),
        };
      }),
    );

    const { data: restaurantRows, error: restaurantsError } = await supabase
      .from('restaurants')
      .select('id, restaurant_code, name, email, phone, address, latitude, longitude');
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
    },
    [loadProfile],
  );

  const signInDemo = useCallback((role: UserRole) => {
    setIsDemo(true);
    setProfile(demoProfile(role));
    setOrders(cloneDemoOrders());
    setCouriers(demoCouriers.map((courier) => ({ ...courier })));
    setRestaurants(demoRestaurants.map((restaurant) => ({ ...restaurant })));
    setLocations([]);
  }, []);

  const signOut = useCallback(async () => {
    if (!isDemo && profile?.role === 'courier' && profile.courierId && supabase) {
      const { stopShiftLocationUpdates } = await import('../lib/location');
      await stopShiftLocationUpdates();
      const { error: shiftError } = await supabase.from('courier_presence').upsert({
        courier_id: profile.courierId,
        is_on_shift: false,
        updated_at: new Date().toISOString(),
      });
      if (shiftError) throw shiftError;
    }
    if (!isDemo && supabase) {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    }
    setProfile(null);
    setIsDemo(false);
    setOrders([]);
    setCouriers([]);
    setRestaurants([]);
    setLocations([]);
  }, [isDemo, profile]);

  const createOrder = useCallback(
    async (input: NewOrderInput) => {
      if (!profile || profile.role !== 'restaurant') {
        throw new Error('إنشاء الطلبات متاح لحسابات المطاعم فقط.');
      }
      if (isDemo) {
        const restaurant = demoRestaurants.find((item) => item.id === profile.restaurantId);
        setOrders((current) => [
          {
            id: `demo-order-${Date.now()}`,
            code: `DEMO-${Date.now().toString().slice(-5)}`,
            restaurantId: profile.restaurantId ?? 1,
            restaurantName: restaurant?.name ?? profile.name,
            restaurantAddress: profile.restaurantAddress ?? restaurant?.address ?? '',
            restaurantLatitude: profile.restaurantLatitude ?? restaurant?.latitude,
            restaurantLongitude: profile.restaurantLongitude ?? restaurant?.longitude,
            ...input,
            status: 'pending',
            createdAt: new Date().toISOString(),
          },
          ...current,
        ]);
        return;
      }
      const client = assertBackend();
      const { error } = await client.from('orders').insert({
        restaurant_id: profile.restaurantId,
        customer_name: input.customerName,
        customer_phone: input.customerPhone,
        customer_address: input.customerAddress,
        items_text: input.itemsText,
        notes: input.notes,
        amount_due_piasters: input.amountDuePiasters,
        restaurant_due_piasters: input.restaurantDuePiasters,
      });
      if (error) throw error;
      await refresh();
    },
    [isDemo, profile, refresh],
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

      const extension = input.idCard.mimeType.includes('png') ? 'png' : 'jpg';
      const path = `${profile.id}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
      const { error: uploadError } = await client.storage
        .from('courier-id-cards')
        .upload(path, decode(input.idCard.base64), {
          contentType: input.idCard.mimeType,
          upsert: false,
        });
      if (uploadError) throw uploadError;

      const { data, error } = await client.functions.invoke('admin-create-account', {
        body: {
          role: 'courier',
          email: input.email.trim(),
          fullName: input.fullName.trim(),
          phone: input.phone.trim(),
          nationalId: input.nationalId.trim(),
          address: input.address.trim(),
          idCardPath: path,
        },
      });
      if (error || !data?.code || !data?.temporaryPassword) {
        const { error: cleanupError } = await client.storage
          .from('courier-id-cards')
          .remove([path]);
        const reason = error?.message ?? 'لم يرجع الخادم بيانات الحساب.';
        if (cleanupError) {
          throw new Error(`${reason} وتعذر حذف صورة البطاقة المؤقتة؛ راجع التخزين الخاص.`);
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
        throw new Error(error?.message ?? 'لم يرجع الخادم بيانات الحساب.');
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

  const assignOrder = useCallback(
    async (orderId: string, courierId: number) => {
      if (isDemo) {
        const courier = demoCouriers.find((item) => item.id === courierId);
        setOrders((current) =>
          current.map((order) =>
            order.id === orderId
              ? {
                  ...order,
                  courierId,
                  courierName: courier?.fullName,
                  courierPhone: courier?.phone,
                  status: 'assigned',
                }
              : order,
          ),
        );
        return;
      }
      const client = assertBackend();
      const { error } = await client
        .from('orders')
        .update({ courier_id: courierId, status: 'assigned', assigned_at: new Date().toISOString() })
        .eq('id', orderId)
        .eq('status', 'pending');
      if (error) throw error;
      await refresh();
    },
    [isDemo, refresh],
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
      const { error } = await client.from('courier_presence').upsert({
        courier_id: profile.courierId,
        is_on_shift: active,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      if (active) {
        try {
          await startShiftLocationUpdates(profile.courierId);
        } catch (locationError) {
          const { error: rollbackError } = await client
            .from('courier_presence')
            .update({ is_on_shift: false })
            .eq('courier_id', profile.courierId);
          if (rollbackError) {
            throw new Error(
              `تعذر بدء مشاركة الموقع (${String(locationError)}) كما تعذر إيقاف الشيفت على الخادم (${rollbackError.message}).`,
            );
          }
          throw locationError;
        }
      }
      setProfile({ ...profile, isOnShift: active });
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
      locations,
      signIn,
      signInDemo,
      signOut,
      refresh,
      createOrder,
      createCourier,
      createRestaurant,
      assignOrder,
      acceptOrder,
      advanceOrder,
      recordCash,
      setShift,
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
      locations,
      signIn,
      signInDemo,
      signOut,
      refresh,
      createOrder,
      createCourier,
      createRestaurant,
      assignOrder,
      acceptOrder,
      advanceOrder,
      recordCash,
      setShift,
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
