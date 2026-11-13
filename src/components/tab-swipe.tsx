// Swipe left/right anywhere on a tab page to change tabs — except on the map and over sideways scrollers.
// Wrap any horizontal scroller in <NoTabSwipe> so its own swipes win.
import { router } from 'expo-router';
import { createContext, useContext, useMemo, useRef, type ReactNode } from 'react';
import { Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import { GestureDetector, GestureStateManager, usePanGesture } from 'react-native-gesture-handler';

const BlockCtx = createContext<{ block: () => void }>({ block: () => {} });

const SWIPE_DISTANCE = 70;
const SWIPE_VELOCITY = 600;

export function TabSwipe({
  children,
  routes,
  index,
  disabled,
}: {
  children: ReactNode;
  routes: string[];
  index: number;
  disabled?: boolean;
}) {
  const blocked = useRef(false);
  const start = useRef<{ x: number; y: number } | null>(null);

  const ctx = useMemo(
    () => ({
      block: () => {
        blocked.current = true;
      },
    }),
    [],
  );

  const go = (dir: 1 | -1) => {
    const next = routes[index + dir];
    if (next) router.navigate((next === 'index' ? '/' : `/${next}`) as never);
  };

  const gesture = usePanGesture({
    runOnJS: true,
    enabled: !disabled && Platform.OS !== 'web',
    manualActivation: true,
    onTouchesDown: (e) => {
      const t = e.allTouches[0];
      start.current = t ? { x: t.absoluteX, y: t.absoluteY } : null;
    },
    onTouchesMove: (e) => {
      const t = e.allTouches[0];
      if (!t || !start.current) return;
      if (blocked.current) return GestureStateManager.fail(e.handlerTag);
      const dx = t.absoluteX - start.current.x;
      const dy = t.absoluteY - start.current.y;
      if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) GestureStateManager.fail(e.handlerTag);
      else if (Math.abs(dx) > 24 && Math.abs(dx) > Math.abs(dy) * 2) GestureStateManager.activate(e.handlerTag);
    },
    onDeactivate: (e) => {
      if (e.canceled) return;
      if (e.translationX < -SWIPE_DISTANCE || e.velocityX < -SWIPE_VELOCITY) go(1);
      else if (e.translationX > SWIPE_DISTANCE || e.velocityX > SWIPE_VELOCITY) go(-1);
    },
    onFinalize: () => {
      blocked.current = false;
      start.current = null;
    },
  });

  return (
    <BlockCtx.Provider value={ctx}>
      <GestureDetector gesture={gesture}>
        <View style={{ flex: 1 }} collapsable={false}>
          {children}
        </View>
      </GestureDetector>
    </BlockCtx.Provider>
  );
}

/** Marks a sideways scroller: touches that start inside it never change tabs. */
export function NoTabSwipe({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { block } = useContext(BlockCtx);
  return (
    <View style={style} onTouchStart={block}>
      {children}
    </View>
  );
}
