// Phones: react-native-maps (Google Maps on Android, Apple Maps on iOS).
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import MapView, { Circle, Marker, type MapPressEvent } from 'react-native-maps';

import { pinOf } from '@/lib/reports';
import { MAURITIUS_CENTER } from '@/lib/places';
import { useTheme } from '@/theme';

import type { ReportMapHandle, ReportMapProps } from './report-map.types';
import { MapPin } from './map-pin';

const zoomToDelta = (zoom: number) => 360 / 2 ** zoom;

export const ReportMap = forwardRef<ReportMapHandle, ReportMapProps>(function ReportMap(
  { reports = [], zones = [], me, selectedId, onSelect, pick, initial, basemap = 'map' },
  ref,
) {
  const map = useRef<MapView>(null);
  const { scheme } = useTheme();
  const [ready, setReady] = useState(false);
  const start = initial ?? { ...MAURITIUS_CENTER, zoom: 9.5 };

  useImperativeHandle(ref, () => ({
    centerOn: (p, zoomedIn = true) =>
      map.current?.animateToRegion(
        { latitude: p.lat, longitude: p.lng, latitudeDelta: zoomedIn ? 0.02 : 0.2, longitudeDelta: zoomedIn ? 0.02 : 0.2 },
        350,
      ),
  }));

  return (
    <MapView
      ref={map}
      style={StyleSheet.absoluteFill}
      initialRegion={{
        latitude: start.lat,
        longitude: start.lng,
        latitudeDelta: zoomToDelta(start.zoom ?? 9.5),
        longitudeDelta: zoomToDelta(start.zoom ?? 9.5),
      }}
      userInterfaceStyle={scheme}
      mapType={basemap === 'satellite' ? 'hybrid' : 'standard'}
      showsUserLocation={!!me}
      showsMyLocationButton={false}
      toolbarEnabled={false}
      onMapReady={() => setReady(true)}
      onPress={(e: MapPressEvent) => {
        if (pick) pick.onPick({ lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude });
        else onSelect?.(null);
      }}>
      {ready &&
        zones.map((z) => (
          <Circle
            key={z.id}
            center={{ latitude: z.lat, longitude: z.lng }}
            radius={z.radius}
            fillColor={hexToRgba(z.color, z.opacity)}
            strokeColor={hexToRgba(z.color, Math.min(1, z.opacity + 0.3))}
            strokeWidth={1}
          />
        ))}
      {ready &&
        reports
          .filter((r) => r.lat != null && r.lng != null)
          .map((r) => (
            <Marker
              key={r.id}
              coordinate={{ latitude: r.lat!, longitude: r.lng! }}
              onPress={(e) => {
                e.stopPropagation();
                onSelect?.(r.id);
              }}
              anchor={{ x: 0.5, y: 1 }}
              tracksViewChanges={false}
              accessibilityLabel={`${pinOf(r).label}: ${r.title}`}>
              <MapPin {...pinOf(r)} size={r.id === selectedId ? 40 : 30} />
            </Marker>
          ))}
      {pick?.value && (
        <Marker
          coordinate={{ latitude: pick.value.lat, longitude: pick.value.lng }}
          draggable
          anchor={{ x: 0.5, y: 1 }}
          onDragEnd={(e) => pick.onPick({ lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude })}>
          <MapPin color={pick.color} icon={pick.icon ?? 'location'} size={40} />
        </Marker>
      )}
    </MapView>
  );
});

function hexToRgba(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

