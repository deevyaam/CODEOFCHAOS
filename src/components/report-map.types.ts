import type { Report } from '@/lib/reports';

export type LatLng = { lat: number; lng: number };

export type ReportMapHandle = {
  centerOn: (p: LatLng, zoomedIn?: boolean) => void;
};

export type ReportMapProps = {
  reports?: Report[];
  me?: LatLng | null;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  /** Pick mode: tapping the map drops a single pin. */
  pick?: { value: LatLng | null; color: string; onPick: (p: LatLng) => void };
  initial?: LatLng & { zoom?: number };
  /** Web only: show the satellite layer switch. */
  layers?: boolean;
};
