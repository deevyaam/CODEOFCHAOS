// Web: the shared Leaflet map (leaflet-map.ts) inside a sandboxed iframe, with street and satellite layers.
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';

import { MAURITIUS_CENTER } from '@/lib/places';
import { useTheme } from '@/theme';

import { mapHtml, useLeafletSync, type FromMap } from './leaflet-map';
import type { ReportMapHandle, ReportMapProps } from './report-map.types';

export const ReportMap = forwardRef<ReportMapHandle, ReportMapProps>(function ReportMap(props, ref) {
  const { initial, layers = true } = props;
  const frame = useRef<HTMLIFrameElement>(null);
  const { scheme } = useTheme();
  const start = useMemo(() => ({ ...MAURITIUS_CENTER, zoom: 10, ...initial }), [initial]);
  // The document is built once per theme; later updates go through messages.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const srcDoc = useMemo(() => mapHtml(scheme === 'dark', start, layers), [scheme, layers]);

  const post = (m: object) => frame.current?.contentWindow?.postMessage({ __lpt: true, ...m }, '*');
  const receive = useLeafletSync(props, post, false);

  useImperativeHandle(ref, () => ({
    centerOn: (p, zoomedIn = true) => post({ type: 'center', lat: p.lat, lng: p.lng, zoom: zoomedIn ? 15 : 12 }),
  }));

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || !e.data?.__lpt) return;
      receive(e.data as FromMap);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [receive]);

  return (
    <iframe
      ref={frame}
      title="Map of reports"
      srcDoc={srcDoc}
      sandbox="allow-scripts"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
    />
  );
});
