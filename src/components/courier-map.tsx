import MapView, { Marker } from 'react-native-maps';

import { colors } from '../theme';
import type { Courier, CourierLocation } from '../types';

export default function CourierMap({
  couriers,
  locations,
  clock,
  height = 280,
  onCourierPress,
}: {
  couriers: Courier[];
  locations: CourierLocation[];
  clock: number;
  height?: number;
  onCourierPress?: (courierId: number) => void;
}) {
  const latitudes = locations.map((location) => location.latitude);
  const longitudes = locations.map((location) => location.longitude);
  const latitudeSpan = Math.max(Math.max(...latitudes) - Math.min(...latitudes), 0.02);
  const longitudeSpan = Math.max(Math.max(...longitudes) - Math.min(...longitudes), 0.02);
  return (
    <MapView
      style={{ height, borderRadius: 16, overflow: 'hidden' }}
      initialRegion={{
        latitude: (Math.max(...latitudes) + Math.min(...latitudes)) / 2,
        longitude: (Math.max(...longitudes) + Math.min(...longitudes)) / 2,
        latitudeDelta: latitudeSpan * 1.5,
        longitudeDelta: longitudeSpan * 1.5,
      }}
    >
      {locations.map((location) => {
        const courier = couriers.find((item) => item.id === location.courierId);
        const stale = clock - new Date(location.recordedAt).getTime() > 120_000;
        return (
          <Marker
            key={location.courierId}
            coordinate={{ latitude: location.latitude, longitude: location.longitude }}
            title={courier?.fullName ?? 'مندوب'}
            description={stale ? 'آخر موقع قديم' : 'موقع حديث'}
            pinColor={stale ? colors.warning : colors.primary}
            onPress={() => onCourierPress?.(location.courierId)}
          />
        );
      })}
    </MapView>
  );
}
