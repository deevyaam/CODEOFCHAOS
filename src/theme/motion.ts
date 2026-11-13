// Motion rules:
// - critically damped springs by default (no overshoot)
// - a little bounce only after a flick (velocity carried in)
// - press feedback scales to 0.97 in 120 ms
// - everything is interruptible (springs/timings started from the current value)
// - Reduce Motion: ReduceMotion.System makes Reanimated jump to the end state
import { Easing, ReduceMotion, type WithSpringConfig, type WithTimingConfig } from 'react-native-reanimated';

export const spring: WithSpringConfig = {
  dampingRatio: 1,
  duration: 380,
  reduceMotion: ReduceMotion.System,
};

export const springFlick = (velocity: number): WithSpringConfig => ({
  dampingRatio: 0.82,
  duration: 480,
  velocity,
  reduceMotion: ReduceMotion.System,
});

export const PRESS_SCALE = 0.97;

export const pressTiming: WithTimingConfig = {
  duration: 120,
  easing: Easing.out(Easing.quad),
  reduceMotion: ReduceMotion.System,
};

export const fadeTiming: WithTimingConfig = {
  duration: 220,
  easing: Easing.out(Easing.cubic),
  reduceMotion: ReduceMotion.System,
};

/** Velocity (pt/s) above which a release counts as a flick. */
export const FLICK_VELOCITY = 800;
