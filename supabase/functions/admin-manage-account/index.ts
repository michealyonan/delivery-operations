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
    return respond({ error: 'إدارة الحسابات متاحة للإدارة فقط.' }, 403);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return respond({ error: 'بيانات الطلب غير صالحة.' }, 400);
  }

  const action = payload.action;
  const accountType = payload.accountType;
  const accountId = payload.accountId;

  if (action === 'update-courier' || action === 'terminate-courier') {
    if (!Number.isSafeInteger(accountId) || Number(accountId) < 1) {
      return respond({ error: 'رقم حساب المندوب غير صالح.' }, 400);
    }

    const courierId = Number(accountId);
    const { data: courier, error: courierError } = await serviceClient
      .from('couriers')
      .select('user_id, terminated_at')
      .eq('id', courierId)
      .maybeSingle();
    if (courierError) {
      console.error('تعذر تحميل حساب المندوب:', courierError.code);
      return respond({ error: 'تعذر تحميل حساب المندوب. حاول مرة أخرى.' }, 500);
    }
    if (!courier?.user_id) return respond({ error: 'حساب المندوب غير موجود.' }, 404);
    if (courier.terminated_at) {
      return respond({ error: 'لا يمكن تعديل حساب تم إيقافه نهائيًا.' }, 409);
    }

    if (action === 'terminate-courier') {
      const { data: targetAuth, error: targetAuthError } =
        await serviceClient.auth.admin.getUserById(courier.user_id);
      if (targetAuthError || !targetAuth.user) {
        console.error('تعذر تحميل جلسة المندوب لإيقافها:', targetAuthError?.code);
        return respond({ error: 'تعذر إيقاف دخول المندوب. حاول مرة أخرى.' }, 500);
      }

      const oldBannedUntil = targetAuth.user.banned_until;
      const { error: banError } = await serviceClient.auth.admin.updateUserById(courier.user_id, {
        ban_duration: '876000h',
      });
      if (banError) {
        console.error('تعذر منع دخول المندوب:', banError.code);
        return respond({ error: 'تعذر إيقاف دخول المندوب. حاول مرة أخرى.' }, 500);
      }

      const { error: terminateError } = await callerClient.rpc('admin_terminate_courier', {
        p_courier_id: courierId,
      });
      if (terminateError) {
        const remainingHours = oldBannedUntil
          ? Math.ceil((new Date(oldBannedUntil).getTime() - Date.now()) / 3_600_000)
          : 0;
        const { error: rollbackError } = await serviceClient.auth.admin.updateUserById(
          courier.user_id,
          { ban_duration: remainingHours > 0 ? `${remainingHours}h` : 'none' },
        );
        if (rollbackError) {
          console.error('تعذر استرجاع حالة دخول المندوب بعد فشل الإيقاف:', rollbackError.code);
          return respond({
            error: 'فشل الإيقاف النهائي وتعذر استرجاع حالة تسجيل الدخول؛ راجع حساب المندوب فورًا.',
          }, 500);
        }
        return respond({ error: terminateError.message }, 400);
      }
      return respond({ success: true });
    }

    const textFields = ['fullName', 'email', 'phone', 'nationalId', 'address'] as const;
    if (textFields.some((field) => typeof payload[field] !== 'string')) {
      return respond({ error: 'أكمل بيانات المندوب المطلوبة.' }, 400);
    }
    const fullName = (payload.fullName as string).trim();
    const email = (payload.email as string).trim().toLowerCase();
    const phone = (payload.phone as string).trim();
    const nationalId = (payload.nationalId as string).trim();
    const address = (payload.address as string).trim();
    const idCardPath = payload.idCardPath;
    const selfiePath = payload.selfiePath;
    if (
      (idCardPath !== undefined &&
        (typeof idCardPath !== 'string' || !idCardPath.startsWith(`${callerData.user.id}/`))) ||
      (selfiePath !== undefined &&
        (typeof selfiePath !== 'string' || !selfiePath.startsWith(`${callerData.user.id}/`)))
    ) {
      return respond({ error: 'مسار صورة المندوب غير صالح.' }, 400);
    }
    if (
      fullName.split(/\s+/).filter(Boolean).length < 4 ||
      !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ||
      !/^[+0-9][0-9 +()-]{7,16}$/.test(phone) ||
      !/^[0-9]{14}$/.test(nationalId) ||
      address.length < 3
    ) {
      return respond({ error: 'راجع الاسم الرباعي والبريد والهاتف والرقم القومي والعنوان.' }, 400);
    }

    const [{ data: targetAuth, error: targetAuthError }, { data: details, error: detailsError },
      { data: targetProfile, error: targetProfileError }] = await Promise.all([
      serviceClient.auth.admin.getUserById(courier.user_id),
      serviceClient
        .from('courier_private_details')
        .select('id_card_path')
        .eq('courier_id', courierId)
        .maybeSingle(),
      serviceClient
        .from('profiles')
        .select('profile_photo_path')
        .eq('id', courier.user_id)
        .maybeSingle(),
    ]);
    if (targetAuthError || !targetAuth.user || detailsError || targetProfileError || !targetProfile) {
      console.error(
        'تعذر تحميل البيانات الحالية لتعديل المندوب:',
        targetAuthError?.code ?? detailsError?.code ?? targetProfileError?.code,
      );
      return respond({ error: 'تعذر تحميل ملف المندوب. حاول مرة أخرى.' }, 500);
    }
    if (!details && typeof idCardPath !== 'string') {
      return respond({ error: 'ارفع صورة بطاقة المندوب لإكمال الملف.' }, 400);
    }

    const oldEmail = targetAuth.user.email;
    const emailChanged = oldEmail?.toLowerCase() !== email;
    if (emailChanged) {
      const { error: emailError } = await serviceClient.auth.admin.updateUserById(courier.user_id, {
        email,
        email_confirm: true,
      });
      if (emailError) {
        console.error('تعذر تحديث بريد المندوب:', emailError.code);
        return respond({ error: 'تعذر تحديث البريد الإلكتروني؛ تحقق من أنه غير مستخدم.' }, 400);
      }
    }

    const { error: updateError } = await callerClient.rpc('admin_update_courier_profile', {
      p_courier_id: courierId,
      p_full_name: fullName,
      p_email: email,
      p_phone: phone,
      p_national_id: nationalId,
      p_address: address,
      p_id_card_path: typeof idCardPath === 'string' ? idCardPath : null,
      p_selfie_path: typeof selfiePath === 'string' ? selfiePath : null,
    });
    if (updateError) {
      if (emailChanged && oldEmail) {
        const { error: rollbackError } = await serviceClient.auth.admin.updateUserById(
          courier.user_id,
          { email: oldEmail, email_confirm: true },
        );
        if (rollbackError) {
          console.error('تعذر استرجاع بريد المندوب بعد فشل حفظ الملف:', rollbackError.code);
          return respond({
            error: 'فشل حفظ الملف وتعذر استرجاع البريد السابق؛ راجع بيانات المندوب فورًا.',
          }, 500);
        }
      }
      return respond({ error: updateError.message }, 400);
    }

    const cleanup: Promise<{ error: { message: string } | null }>[] = [];
    if (
      typeof idCardPath === 'string' &&
      details?.id_card_path &&
      details.id_card_path !== idCardPath
    ) {
      cleanup.push(
        serviceClient.storage.from('courier-id-cards').remove([details.id_card_path]),
      );
    }
    if (
      typeof selfiePath === 'string' &&
      targetProfile.profile_photo_path &&
      targetProfile.profile_photo_path !== selfiePath
    ) {
      cleanup.push(
        serviceClient.storage
          .from('courier-profile-photos')
          .remove([targetProfile.profile_photo_path]),
      );
    }
    const cleanupResults = await Promise.all(cleanup);
    if (cleanupResults.some((result) => result.error)) {
      console.error('تم حفظ الملف لكن تعذر حذف صورة قديمة من التخزين الخاص.');
      return respond({
        success: true,
        cleanupWarning: 'تم حفظ البيانات، لكن تعذر حذف صورة قديمة من التخزين الخاص.',
      });
    }
    return respond({ success: true });
  }

  if (
    (accountType !== 'courier' && accountType !== 'restaurant' && accountType !== 'support') ||
    (action !== 'set-password' && action !== 'get-courier-details')
  ) {
    return respond({ error: 'نوع الحساب أو العملية غير مدعوم.' }, 400);
  }
  if (action === 'get-courier-details' && accountType !== 'courier') {
    return respond({ error: 'بيانات الهوية متاحة لحسابات المندوبين فقط.' }, 400);
  }

  let userId: string | null = null;
  if (accountType === 'courier' || accountType === 'restaurant') {
    if (!Number.isSafeInteger(accountId) || Number(accountId) < 1) {
      return respond({ error: 'رقم الحساب غير صالح.' }, 400);
    }
    const table = accountType === 'courier' ? 'couriers' : 'restaurants';
    const { data: account, error: accountError } = await serviceClient
      .from(table)
      .select('user_id')
      .eq('id', accountId)
      .maybeSingle();
    if (accountError) {
      console.error('تعذر تحميل الحساب لإدارته:', accountError.code);
      return respond({ error: 'تعذر تحميل الحساب. حاول مرة أخرى.' }, 500);
    }
    userId = account?.user_id ?? null;
  } else {
    if (
      typeof accountId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(accountId)
    ) {
      return respond({ error: 'رقم حساب موظف الدعم غير صالح.' }, 400);
    }
    const { data: account, error: accountError } = await serviceClient
      .from('profiles')
      .select('id')
      .eq('id', accountId)
      .eq('role', 'support')
      .maybeSingle();
    if (accountError) {
      console.error('تعذر تحميل حساب موظف الدعم:', accountError.code);
      return respond({ error: 'تعذر تحميل الحساب. حاول مرة أخرى.' }, 500);
    }
    userId = account?.id ?? null;
  }
  if (!userId) return respond({ error: 'الحساب غير موجود.' }, 404);
  if (action === 'set-password') {
    const suppliedPassword = payload.password;
    if (
      suppliedPassword !== undefined &&
      (typeof suppliedPassword !== 'string' || suppliedPassword.length < 8 || suppliedPassword.length > 72)
    ) {
      return respond({ error: 'كلمة المرور يجب أن تكون من 8 إلى 72 حرفًا.' }, 400);
    }
    const generated = suppliedPassword === undefined || suppliedPassword === '';
    const password = generated ? makeTemporaryPassword() : suppliedPassword as string;
    const { error: updateError } = await serviceClient.auth.admin.updateUserById(userId, { password });
    if (updateError) {
      console.error('تعذر تحديث كلمة مرور الحساب:', updateError.code);
      return respond({ error: 'تعذر تغيير كلمة المرور. تحقق من بيانات الحساب وحاول مرة أخرى.' }, 400);
    }
    return respond(generated ? { temporaryPassword: password } : { updated: true });
  }

  const { data: courier, error: courierError } = await serviceClient
    .from('couriers')
    .select('id')
    .eq('id', accountId)
    .eq('user_id', userId)
    .maybeSingle();
  if (courierError || !courier) {
    return respond({ error: 'حساب المندوب غير موجود.' }, 404);
  }
  const [{ data: details, error: detailsError }, { data: profile, error: courierProfileError }] =
    await Promise.all([
      serviceClient
        .from('courier_private_details')
        .select('national_id, address, id_card_path')
        .eq('courier_id', courier.id)
        .maybeSingle(),
      serviceClient
        .from('profiles')
        .select('id, full_name, email, phone, profile_photo_path')
        .eq('id', userId)
        .eq('role', 'courier')
        .maybeSingle(),
    ]);
  if (detailsError || courierProfileError || !profile) {
    console.error('تعذر تحميل بيانات هوية المندوب:', detailsError?.code ?? courierProfileError?.code);
    return respond({ error: 'بيانات الهوية أو صور المندوب غير مكتملة.' }, 404);
  }

  let idCardUrl: string | undefined;
  if (details?.id_card_path) {
    const { data: card, error: cardError } = await serviceClient.storage
      .from('courier-id-cards')
      .createSignedUrl(details.id_card_path, 3600);
    if (cardError) {
      console.error('تعذر إنشاء رابط صورة بطاقة المندوب:', cardError.message);
      return respond({ error: 'تعذر فتح صور الهوية الخاصة. حاول تحديث البيانات.' }, 500);
    }
    idCardUrl = card.signedUrl;
  }

  let selfieUrl: string | undefined;
  if (profile?.profile_photo_path) {
    const { data: selfie, error: selfieError } = await serviceClient.storage
      .from('courier-profile-photos')
      .createSignedUrl(profile.profile_photo_path, 3600);
    if (selfieError) {
      console.error('تعذر إنشاء رابط صورة سيلفي المندوب:', selfieError.message);
      return respond({ error: 'تعذر فتح صور الهوية الخاصة. حاول تحديث البيانات.' }, 500);
    }
    selfieUrl = selfie.signedUrl;
  }

  const [{ data: courierData, error: courierDataError }, { data: presence, error: presenceError }] =
    await Promise.all([
      serviceClient
        .from('couriers')
        .select('id, courier_code, full_name, email, phone, is_active, contract_start_date, contract_end_date, terminated_at')
        .eq('id', courier.id)
        .maybeSingle(),
      serviceClient
        .from('courier_presence')
        .select('is_on_shift, break_until')
        .eq('courier_id', courier.id)
        .maybeSingle(),
    ]);
  if (courierDataError || presenceError || !courierData) {
    console.error('تعذر تحميل حالة وعقد المندوب:', courierDataError?.code ?? presenceError?.code);
    return respond({ error: 'تعذر تحميل بقية بيانات ملف المندوب.' }, 500);
  }

  return respond({
    id: courierData.id,
    code: courierData.courier_code,
    fullName: courierData.full_name,
    email: courierData.email,
    phone: courierData.phone,
    nationalId: details?.national_id ?? '',
    address: details?.address ?? '',
    ...(idCardUrl ? { idCardUrl } : {}),
    ...(selfieUrl ? { selfieUrl } : {}),
    isActive: courierData.is_active,
    isOnShift: Boolean(presence?.is_on_shift),
    ...(presence?.break_until ? { breakUntil: presence.break_until } : {}),
    contractStartDate: courierData.contract_start_date,
    contractEndDate: courierData.contract_end_date,
    ...(courierData.terminated_at ? { terminatedAt: courierData.terminated_at } : {}),
  });
});
