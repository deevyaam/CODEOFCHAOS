import type { IconName } from '@/components/ui';
import type { Report } from '@/lib/reports';
import type { Zone } from '@/lib/safety';

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
  pick?: { value: LatLng | null; color: string; icon?: IconName; onPick: (p: LatLng) => void };
  initial?: LatLng & { zoom?: number };
  /** Shaded circles drawn under the pins (safety heat, dark spots). */
  zones?: Zone[];
  /** Web only: show the satellite layer switch. */
  layers?: boolean;
};
