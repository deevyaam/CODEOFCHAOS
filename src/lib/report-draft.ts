// Hands a report drafted by the assistant to the "Report a problem" screen.
// Kept in memory only: the photos are local files on this phone, and the person still checks and sends it themselves.
import type { Category } from './reports';

export type PickedMedia = { uri: string; mimeType?: string | null; type?: string | null; width?: number; height?: number };

export type ReportDraft = {
  category: Category;
  title: string;
  description: string;
  media: PickedMedia[];
};

let pending: ReportDraft | null = null;

export const setReportDraft = (d: ReportDraft) => {
  pending = d;
};

/** Read without clearing (safe to call from a useState initialiser, which may run twice in development). */
export const peekReportDraft = () => pending;

export const clearReportDraft = () => {
  pending = null;
};
