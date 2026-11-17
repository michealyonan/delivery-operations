import { Redirect, useLocalSearchParams } from 'expo-router';

export default function OrderDetailRedirect() {
  const rawId = useLocalSearchParams<{ id?: string | string[] }>().id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  return <Redirect href={{ pathname: '/(tabs)/order-detail', params: { id: String(id ?? '') } }} />;
}
