// Web has no home screen widgets; this stands in so shared code can call updateSnapshot everywhere.
import type { NearbyWidgetProps } from './types';

const NearbyWidget = { updateSnapshot: (_props: NearbyWidgetProps) => {} };
export default NearbyWidget;
