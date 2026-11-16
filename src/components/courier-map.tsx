import MapView, { Marker } from 'react-native-maps';

import { colors } from '../theme';
import type { Courier, CourierLocation } from '../types';

export default function CourierMap({
  couriers,
  locations,
  clock,
}: {
  couriers: Courier[];
  locations: CourierLocation[];
  clock: number;
}) {
  return (
    <MapView
      style={{ height: 280, borderRadius: 16, overflow: 'hidden' }}
      initialRegion={{
        latitude: locations[0].latitude,
        longitude: locations[0].longitude,
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
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
          />
        );
      })}
    </MapView>
  );
}
