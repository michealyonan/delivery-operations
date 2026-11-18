import { router, Stack } from 'expo-router';
import { Head } from 'expo-router/head';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppProvider } from '../state/app-context';
import { colors } from '../theme';

function useShiftNotificationNavigation() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let active = true;
    let subscription: { remove: () => void } | undefined;
    const openShifts = (notification: {
      request: { content: { data?: Record<string, unknown> } };
    }) => {
      if (notification.request.content.data?.url === '/(tabs)/my-shifts') {
        router.push('/(tabs)/my-shifts');
      }
    };
    import('expo-notifications')
      .then((Notifications) => {
        if (!active) return;
        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldPlaySound: false,
            shouldSetBadge: false,
            shouldShowBanner: true,
            shouldShowList: true,
          }),
        });
        const lastResponse = Notifications.getLastNotificationResponse();
        if (lastResponse) openShifts(lastResponse.notification);
        subscription = Notifications.addNotificationResponseReceivedListener((response) =>
          openShifts(response.notification),
        );
      })
      .catch((error: unknown) => {
        console.error('تعذر إعداد فتح صفحة الشفتات من الإشعار:', error);
      });
    return () => {
      active = false;
      subscription?.remove();
    };
  }, []);
}

export default function RootLayout() {
  useShiftNotificationNavigation();
  return (
    <SafeAreaProvider>
      <AppProvider>
        <Head>
          <title>دليفرى</title>
          <meta name="description" content="إدارة طلبات التوصيل والمطاعم والمندوبين." />
        </Head>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
            animation: 'fade_from_bottom',
          }}
        />
      </AppProvider>
    </SafeAreaProvider>
  );
}
