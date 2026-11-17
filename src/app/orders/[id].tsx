import { Redirect, useLocalSearchParams } from 'expo-router';

export default function OrderDetailRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={{ pathname: '/order-details/[id]', params: { id } }} />;
}
