import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function respond(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return respond({ error: 'الطريقة غير مدعومة.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return respond({ error: 'إعداد الخادم غير مكتمل.' }, 500);
  }

  const authorization = request.headers.get('Authorization');
  if (!authorization) return respond({ error: 'يلزم تسجيل الدخول.' }, 401);

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: callerData, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !callerData.user) return respond({ error: 'جلسة الدخول غير صالحة.' }, 401);

  const { data: callerProfile, error: profileError } = await serviceClient
    .from('profiles')
    .select('role')
    .eq('id', callerData.user.id)
    .single();
  if (profileError || callerProfile?.role !== 'admin') {
    return respond({ error: 'إرسال تذكيرات الشيفت متاح للإدارة فقط.' }, 403);
  }

  const windowEnd = new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString();
  const { data: slots, error: slotsError } = await serviceClient
    .from('courier_shift_slots')
    .select('id')
    .eq('is_cancelled', false)
    .gt('starts_at', new Date().toISOString())
    .lte('starts_at', windowEnd);
  if (slotsError) return respond({ error: 'تعذر تحميل مواعيد الشفتات.' }, 500);
  if (!slots?.length) {
    return respond({ error: 'انشر مواعيد شفتات للأيام السبعة القادمة قبل إرسال التذكير.' }, 409);
  }

  const { data: bookings, error: bookingsError } = await serviceClient
    .from('courier_shift_bookings')
    .select('courier_id')
    .in('slot_id', slots.map((slot) => slot.id))
    .in('status', ['booked', 'swap_listed']);
  if (bookingsError) return respond({ error: 'تعذر تحميل حجوزات الشفتات.' }, 500);
  const bookedCourierIds = new Set((bookings ?? []).map((booking) => booking.courier_id));

  const { data: couriers, error: couriersError } = await serviceClient
    .from('couriers')
    .select('id, courier_push_tokens(expo_push_token)')
    .eq('is_active', true)
    .is('terminated_at', null);
  if (couriersError) return respond({ error: 'تعذر تحميل حسابات المندوبين.' }, 500);

  const messages: { to: string; title: string; body: string; data: { url: string } }[] = [];
  let skipped = 0;
  for (const courier of couriers ?? []) {
    if (bookedCourierIds.has(courier.id)) continue;
    const tokenRows = Array.isArray(courier.courier_push_tokens)
      ? courier.courier_push_tokens
      : [];
    const validTokens = tokenRows
      .map((token) => token.expo_push_token)
      .filter(
        (token): token is string =>
          typeof token === 'string' &&
          (token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken[')),
      );
    if (validTokens.length === 0) {
      skipped += 1;
      continue;
    }
    for (const token of validTokens) {
      messages.push({
        to: token,
        title: 'احجز شيفتك',
        body: 'لديك مواعيد شيفت متاحة للحجز خلال الأيام السبعة القادمة.',
        data: { url: '/(tabs)/my-shifts' },
      });
    }
  }

  let sent = 0;
  let failed = 0;
  for (let index = 0; index < messages.length; index += 100) {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages.slice(index, index + 100)),
    });
    if (!response.ok) {
      return respond({ error: 'تعذر إرسال تذكيرات الشيفت؛ حاول مرة أخرى.' }, 502);
    }
    const result = await response.json();
    const tickets = Array.isArray(result.data) ? result.data : [];
    sent += tickets.filter((ticket: { status?: string }) => ticket.status === 'ok').length;
    failed += tickets.filter((ticket: { status?: string }) => ticket.status !== 'ok').length;
  }

  return respond({ sent, skipped, failed });
});
