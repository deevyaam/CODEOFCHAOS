import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useState } from 'react';

import type { IconName } from '@/components/ui';

import { BUCKETS, publicUrl, supabase } from './supabase';

export type Category = 'safety' | 'transport' | 'health' | 'environment' | 'other';
export type Status = 'reported' | 'sent' | 'in_progress' | 'fixed';
export type MediaItem = { path: string; type: 'image' | 'video'; bucket?: string };

export type Report = {
  id: string;
  category: Category;
  title: string;
  description: string;
  status: Status;
  sent_to: string | null;
  lat: number | null;
  lng: number | null;
  place_name: string | null;
  town: string | null;
  occurred_at: string | null;
  is_anonymous: boolean;
  author_id: string | null;
  pin_color: string | null;
  pin_icon: string | null;
  media: MediaItem[];
  me_too_count: number;
  comment_count: number;
  hidden: boolean;
  created_at: string;
  updated_at: string;
};

export type Comment = {
  id: string;
  report_id: string;
  user_id: string | null;
  body: string;
  media: MediaItem[];
  status_change: Status | null;
  sent_to: string | null;
  by_reporter: boolean;
  hidden: boolean;
  created_at: string;
};

export const CATEGORIES: { value: Category; label: string; icon: IconName; color: string; hint: string }[] = [
  { value: 'safety', label: 'Safety', icon: 'shield-checkmark', color: '#D64545', hint: 'Lighting, dangerous spots, crime risks' },
  { value: 'transport', label: 'Transport', icon: 'bus', color: '#2F6FDB', hint: 'Roads, potholes, buses, traffic' },
  { value: 'health', label: 'Health', icon: 'medkit', color: '#2E9D5B', hint: 'Water, sanitation, clinics' },
  { value: 'environment', label: 'Environment', icon: 'leaf', color: '#3E8E41', hint: 'Waste, flooding, beaches, trees' },
  { value: 'other', label: 'Other', icon: 'ellipsis-horizontal-circle', color: '#6B7A86', hint: 'Anything else in your area' },
];

export const STATUSES: { value: Status; label: string; icon: IconName }[] = [
  { value: 'reported', label: 'Reported', icon: 'flag' },
  { value: 'sent', label: 'Sent to an authority', icon: 'paper-plane' },
  { value: 'in_progress', label: 'In progress', icon: 'construct' },
  { value: 'fixed', label: 'Fixed', icon: 'checkmark-circle' },
];

export const PIN_COLORS = ['#D64545', '#E8664A', '#E3A008', '#2E9D5B', '#0E7C74', '#2F6FDB', '#7A5AF8', '#6B7A86'];
export const PIN_ICONS: IconName[] = [
  'warning', 'flash', 'water', 'trash', 'car', 'bus', 'bulb', 'construct', 'leaf', 'medkit', 'home', 'paw',
];

export const categoryInfo = (c: Category) => CATEGORIES.find((x) => x.value === c) ?? CATEGORIES[4];
export const statusInfo = (s: Status) => STATUSES.find((x) => x.value === s) ?? STATUSES[0];

export function mediaUrl(m: MediaItem) {
  return publicUrl(m.bucket ?? BUCKETS.reportMedia, m.path);
}

export type ReportFilter = {
  category?: Category | 'all';
  status?: Status | 'open' | 'all';
  search?: string;
  sort?: 'newest' | 'confirmed' | 'oldest';
  mine?: boolean;
  /** Only reports created at least this many days ago. */
  olderThanDays?: number;
  limit?: number;
};

export async function fetchReports(f: ReportFilter = {}, userId?: string) {
  let q = supabase.from('reports').select('*');
  if (f.category && f.category !== 'all') q = q.eq('category', f.category);
  if (f.status === 'open') q = q.neq('status', 'fixed');
  else if (f.status && f.status !== 'all') q = q.eq('status', f.status);
  if (f.olderThanDays) q = q.lt('created_at', new Date(Date.now() - f.olderThanDays * 86_400_000).toISOString());
  if (f.search?.trim()) {
    const s = f.search.trim().replace(/[%,()]/g, ' ');
    q = q.or(`title.ilike.%${s}%,description.ilike.%${s}%,town.ilike.%${s}%,place_name.ilike.%${s}%`);
  }
  if (f.mine && userId) {
    const { data: owned } = await supabase.from('report_owners').select('report_id').eq('user_id', userId);
    const ids = (owned ?? []).map((o) => o.report_id as string);
    if (!ids.length) return [] as Report[];
    q = q.in('id', ids);
  }
  q =
    f.sort === 'confirmed'
      ? q.order('me_too_count', { ascending: false }).order('created_at', { ascending: false })
      : q.order('created_at', { ascending: f.sort === 'oldest' });
  const { data, error } = await q.limit(f.limit ?? 100);
  if (error) throw error;
  return (data ?? []) as Report[];
}

export function useReports(filter: ReportFilter, userId?: string) {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const key = JSON.stringify(filter);

  const load = useCallback(async () => {
    try {
      setError(null);
      setReports(await fetchReports(JSON.parse(key) as ReportFilter, userId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load reports');
    } finally {
      setLoading(false);
    }
  }, [key, userId]);

  useEffect(() => {
    // load() sets state only after its first await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const ch = supabase
      .channel(`reports-${key}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load, key]);

  return { reports, loading, error, reload: load };
}

export async function myVotes(userId: string, reportIds: string[]) {
  if (!reportIds.length) return new Set<string>();
  const { data } = await supabase.from('report_votes').select('report_id').eq('user_id', userId).in('report_id', reportIds);
  return new Set((data ?? []).map((v) => v.report_id as string));
}

export async function setMeToo(reportId: string, userId: string, on: boolean) {
  return on
    ? supabase.from('report_votes').insert({ report_id: reportId, user_id: userId })
    : supabase.from('report_votes').delete().eq('report_id', reportId).eq('user_id', userId);
}

/** Upload a picked photo/video. Anonymous reports go to an anonymous folder with no user id in the path. */
export async function uploadMedia(
  bucket: string,
  folder: string,
  asset: { uri: string; mimeType?: string | null; type?: string | null },
): Promise<MediaItem> {
  const isVideo = asset.type === 'video' || asset.mimeType?.startsWith('video/');
  const contentType = asset.mimeType ?? (isVideo ? 'video/mp4' : 'image/jpeg');
  const ext = contentType.split('/')[1]?.replace('quicktime', 'mov') ?? 'jpg';
  const path = `${folder}/${Crypto.randomUUID()}.${ext}`;
  const body = await (await fetch(asset.uri)).arrayBuffer();
  const { error } = await supabase.storage.from(bucket).upload(path, body, { contentType, upsert: false });
  if (error) throw error;
  return { path, type: isVideo ? 'video' : 'image', bucket };
}

export function timeAgo(iso: string) {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} d ago`;
  return new Date(iso).toLocaleDateString('en-MU', { day: 'numeric', month: 'short', year: 'numeric' });
}
