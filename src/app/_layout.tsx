import { Stack } from 'expo-router';
import { Head } from 'expo-router/head';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppProvider } from '../state/app-context';
import { colors } from '../theme';

export default function RootLayout() {
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
