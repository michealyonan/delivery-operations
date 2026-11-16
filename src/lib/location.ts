import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { isBackendConfigured, supabase } from './supabase';

const LOCATION_TASK = 'delivery-courier-location';

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(
  LOCATION_TASK,
  async ({ data, error }) => {
    if (error) {
      throw error;
    }
    if (!data?.locations.length || !supabase || !isBackendConfigured) {
      return;
    }

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) {
      throw userError;
    }
    if (!userData.user) {
      throw new Error('يلزم تسجيل الدخول لمشاركة الموقع.');
    }

    const { data: courier, error: courierError } = await supabase
      .from('couriers')
      .select('id')
      .eq('user_id', userData.user.id)
      .single();
    if (courierError) {
      throw courierError;
    }

    const latest = data.locations[data.locations.length - 1];
    const { error: locationError } = await supabase.from('courier_locations').upsert({
      courier_id: courier.id,
      latitude: latest.coords.latitude,
      longitude: latest.coords.longitude,
      recorded_at: new Date(latest.timestamp).toISOString(),
    });
    if (locationError) {
      throw locationError;
    }
  },
);

export async function requestShiftLocationPermissions() {
  if (!isBackendConfigured) {
    throw new Error('مشاركة الموقع بين الأجهزة تحتاج إلى ربط قاعدة البيانات أولًا.');
  }

  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== 'granted') {
    throw new Error('اسمح للتطبيق باستخدام الموقع أثناء الشيفت لتشغيل التتبع.');
  }

  const background = await Location.requestBackgroundPermissionsAsync();
  if (background.status !== 'granted') {
    throw new Error('اسمح بمشاركة الموقع في الخلفية أثناء الشيفت، أو فعّل الإذن من إعدادات Android.');
  }
}

export async function startShiftLocationUpdates(_courierId?: number) {
  if (!TaskManager.isAvailableAsync || !(await TaskManager.isAvailableAsync())) {
    throw new Error('خدمة الموقع في الخلفية غير متاحة على هذا الجهاز.');
  }
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) {
    return;
  }

  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.Balanced,
    distanceInterval: 50,
    timeInterval: 30_000,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'مشاركة موقع المندوب',
      notificationBody: 'يتشارك التطبيق موقعك أثناء الشيفت فقط.',
      killServiceOnDestroy: false,
    },
  });
}

export async function stopShiftLocationUpdates() {
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  }
}

export async function readCurrentLocation() {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') {
    throw new Error('اسمح باستخدام الموقع لتحديد موقع المطعم.');
  }
  const location = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
  };
}
