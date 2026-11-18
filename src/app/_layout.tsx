import { router, Stack } from 'expo-router';
import { Head } from 'expo-router/head';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppProvider } from '../state/app-context';
import { colors } from '../theme';

function useNotificationNavigation() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let active = true;
    let subscription: { remove: () => void } | undefined;
    const openDestination = (notification: {
      request: { content: { data?: Record<string, unknown> } };
    }) => {
      const url = notification.request.content.data?.url;
      if (url === '/(tabs)/my-shifts' || url === '/(tabs)/notifications') {
        router.push(url);
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
        if (lastResponse) openDestination(lastResponse.notification);
        subscription = Notifications.addNotificationResponseReceivedListener((response) =>
          openDestination(response.notification),
        );
      })
      .catch((error: unknown) => {
        console.error('تعذر إعداد فتح الصفحة من الإشعار:', error);
      });
    return () => {
      active = false;
      subscription?.remove();
    };
  }, []);
}

export default function RootLayout() {
  useNotificationNavigation();
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
