// One still frame from a local video, for the assistant (web): draw it on a canvas and return a data URI.
export function videoFrame(uri: string): Promise<string | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const done = (v: string | null) => {
      clearTimeout(timer);
      video.removeAttribute('src');
      video.load();
      resolve(v);
    };
    const timer = setTimeout(() => done(null), 8000);
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.onloadeddata = () => {
      video.currentTime = Math.min(1, (video.duration || 0) / 2);
    };
    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d')?.drawImage(video, 0, 0);
        done(canvas.toDataURL('image/jpeg', 0.8));
      } catch {
        done(null);
      }
    };
    video.onerror = () => done(null);
    video.src = uri;
  });
}
