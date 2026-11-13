// Reads short on-screen text aloud, for people who find reading hard or aren't confident with phones.
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useState } from 'react';

export function useReadAloud() {
  const [speaking, setSpeaking] = useState(false);

  // Stop talking when the screen closes.
  useEffect(() => () => void Speech.stop(), []);

  const stop = useCallback(() => {
    Speech.stop();
    setSpeaking(false);
  }, []);

  const toggle = useCallback(
    (text: string) => {
      if (speaking) return stop();
      Speech.stop();
      setSpeaking(true);
      const done = () => setSpeaking(false);
      Speech.speak(text, { language: 'en-GB', rate: 0.9, onDone: done, onStopped: done, onError: done });
    },
    [speaking, stop],
  );

  return { speaking, toggle, stop };
}
