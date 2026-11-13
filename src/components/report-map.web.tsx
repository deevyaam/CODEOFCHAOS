// Web: Leaflet inside a sandboxed iframe, with street and satellite tile layers.
import Ionicons from '@expo/vector-icons/Ionicons';
import { Asset } from 'expo-asset';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';

import { pinOf } from '@/lib/reports';
import { MAURITIUS_CENTER } from '@/lib/places';
import { useTheme } from '@/theme';

import type { ReportMapHandle, ReportMapProps } from './report-map.types';
import type { IconName } from './ui';

/** The icon as a character of the Ionicons font, which the map frame loads itself (see 'font' below). */
const glyph = (name: IconName) => String.fromCodePoint((Ionicons.glyphMap as Record<string, number>)[name] ?? 0xf3bc);

/** The icon font as bytes. The map runs in a sandboxed frame that can't load the app's fonts, so we hand it over. */
let fontBytes: Promise<ArrayBuffer | null> | null = null;
function iconFont() {
  fontBytes ??= (async () => {
    try {
      const source = Object.values((Ionicons as unknown as { font: Record<string, unknown> }).font)[0];
      const uri = typeof source === 'string' ? source : typeof source === 'number' ? Asset.fromModule(source).uri : (source as { uri?: string })?.uri;
      return uri ? await (await fetch(uri)).arrayBuffer() : null;
    } catch {
      return null; // pins still show their colour
    }
  })();
  return fontBytes;
}

const LEAFLET = 'https://unpkg.com/leaflet@1.9.4/dist';

function html(dark: boolean, start: { lat: number; lng: number; zoom: number }, layers: boolean) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="${LEAFLET}/leaflet.css" crossorigin="">
<style>
html,body,#map{height:100%;margin:0;background:${dark ? '#0B1418' : '#E9EEF0'}}
.pin{width:30px;height:30px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 4px 12px rgba(0,0,0,.25);box-sizing:border-box;display:flex;align-items:center;justify-content:center}
.pin.sel{width:40px;height:40px}
.pin i{transform:rotate(45deg);font:normal 15px/1 lption;color:#fff;speak:never}
.pin.sel i{font-size:20px}
.leaflet-top{top:120px}
.me{width:18px;height:18px;border-radius:50%;background:#2F6FDB;border:3px solid #fff;box-shadow:0 0 0 6px rgba(47,111,219,.25);box-sizing:border-box}
${dark ? '.leaflet-tile-pane .street{filter:invert(.92) hue-rotate(180deg) brightness(.9) contrast(.9)}' : ''}
</style></head><body><div id="map"></div>
<script src="${LEAFLET}/leaflet.js" crossorigin=""></script>
<script>
const map=L.map('map',{zoomControl:false,attributionControl:true}).setView([${start.lat},${start.lng}],${start.zoom});
const street=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,className:'street',attribution:'&copy; OpenStreetMap contributors'});
const sat=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,attribution:'Imagery &copy; Esri'});
street.addTo(map);
${layers ? "L.control.layers({'Map':street,'Satellite':sat},null,{position:'topright'}).addTo(map);" : ''}
L.control.zoom({position:'topright'}).addTo(map);
let zones=L.layerGroup().addTo(map), markers=L.layerGroup().addTo(map), me=null, pickMarker=null, pickMode=false;
const send=(m)=>parent.postMessage(Object.assign({__lpt:true},m),'*');
const esc=(t)=>String(t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const pinIcon=(color,g,sel)=>{const s=sel?40:30;return L.divIcon({className:'',html:'<div class="pin'+(sel?' sel':'')+'" style="background:'+esc(color)+'"><i aria-hidden="true">'+esc(g||'')+'</i></div>',iconSize:[s,s],iconAnchor:[s/2,Math.round(s/2+s*0.707)]});};
map.on('click',e=>{ if(pickMode) send({type:'pick',lat:e.latlng.lat,lng:e.latlng.lng}); else send({type:'select',id:null}); });
window.addEventListener('message',e=>{
  const m=e.data; if(!m||!m.__lpt) return;
  if(m.type==='reports'){ markers.clearLayers(); m.items.forEach(r=>{
    L.marker([r.lat,r.lng],{icon:pinIcon(r.color,r.g,r.sel),title:r.label+': '+r.title,alt:r.label,keyboard:true}).on('click',ev=>{L.DomEvent.stopPropagation(ev);send({type:'select',id:r.id});}).addTo(markers);
  }); }
  if(m.type==='zones'){ zones.clearLayers(); m.items.forEach(z=>{
    L.circle([z.lat,z.lng],{radius:z.radius,color:z.color,weight:1,opacity:Math.min(1,z.opacity+0.3),fillColor:z.color,fillOpacity:z.opacity,interactive:true}).bindTooltip(z.label).addTo(zones);
  }); }
  if(m.type==='me'){ if(me) me.remove(); if(m.lat!=null) me=L.marker([m.lat,m.lng],{icon:L.divIcon({className:'',html:'<div class="me" title="You are here"></div>',iconSize:[18,18]})}).addTo(map); }
  if(m.type==='font'&&m.buf&&window.FontFace){ new FontFace('lption',m.buf).load().then(f=>document.fonts.add(f)).catch(()=>{}); }
  if(m.type==='center'){ map.flyTo([m.lat,m.lng],m.zoom,{duration:m.instant?0:0.35}); }
  if(m.type==='pick'){ pickMode=true; if(pickMarker) pickMarker.remove(); if(m.lat!=null){ pickMarker=L.marker([m.lat,m.lng],{draggable:true,icon:pinIcon(m.color,m.g,true)}).addTo(map); pickMarker.on('dragend',()=>{const p=pickMarker.getLatLng();send({type:'pick',lat:p.lat,lng:p.lng});}); } }
});
send({type:'ready'});
</script></body></html>`;
}

export const ReportMap = forwardRef<ReportMapHandle, ReportMapProps>(function ReportMap(
  { reports = [], zones = [], me, selectedId, onSelect, pick, initial, layers = true },
  ref,
) {
  const frame = useRef<HTMLIFrameElement>(null);
  const { scheme } = useTheme();
  const [ready, setReady] = useState(false);
  const start = useMemo(() => ({ ...MAURITIUS_CENTER, zoom: 10, ...initial }), [initial]);
  // The document is built once per theme; later updates go through postMessage.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const srcDoc = useMemo(() => html(scheme === 'dark', start, layers), [scheme, layers]);

  const post = (m: object) => frame.current?.contentWindow?.postMessage({ __lpt: true, ...m }, '*');

  useImperativeHandle(ref, () => ({
    centerOn: (p, zoomedIn = true) => post({ type: 'center', lat: p.lat, lng: p.lng, zoom: zoomedIn ? 15 : 12 }),
  }));

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || !e.data?.__lpt) return;
      if (e.data.type === 'ready') setReady(true);
      if (e.data.type === 'select') onSelect?.(e.data.id);
      if (e.data.type === 'pick') pick?.onPick({ lat: e.data.lat, lng: e.data.lng });
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onSelect, pick]);

  useEffect(() => {
    if (!ready) return;
    post({
      type: 'reports',
      items: reports
        .filter((r) => r.lat != null && r.lng != null)
        .map((r) => {
          const p = pinOf(r);
          return { id: r.id, lat: r.lat, lng: r.lng, title: r.title, label: p.label, color: p.color, g: glyph(p.icon), sel: r.id === selectedId };
        }),
    });
  }, [ready, reports, selectedId]);

  useEffect(() => {
    if (!ready) return;
    iconFont().then((buf) => buf && post({ type: 'font', buf: buf.slice(0) }));
  }, [ready]);

  useEffect(() => {
    if (ready) post({ type: 'zones', items: zones });
  }, [ready, zones]);

  useEffect(() => {
    if (ready) post({ type: 'me', lat: me?.lat ?? null, lng: me?.lng ?? null });
  }, [ready, me]);

  useEffect(() => {
    if (ready && pick) post({ type: 'pick', lat: pick.value?.lat ?? null, lng: pick.value?.lng ?? null, color: pick.color, g: glyph(pick.icon ?? 'location') });
  }, [ready, pick]);

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
