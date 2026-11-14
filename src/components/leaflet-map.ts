// The OpenStreetMap (Leaflet) map shared by the web app (in an iframe) and Android (in a WebView).
// Android uses it instead of Google Maps so the app needs no Google Maps key; iPhones keep Apple Maps.
// The page and the app talk through small messages: the app sends reports, zones, "me", pick mode and the icon
// font; the page sends back "ready", "select" and "pick".
import Ionicons from '@expo/vector-icons/Ionicons';
import { Asset } from 'expo-asset';
import { useEffect, useState } from 'react';

import { pinOf } from '@/lib/reports';

import type { ReportMapProps } from './report-map.types';
import type { IconName } from './ui';

/** The icon as a character of the Ionicons font, which the map page loads itself (see iconFont). */
export const glyph = (name: IconName) => String.fromCodePoint((Ionicons.glyphMap as Record<string, number>)[name] ?? 0xf3bc);

/** The icon font as bytes. The map page can't use the app's fonts, so the app hands the file over. */
let fontBytes: Promise<ArrayBuffer | null> | null = null;
export function iconFont() {
  fontBytes ??= (async () => {
    try {
      const source = Object.values((Ionicons as unknown as { font: Record<string, unknown> }).font)[0];
      let uri: string | null | undefined;
      if (typeof source === 'string') uri = source;
      else if (typeof source === 'number') {
        const asset = Asset.fromModule(source);
        if (!asset.localUri) await asset.downloadAsync().catch(() => undefined);
        uri = asset.localUri ?? asset.uri;
      } else uri = (source as { uri?: string })?.uri;
      return uri ? await (await fetch(uri)).arrayBuffer() : null;
    } catch {
      return null; // pins still show their colour
    }
  })();
  return fontBytes;
}

/** Bytes to base64, in chunks so large files don't overflow the call stack. */
export function toBase64(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

const LEAFLET = 'https://unpkg.com/leaflet@1.9.4/dist';

export function mapHtml(dark: boolean, start: { lat: number; lng: number; zoom: number }, layers: boolean) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
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
const send=(m)=>{m=Object.assign({__lpt:true},m); if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(m)); else parent.postMessage(m,'*');};
const esc=(t)=>String(t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const pinIcon=(color,g,sel)=>{const s=sel?40:30;return L.divIcon({className:'',html:'<div class="pin'+(sel?' sel':'')+'" style="background:'+esc(color)+'"><i aria-hidden="true">'+esc(g||'')+'</i></div>',iconSize:[s,s],iconAnchor:[s/2,Math.round(s/2+s*0.707)]});};
map.on('click',e=>{ if(pickMode) send({type:'pick',lat:e.latlng.lat,lng:e.latlng.lng}); else send({type:'select',id:null}); });
function onMsg(m){
  if(!m||!m.__lpt) return;
  if(m.type==='reports'){ markers.clearLayers(); m.items.forEach(r=>{
    L.marker([r.lat,r.lng],{icon:pinIcon(r.color,r.g,r.sel),title:r.label+': '+r.title,alt:r.label,keyboard:true}).on('click',ev=>{L.DomEvent.stopPropagation(ev);send({type:'select',id:r.id});}).addTo(markers);
  }); }
  if(m.type==='zones'){ zones.clearLayers(); m.items.forEach(z=>{
    L.circle([z.lat,z.lng],{radius:z.radius,color:z.color,weight:1,opacity:Math.min(1,z.opacity+0.3),fillColor:z.color,fillOpacity:z.opacity,interactive:true}).bindTooltip(z.label).addTo(zones);
  }); }
  if(m.type==='me'){ if(me) me.remove(); if(m.lat!=null) me=L.marker([m.lat,m.lng],{icon:L.divIcon({className:'',html:'<div class="me" title="You are here"></div>',iconSize:[18,18]})}).addTo(map); }
  if(m.type==='font'&&window.FontFace){ const buf=m.buf||(m.b64&&Uint8Array.from(atob(m.b64),c=>c.charCodeAt(0)).buffer); if(buf) new FontFace('lption',buf).load().then(f=>document.fonts.add(f)).catch(()=>{}); }
  if(m.type==='center'){ map.flyTo([m.lat,m.lng],m.zoom,{duration:m.instant?0:0.35}); }
  if(m.type==='pick'){ pickMode=true; if(pickMarker) pickMarker.remove(); if(m.lat!=null){ pickMarker=L.marker([m.lat,m.lng],{draggable:true,icon:pinIcon(m.color,m.g,true)}).addTo(map); pickMarker.on('dragend',()=>{const p=pickMarker.getLatLng();send({type:'pick',lat:p.lat,lng:p.lng});}); } }
}
window.__lpt=onMsg;
window.addEventListener('message',e=>onMsg(e.data));
send({type:'ready'});
</script></body></html>`;
}

/** Messages the page sends back. */
export type FromMap = { type: 'ready' } | { type: 'select'; id: string | null } | { type: 'pick'; lat: number; lng: number };

/**
 * Keeps the map page in step with the props. `post` delivers one message to the page; `fontAsText` sends the
 * icon font as base64 (a WebView can only pass text).
 */
export function useLeafletSync(
  { reports = [], zones = [], me, selectedId, onSelect, pick }: ReportMapProps,
  post: (m: object) => void,
  fontAsText: boolean,
) {
  const [ready, setReady] = useState(false);

  const receive = (m: FromMap) => {
    if (m.type === 'ready') setReady(true);
    if (m.type === 'select') onSelect?.(m.id);
    if (m.type === 'pick') pick?.onPick({ lat: m.lat, lng: m.lng });
  };

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, reports, selectedId]);

  useEffect(() => {
    if (!ready) return;
    iconFont().then((buf) => buf && post(fontAsText ? { type: 'font', b64: toBase64(buf) } : { type: 'font', buf: buf.slice(0) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useEffect(() => {
    if (ready) post({ type: 'zones', items: zones });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, zones]);

  useEffect(() => {
    if (ready) post({ type: 'me', lat: me?.lat ?? null, lng: me?.lng ?? null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, me]);

  useEffect(() => {
    if (ready && pick) post({ type: 'pick', lat: pick.value?.lat ?? null, lng: pick.value?.lng ?? null, color: pick.color, g: glyph(pick.icon ?? 'location') });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, pick]);

  return receive;
}
