// Data the app hands to the home screen widgets (widgets can't fetch anything themselves).
export type QuickWidgetProps = {
  signedIn: boolean;
  /** Open (not fixed) reports in the person's alert area. */
  count: number;
  /** "near you", "in Curepipe" or "in Mauritius". */
  areaLabel: string;
  /** "10:42", when the app last updated the widget. */
  updated: string;
};

export type NearbyItem = { id: string; title: string; status: string; color: string };

export type NearbyWidgetProps = {
  signedIn: boolean;
  place: string;
  temp: string;
  condition: string;
  rain: string;
  areaLabel: string;
  items: NearbyItem[];
  updated: string;
};

export const EMPTY_QUICK: QuickWidgetProps = { signedIn: false, count: 0, areaLabel: 'near you', updated: '' };
export const EMPTY_NEARBY: NearbyWidgetProps = {
  signedIn: false,
  place: '',
  temp: '',
  condition: '',
  rain: '',
  areaLabel: 'near you',
  items: [],
  updated: '',
};
