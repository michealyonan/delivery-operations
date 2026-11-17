import { isBackendConfigured, supabase } from './supabase';
import { errorMessage } from './error-message';

let activeWatchId: number | null = null;
let lastSentAt = 0;
let lastCoordinates: { latitude: number; longitude: number } | null = null;

function assertBrowserLocation() {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    throw new Error('المتصفح لا يدعم تحديد الموقع.');
  }
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    throw new Error('مشاركة الموقع في المتصفح تحتاج إلى HTTPS أو localhost.');
  }
}

function positionErrorMessage(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED) {
    return 'اسمح للمتصفح باستخدام الموقع، ثم أعد تشغيل الشيفت.';
  }
  if (error.code === error.POSITION_UNAVAILABLE) {
    return 'تعذر تحديد موقع الجهاز. تحقق من تفعيل الموقع والإنترنت.';
  }
  return 'انتهت مهلة تحديد الموقع. تحقق من إعدادات الموقع وحاول مرة أخرى.';
}

function distanceInMeters(
  first: { latitude: number; longitude: number },
  second: { latitude: number; longitude: number },
) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(second.latitude - first.latitude);
  const longitudeDelta = radians(second.longitude - first.longitude);
  const value =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(first.latitude)) *
      Math.cos(radians(second.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export async function requestShiftLocationPermissions() {
  if (!isBackendConfigured || !supabase) {
    throw new Error('مشاركة الموقع بين الأجهزة تحتاج إلى ربط قاعدة البيانات أولًا.');
  }
  assertBrowserLocation();
}

export async function startShiftLocationUpdates(courierId: number) {
  const client = supabase;
  if (!isBackendConfigured || !client) {
    throw new Error('مشاركة الموقع بين الأجهزة تحتاج إلى ربط قاعدة البيانات أولًا.');
  }
  assertBrowserLocation();
  if (activeWatchId !== null) return;

  await new Promise<void>((resolve, reject) => {
    let started = false;
    let watchId: number | null = null;

    const failToStart = (error: Error) => {
      if (started) return;
      started = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      if (activeWatchId === watchId) activeWatchId = null;
      reject(error);
    };

    watchId = navigator.geolocation.watchPosition(
      async ({ coords, timestamp }) => {
        const nextCoordinates = {
          latitude: coords.latitude,
          longitude: coords.longitude,
        };
        const now = Date.now();
        if (
          lastCoordinates &&
          now - lastSentAt < 30_000 &&
          distanceInMeters(lastCoordinates, nextCoordinates) < 50
        ) {
          if (!started) {
            started = true;
            resolve();
          }
          return;
        }

        try {
          const { error } = await client.from('courier_locations').upsert({
            courier_id: courierId,
            latitude: nextCoordinates.latitude,
            longitude: nextCoordinates.longitude,
            recorded_at: new Date(timestamp).toISOString(),
          });
          if (error) throw error;
          lastCoordinates = nextCoordinates;
          lastSentAt = now;
          if (!started) {
            started = true;
            resolve();
          }
        } catch (error) {
          if (!started) {
            failToStart(
              new Error(
                `تعذر حفظ موقع المندوب على الخادم: ${errorMessage(error, 'حاول مرة أخرى.')}`,
              ),
            );
          } else {
            console.error('تعذر تحديث موقع المندوب:', error);
          }
        }
      },
      (error) => {
        const locationError = new Error(positionErrorMessage(error));
        if (!started) {
          failToStart(locationError);
        } else {
          console.error('توقف تحديث موقع المندوب:', locationError);
        }
      },
      { enableHighAccuracy: false, maximumAge: 10_000, timeout: 20_000 },
    );
    activeWatchId = watchId;
  });
}

export async function stopShiftLocationUpdates() {
  if (activeWatchId !== null && typeof navigator !== 'undefined') {
    navigator.geolocation.clearWatch(activeWatchId);
    activeWatchId = null;
  }
  lastCoordinates = null;
  lastSentAt = 0;
}

export async function readCurrentLocation() {
  assertBrowserLocation();
  return new Promise<{ latitude: number; longitude: number }>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
      (error) => reject(new Error(positionErrorMessage(error))),
      { enableHighAccuracy: false, maximumAge: 10_000, timeout: 20_000 },
    );
  });
}