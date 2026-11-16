import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';

import { useApp } from '../state/app-context';
import { colors } from '../theme';

export default function IndexRoute() {
  const { profile, isLoading } = useApp();
  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }
  return <Redirect href={profile ? '/(tabs)' : '/login'} />;
}
