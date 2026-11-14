// Android: the shared OpenStreetMap (Leaflet) map in a WebView, so the app needs no Google Maps key.
// iPhones use report-map.tsx (Apple Maps, no key needed either).
import { forwardRef, useImperativeHandle, useMemo, useRef, type ComponentType, type Ref } from 'react';
import { StyleSheet } from 'react-native';
import WebViewBase, { type WebViewMessageEvent } from 'react-native-webview';
import type { AndroidWebViewProps } from 'react-native-webview/lib/WebViewTypes';

import { MAURITIUS_CENTER } from '@/lib/places';
import { useTheme } from '@/theme';

import { mapHtml, useLeafletSync, type FromMap } from './leaflet-map';
import type { ReportMapHandle, ReportMapProps } from './report-map.types';

// The package's combined iOS + Android + Windows prop types collapse to `never` with React 19's types,
// so type it with the Android props this file actually uses.
type WebViewHandle = { injectJavaScript: (script: string) => void };
const WebView = WebViewBase as unknown as ComponentType<AndroidWebViewProps & { ref?: Ref<WebViewHandle> }>;

export const ReportMap = forwardRef<ReportMapHandle, ReportMapProps>(function ReportMap(props, ref) {
  const { initial, layers = true } = props;
  const view = useRef<WebViewHandle>(null);
  const { scheme, colors } = useTheme();
  const start = useMemo(() => ({ ...MAURITIUS_CENTER, zoom: 9.5, ...initial }), [initial]);
  // Built once per theme; later updates go through messages.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const html = useMemo(() => mapHtml(scheme === 'dark', start, layers, props.basemap), [scheme, layers]);

  const post = (m: object) => view.current?.injectJavaScript(`window.__lpt&&window.__lpt(${JSON.stringify({ __lpt: true, ...m })});true;`);
  const receive = useLeafletSync(props, post, true);

  useImperativeHandle(ref, () => ({
    centerOn: (p, zoomedIn = true) => post({ type: 'center', lat: p.lat, lng: p.lng, zoom: zoomedIn ? 15 : 12 }),
  }));

  const onMessage = (e: WebViewMessageEvent) => {
    try {
      const m = JSON.parse(e.nativeEvent.data);
      if (m?.__lpt) receive(m as FromMap);
    } catch {
      // not ours
    }
  };

  return (
    <WebView
      ref={view}
      // The app's web address as the page's origin, so map tile servers see who is asking.
      source={{ html, baseUrl: 'https://ansam-moris.vercel.app/' }}
      originWhitelist={['https://*']}
      onMessage={onMessage}
      javaScriptEnabled
      domStorageEnabled
      setSupportMultipleWindows={false}
      overScrollMode="never"
      style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]}
      accessibilityLabel="Map of reports"
    />
  );
});
