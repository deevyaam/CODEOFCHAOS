// One still frame from a local video, for the assistant (iOS and Android). The web version is video-frame.web.ts.
import { createVideoPlayer } from 'expo-video';

export async function videoFrame(uri: string) {
  const player = createVideoPlayer(uri);
  try {
    const [frame] = await player.generateThumbnailsAsync(1);
    return frame ?? null;
  } finally {
    player.release();
  }
}
