// Towns used for weather, alert areas and report locations. Coordinates are approximate town centres.
export type Town = { name: string; lat: number; lng: number };

export const TOWNS: Town[] = [
  { name: 'Port Louis', lat: -20.1609, lng: 57.5012 },
  { name: 'Beau Bassin-Rose Hill', lat: -20.2353, lng: 57.4683 },
  { name: 'Vacoas-Phoenix', lat: -20.2981, lng: 57.4783 },
  { name: 'Curepipe', lat: -20.3163, lng: 57.5259 },
  { name: 'Quatre Bornes', lat: -20.2654, lng: 57.4791 },
  { name: 'Triolet', lat: -20.0549, lng: 57.5452 },
  { name: 'Goodlands', lat: -20.035, lng: 57.6431 },
  { name: 'Centre de Flacq', lat: -20.1897, lng: 57.7144 },
  { name: 'Mahébourg', lat: -20.4081, lng: 57.7 },
  { name: 'Grand Baie', lat: -20.0182, lng: 57.5802 },
  { name: 'Flic en Flac', lat: -20.2744, lng: 57.3631 },
  { name: 'Rose-Belle', lat: -20.4003, lng: 57.5969 },
  { name: 'Souillac', lat: -20.5167, lng: 57.5167 },
  { name: 'Bel Air Rivière Sèche', lat: -20.2569, lng: 57.7497 },
  { name: 'Pamplemousses', lat: -20.1039, lng: 57.5703 },
  { name: 'Moka', lat: -20.2189, lng: 57.4958 },
  { name: 'Rivière du Rempart', lat: -20.1027, lng: 57.6847 },
  { name: 'Chemin Grenier', lat: -20.4874, lng: 57.4656 },
  { name: 'Port Mathurin (Rodrigues)', lat: -19.6833, lng: 63.4167 },
];

export const DEFAULT_TOWN = TOWNS[0]; // Port Louis
/** Centre of mainland Mauritius for the initial map view. */
export const MAURITIUS_CENTER = { lat: -20.25, lng: 57.55 };

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(r(b.lat - a.lat) / 2) ** 2 +
    Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export function nearestTown(p: { lat: number; lng: number }): Town {
  return TOWNS.reduce((best, t) => (distanceKm(p, t) < distanceKm(p, best) ? t : best), TOWNS[0]);
}

export function formatDistance(km: number) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(km < 10 ? 1 : 0)} km`;
}
