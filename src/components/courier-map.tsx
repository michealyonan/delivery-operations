import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { colors } from '../theme';
import type { Courier, CourierLocation } from '../types';

export default function CourierMap({
  couriers,
  locations,
  clock,
  height = 280,
  onCourierPress,
  selectedCourierId,
}: {
  couriers: Courier[];
  locations: CourierLocation[];
  clock: number;
  height?: number;
  onCourierPress?: (courierId: number) => void;
  selectedCourierId?: number | null;
}) {
  const latitudes = locations.map((location) => location.latitude);
  const longitudes = locations.map((location) => location.longitude);
  const latitudeSpan = Math.max(Math.max(...latitudes) - Math.min(...latitudes), 0.02);
  const longitudeSpan = Math.max(Math.max(...longitudes) - Math.min(...longitudes), 0.02);
  const initialRegion = {
    latitude: (Math.max(...latitudes) + Math.min(...latitudes)) / 2,
    longitude: (Math.max(...longitudes) + Math.min(...longitudes)) / 2,
    latitudeDelta: latitudeSpan * 1.5,
    longitudeDelta: longitudeSpan * 1.5,
  };
  const [region, setRegion] = useState(initialRegion);
  const adjustZoom = (factor: number) => {
    setRegion((current) => ({
      ...current,
      latitudeDelta: Math.max(0.002, Math.min(60, current.latitudeDelta * factor)),
      longitudeDelta: Math.max(0.002, Math.min(60, current.longitudeDelta * factor)),
    }));
  };

  return (
    <View style={[styles.container, { height }]}>
      <MapView
        style={StyleSheet.absoluteFill}
        region={region}
        onRegionChangeComplete={setRegion}
        zoomEnabled
        zoomControlEnabled
      >
        {locations.map((location) => {
          const courier = couriers.find((item) => item.id === location.courierId);
          const stale = clock - new Date(location.recordedAt).getTime() > 120_000;
          const selected = selectedCourierId === location.courierId;
          return (
            <Marker
              key={location.courierId}
              coordinate={{ latitude: location.latitude, longitude: location.longitude }}
              title={courier?.fullName ?? 'مندوب'}
              description={stale ? 'آخر موقع قديم' : 'موقع حديث'}
              pinColor={selected ? colors.danger : stale ? colors.warning : colors.primary}
              onPress={() => onCourierPress?.(location.courierId)}
            />
          );
        })}
      </MapView>
      <View pointerEvents="box-none" style={styles.zoomControls}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="تكبير الخريطة"
          onPress={() => adjustZoom(0.5)}
          style={styles.zoomButton}
        >
          <Text style={styles.zoomText}>+</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="تصغير الخريطة"
          onPress={() => adjustZoom(2)}
          style={styles.zoomButton}
        >
          <Text style={styles.zoomText}>−</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { overflow: 'hidden', borderRadius: 16 },
  zoomControls: { position: 'absolute', top: 12, left: 12, gap: 6 },
  zoomButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d8e0e5',
  },
  zoomText: { color: '#173042', fontSize: 24, lineHeight: 28, fontWeight: '700' },
});
