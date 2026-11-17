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
    return respond({ error: 'إدارة حسابات المندوبين متاحة للإدارة فقط.' }, 403);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return respond({ error: 'بيانات الطلب غير صالحة.' }, 400);
  }

  const courierId = payload.courierId;
  const isActive = payload.isActive;
  if (!Number.isSafeInteger(courierId) || typeof isActive !== 'boolean') {
    return respond({ error: 'رقم المندوب أو حالة الحساب غير صالحة.' }, 400);
  }

  const { data: courier, error: courierError } = await serviceClient
    .from('couriers')
    .select('user_id, is_active')
    .eq('id', courierId)
    .single();
  if (courierError || !courier) return respond({ error: 'حساب المندوب غير موجود.' }, 404);
  if (courier.is_active === isActive) return respond({ isActive });

  const authUpdate = await serviceClient.auth.admin.updateUserById(courier.user_id, {
    ban_duration: isActive ? 'none' : '876000h',
  });
  if (authUpdate.error) return respond({ error: 'تعذر تحديث حالة تسجيل الدخول للمندوب.' }, 500);

  const { error: accountError } = await callerClient.rpc('admin_set_courier_active', {
    p_courier_id: courierId,
    p_is_active: isActive,
  });
  if (accountError) {
    const rollback = await serviceClient.auth.admin.updateUserById(courier.user_id, {
      ban_duration: isActive ? '876000h' : 'none',
    });
    if (rollback.error) {
      return respond({
        error: `تعذر تحديث حالة الحساب (${accountError.message})، كما تعذر التراجع عن تغيير تسجيل الدخول.`,
      }, 500);
    }
    return respond({ error: accountError.message }, 409);
  }

  return respond({ isActive });
});
