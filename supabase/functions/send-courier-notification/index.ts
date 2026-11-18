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

  const { data: callerProfile, error: profileError } = await callerClient
    .from('profiles')
    .select('role')
    .eq('id', callerData.user.id)
    .maybeSingle();
  if (profileError) {
    console.error('تعذر التحقق من دور مرسل الإشعار:', profileError.code);
    return respond({ error: 'تعذر التحقق من الصلاحيات.' }, 500);
  }
  if (callerProfile?.role !== 'admin') {
    return respond({ error: 'إرسال إشعارات المندوبين متاح للإدارة فقط.' }, 403);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return respond({ error: 'بيانات الطلب غير صالحة.' }, 400);
  }
  const notificationId = payload.notificationId;
  if (
    typeof notificationId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      notificationId,
    )
  ) {
    return respond({ error: 'رقم الإشعار غير صالح.' }, 400);
  }

  const { data: notification, error: notificationError } = await serviceClient
    .from('courier_notifications')
    .select('id, title, body, created_by')
    .eq('id', notificationId)
    .eq('created_by', callerData.user.id)
    .maybeSingle();
  if (notificationError) {
    console.error('تعذر تحميل الإشعار لإرساله:', notificationError.code);
    return respond({ error: 'تعذر تحميل الإشعار.' }, 500);
  }
  if (!notification) return respond({ error: 'الإشعار غير موجود.' }, 404);

  const { data: recipientRows, error: recipientsError } = await serviceClient
    .from('courier_notification_recipients')
    .select('courier_id')
    .eq('notification_id', notification.id);
  if (recipientsError) {
    console.error('تعذر تحميل مستلمي الإشعار:', recipientsError.code);
    return respond({ error: 'تعذر تحميل مستلمي الإشعار.' }, 500);
  }
  const courierIds = [...new Set((recipientRows ?? []).map((row) => Number(row.courier_id)))];
  if (courierIds.length === 0) return respond({ sent: 0, failed: 0, skipped: 0 });

  const { data: tokenRows, error: tokensError } = await serviceClient
    .from('courier_push_tokens')
    .select('courier_id, expo_push_token')
    .in('courier_id', courierIds);
  if (tokensError) {
    console.error('تعذر تحميل رموز إشعارات المندوبين:', tokensError.code);
    return respond({ error: 'تعذر تحميل أجهزة استلام الإشعار.' }, 500);
  }
  const tokens = (tokenRows ?? []).filter(
    (row) => typeof row.expo_push_token === 'string' && row.expo_push_token.length > 0,
  );
  const couriersWithToken = new Set(tokens.map((row) => Number(row.courier_id)));
  const skipped = courierIds.filter((courierId) => !couriersWithToken.has(courierId)).length;
  let sent = 0;
  let failed = 0;

  for (let offset = 0; offset < tokens.length; offset += 100) {
    const batch = tokens.slice(offset, offset + 100);
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(
        batch.map((row) => ({
          to: row.expo_push_token,
          title: notification.title,
          body: notification.body || 'تم إرسال صورة جديدة من الإدارة.',
          sound: 'default',
          data: {
            url: '/(tabs)/notifications',
            notificationId: notification.id,
          },
        })),
      ),
    });
    if (!response.ok) {
      console.error('فشل اتصال خدمة إشعارات Expo:', response.status);
      return respond({ error: 'تعذر الاتصال بخدمة إشعارات الهاتف.' }, 502);
    }

    const result = (await response.json()) as {
      data?: Array<{ status?: string; details?: { error?: string } }>;
    };
    if (!Array.isArray(result.data) || result.data.length !== batch.length) {
      console.error('استجابة خدمة إشعارات Expo غير مكتملة.');
      return respond({ error: 'وصلت استجابة غير مكتملة من خدمة إشعارات الهاتف.' }, 502);
    }
    for (const ticket of result.data) {
      if (ticket.status === 'ok') {
        sent += 1;
      } else {
        failed += 1;
        console.error('تعذر تسليم إشعار إلى جهاز:', ticket.details?.error ?? 'unknown');
      }
    }
  }

  return respond({ sent, failed, skipped });
});
