import type { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  const plugins: ExpoConfig['plugins'] = [
    ['expo-router', { root: 'src/app' }],
    'expo-font',
    [
      'expo-location',
      {
        locationWhenInUsePermission: 'يستخدم التطبيق موقعك أثناء الشيفت أو التوصيلة النشطة فقط.',
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: 'اختر صورة بطاقة المندوب لرفعها إلى التخزين الخاص.',
        cameraPermission: 'التقط صورة بطاقة المندوب.',
        microphonePermission: false,
      },
    ],
    ['expo-notifications', { color: '#174A86' }],
  ];

  if (process.env.GOOGLE_MAPS_API_KEY) {
    plugins.push([
      'react-native-maps',
      { androidGoogleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY },
    ]);
  }

  return {
    ...config,
    name: 'إدارة التوصيل',
    slug: 'delivery-operations',
    orientation: 'portrait',
    userInterfaceStyle: 'light',
    platforms: ['android', 'web'],
    android: {
      ...config.android,
      package: 'com.deliveryapp.operations',
      predictiveBackGestureEnabled: true,
    },
    plugins,
  };
};
