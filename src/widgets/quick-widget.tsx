// Web has no home screen widgets; this stands in so shared code can call updateSnapshot everywhere.
import type { QuickWidgetProps } from './types';

const QuickWidget = { updateSnapshot: (_props: QuickWidgetProps) => {} };
export default QuickWidget;
