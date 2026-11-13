// Turns a picked photo or video into a small JPEG (base64) the assistant can look at.
// Videos: the assistant sees one still frame, taken a second in.
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { videoFrame } from './video-frame';
import type { PickedMedia } from './report-draft';

/** Longest side sent to the model. Gemma 3 looks at images at 896 px, so anything larger is wasted upload. */
const MAX_SIDE = 896;

export const isVideo = (m: PickedMedia) => m.type === 'video' || !!m.mimeType?.startsWith('video/');

export async function forAssistant(m: PickedMedia): Promise<string | null> {
  try {
    const source = isVideo(m) ? await videoFrame(m.uri) : m.uri;
    if (!source) return null;
    const ctx = ImageManipulator.manipulate(source);
    const w = m.width ?? 0;
    const h = m.height ?? 0;
    // Unknown size: resize by width, which is right for most phone photos.
    if (!w || !h || Math.max(w, h) > MAX_SIDE) ctx.resize(h > w ? { height: MAX_SIDE } : { width: MAX_SIDE });
    const image = await ctx.renderAsync();
    const out = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.6, base64: true });
    return out.base64 ?? null;
  } catch {
    return null;
  }
}
