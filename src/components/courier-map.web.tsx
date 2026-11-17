import { useEffect, useMemo, useRef, useState } from 'react';

import type { Courier, CourierLocation } from '../types';

const TILE_SIZE = 256;
const MAX_LATITUDE = 85.05112878;

function project(latitude: number, longitude: number) {
  const limitedLatitude = Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, latitude));
  const sin = Math.sin((limitedLatitude * Math.PI) / 180);
  return {
    x: (longitude + 180) / 360,
    y: 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI),
  };
}

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
  const mapRef = useRef<HTMLDivElement>(null);
  const [mapSize, setMapSize] = useState({ width: 720, height });

  useEffect(() => {
    const element = mapRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setMapSize({
        width: Math.max(1, entry.contentRect.width),
        height: Math.max(1, entry.contentRect.height),
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const map = useMemo(() => {
    const projected = locations.map((location) => ({
      location,
      point: project(location.latitude, location.longitude),
    }));
    const xValues = projected.map(({ point }) => point.x);
    const yValues = projected.map(({ point }) => point.y);
    const minX = Math.min(...xValues);
    const maxX = Math.max(...xValues);
    const minY = Math.min(...yValues);
    const maxY = Math.max(...yValues);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const spanX = Math.max(maxX - minX, 1 / 2 ** 16);
    const spanY = Math.max(maxY - minY, 1 / 2 ** 16);
    const scale = Math.min((mapSize.width - 64) / spanX, (mapSize.height - 64) / spanY);
    const zoom = Math.max(4, Math.min(16, Math.floor(Math.log2(scale / TILE_SIZE))));
    const worldSize = TILE_SIZE * 2 ** zoom;
    const left = centerX * worldSize - mapSize.width / 2;
    const top = centerY * worldSize - mapSize.height / 2;
    const firstTileX = Math.floor(left / TILE_SIZE);
    const firstTileY = Math.floor(top / TILE_SIZE);
    const lastTileX = Math.floor((left + mapSize.width) / TILE_SIZE);
    const lastTileY = Math.floor((top + mapSize.height) / TILE_SIZE);
    const tileCount = 2 ** zoom;
    const tiles = [];

    for (let tileY = firstTileY; tileY <= lastTileY; tileY += 1) {
      if (tileY < 0 || tileY >= tileCount) continue;
      for (let tileX = firstTileX; tileX <= lastTileX; tileX += 1) {
        const wrappedX = ((tileX % tileCount) + tileCount) % tileCount;
        tiles.push({
          key: `${zoom}-${wrappedX}-${tileY}`,
          url: `https://tile.openstreetmap.org/${zoom}/${wrappedX}/${tileY}.png`,
          left: tileX * TILE_SIZE - left,
          top: tileY * TILE_SIZE - top,
        });
      }
    }

    return {
      tiles,
      markers: projected.map(({ location, point }) => ({
        location,
        left: point.x * worldSize - left,
        top: point.y * worldSize - top,
      })),
    };
  }, [locations, mapSize]);

  return (
    <div
      ref={mapRef}
      role={onCourierPress ? 'group' : 'img'}
      aria-label="خريطة مواقع المندوبين"
      style={{
        height,
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 16,
        backgroundColor: '#e8eef0',
      }}
    >
      {map.tiles.map((tile) => (
        <img
          key={tile.key}
          alt=""
          aria-hidden="true"
          src={tile.url}
          style={{
            position: 'absolute',
            width: TILE_SIZE,
            height: TILE_SIZE,
            left: tile.left,
            top: tile.top,
          }}
        />
      ))}
      {map.markers.map(({ location, left, top }) => {
        const courier = couriers.find((item) => item.id === location.courierId);
        const stale = clock - new Date(location.recordedAt).getTime() > 120_000;
        return (
          <button
            key={location.courierId}
            type="button"
            title={`${courier?.fullName ?? 'مندوب'} · ${stale ? 'آخر موقع قديم' : 'موقع حديث'}`}
            aria-label={`اختيار ${courier?.fullName ?? 'مندوب'}`}
            onClick={() => onCourierPress?.(location.courierId)}
            style={{
              position: 'absolute',
              left,
              top,
              width: 20,
              height: 20,
              borderRadius: 12,
              border: '3px solid white',
              backgroundColor: stale ? '#b7791f' : '#167c72',
              boxShadow: '0 2px 6px rgba(0,0,0,.35)',
              transform: 'translate(-50%, -50%)',
              padding: 0,
              cursor: onCourierPress ? 'pointer' : 'default',
            }}
          />
        );
      })}
      <a
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noreferrer"
        style={{
          position: 'absolute',
          right: 6,
          bottom: 5,
          padding: '2px 5px',
          borderRadius: 3,
          backgroundColor: 'rgba(255,255,255,.9)',
          color: '#334155',
          fontSize: 11,
          textDecoration: 'none',
        }}
      >
        © OpenStreetMap
      </a>
    </div>
  );
}
