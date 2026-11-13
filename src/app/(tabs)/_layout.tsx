import { usePathname } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';

import { FloatingTabBar, TABS } from '@/components/tab-bar';
import { TabSwipe } from '@/components/tab-swipe';
import { useTheme } from '@/theme';

const ROUTES = TABS.map((t) => t.name);

export default function TabsLayout() {
  const { colors } = useTheme();
  const pathname = usePathname();
  const current = pathname === '/' ? 'index' : pathname.split('/')[1];
  const index = Math.max(0, ROUTES.indexOf(current));

  return (
    <TabSwipe routes={ROUTES} index={index} disabled={current === 'map'}>
      <Tabs
        tabBar={(props) => <FloatingTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          animation: 'none', // tab switches are instant
          sceneStyle: { backgroundColor: colors.background },
        }}>
        {TABS.map((t) => (
          <Tabs.Screen key={t.name} name={t.name} options={{ title: t.label }} />
        ))}
      </Tabs>
    </TabSwipe>
  );
}
