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

function makeTemporaryPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const random = crypto.getRandomValues(new Uint8Array(28));
  return Array.from(random, (value) => alphabet[value % alphabet.length]).join('');
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

  const { data: callerProfile, error: profileError } = await callerClient
    .from('profiles')
    .select('role')
    .eq('id', callerData.user.id)
    .maybeSingle();
  if (profileError) {
    console.error('تعذر التحقق من دور مدير الحسابات:', profileError.code);
    return respond({ error: 'تعذر التحقق من صلاحيات الحساب. حاول مرة أخرى.' }, 500);
  }
  if (callerProfile?.role !== 'admin') {
    return respond({ error: 'إنشاء الحسابات متاح للإدارة فقط.' }, 403);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return respond({ error: 'بيانات الطلب غير صالحة.' }, 400);
  }

  const role = payload.role;
  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
  const fullName = typeof payload.fullName === 'string' ? payload.fullName.trim() : '';
  const phone = typeof payload.phone === 'string' ? payload.phone.trim() : '';
  const address = typeof payload.address === 'string' ? payload.address.trim() : '';
  if (role !== 'courier' && role !== 'restaurant' && role !== 'support') {
    return respond({ error: 'نوع الحساب غير مدعوم.' }, 400);
  }
  if (
    !email ||
    !email.includes('@') ||
    !fullName ||
    (role !== 'support' && !address) ||
    !/^[+\d][\d\s-]{7,16}$/.test(phone)
  ) {
    return respond({ error: 'راجع البريد والاسم والعنوان ورقم التليفون.' }, 400);
  }

  let nationalId = '';
  let idCardPath = '';
  let selfiePath = '';
  if (role === 'courier') {
    nationalId = typeof payload.nationalId === 'string' ? payload.nationalId.trim() : '';
    idCardPath = typeof payload.idCardPath === 'string' ? payload.idCardPath.trim() : '';
    selfiePath = typeof payload.selfiePath === 'string' ? payload.selfiePath.trim() : '';
    if (fullName.split(/\s+/).length < 4) {
      return respond({ error: 'اكتب الاسم الرباعي للمندوب.' }, 400);
    }
    if (!/^[0-9]{14}$/.test(nationalId)) {
      return respond({ error: 'الرقم القومي يجب أن يتكون من 14 رقمًا.' }, 400);
    }
    if (!idCardPath.startsWith(`${callerData.user.id}/`) || idCardPath.includes('..')) {
      return respond({ error: 'مسار صورة البطاقة غير صالح.' }, 400);
    }
    if (!selfiePath.startsWith(`${callerData.user.id}/`) || selfiePath.includes('..')) {
      return respond({ error: 'مسار صورة السيلفي غير صالح.' }, 400);
    }
    const { error: cardError } = await serviceClient.storage
      .from('courier-id-cards')
      .createSignedUrl(idCardPath, 1);
    if (cardError) return respond({ error: 'تعذر التحقق من صورة البطاقة الخاصة.' }, 400);
    const { error: selfieError } = await serviceClient.storage
      .from('courier-profile-photos')
      .createSignedUrl(selfiePath, 1);
    if (selfieError) return respond({ error: 'تعذر التحقق من صورة السيلفي الخاصة.' }, 400);
  }

  const temporaryPassword = makeTemporaryPassword();
  const { data: created, error: createError } = await serviceClient.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
  });
  if (createError || !created.user) {
    return respond({
      error: createError?.message.toLowerCase().includes('already')
        ? 'هذا البريد مستخدم بالفعل.'
        : 'تعذر إنشاء حساب الدخول.',
    }, createError?.message.toLowerCase().includes('already') ? 409 : 400);
  }

  let accountCode = '';
  let accountError: string | null = null;
  const profileInsert = await serviceClient.from('profiles').insert({
    id: created.user.id,
    role,
    full_name: fullName,
    email,
    phone,
    profile_photo_path: role === 'courier' ? selfiePath : null,
  });
  if (profileInsert.error) {
    accountError = 'تعذر حفظ ملف الحساب.';
  } else if (role === 'courier') {
    const courierInsert = await serviceClient
      .from('couriers')
      .insert({
        user_id: created.user.id,
        full_name: fullName,
        phone,
        email,
      })
      .select('id, courier_code')
      .single();
    if (courierInsert.error || !courierInsert.data) {
      accountError = 'تعذر حفظ ملف المندوب.';
    } else {
      accountCode = courierInsert.data.courier_code;
      const presenceInsert = await serviceClient.from('courier_presence').insert({
        courier_id: courierInsert.data.id,
        is_on_shift: false,
      });
      const privateInsert = await serviceClient.from('courier_private_details').insert({
        courier_id: courierInsert.data.id,
        national_id: nationalId,
        address,
        id_card_path: idCardPath,
      });
      if (presenceInsert.error || privateInsert.error) {
        accountError = 'تعذر حفظ بيانات المندوب الخاصة.';
      }
    }
  } else if (role === 'restaurant') {
    const restaurantInsert = await serviceClient
      .from('restaurants')
      .insert({
        user_id: created.user.id,
        name: fullName,
        email,
        phone,
        address,
      })
      .select('id, restaurant_code')
      .single();
    if (restaurantInsert.error || !restaurantInsert.data) {
      accountError = 'تعذر حفظ ملف المطعم.';
    } else {
      accountCode = restaurantInsert.data.restaurant_code;
    }
  } else {
    accountCode = `SUP-${created.user.id.slice(0, 8).toUpperCase()}`;
  }

  if (accountError) {
    const cleanupErrors: string[] = [];
    if (role === 'courier') {
      const { error: removeCardError } = await serviceClient.storage
        .from('courier-id-cards')
        .remove([idCardPath]);
      if (removeCardError) cleanupErrors.push('تعذر حذف صورة البطاقة المؤقتة.');
      const { error: removeSelfieError } = await serviceClient.storage
        .from('courier-profile-photos')
        .remove([selfiePath]);
      if (removeSelfieError) cleanupErrors.push('تعذر حذف صورة السيلفي المؤقتة.');
    }
    const { error: deleteUserError } = await serviceClient.auth.admin.deleteUser(created.user.id);
    if (deleteUserError) {
      cleanupErrors.push('تعذر تنظيف حساب الدخول الجزئي.');
    }
    return respond({
      error: cleanupErrors.length ? `${accountError} ${cleanupErrors.join(' ')}` : accountError,
    }, 500);
  }

  return respond({ code: accountCode, email, temporaryPassword });
});
