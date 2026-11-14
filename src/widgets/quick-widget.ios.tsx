// Small iPhone home screen widget: open reports near you; tapping it opens "Report a problem".
import { Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { containerBackground, font, foregroundStyle, padding, widgetURL } from '@expo/ui/swift-ui/modifiers';
import { createWidget } from 'expo-widgets';

import type { QuickWidgetProps } from './types';

const QuickWidget = (props: QuickWidgetProps) => {
  'widget';
  return (
    <VStack
      alignment="leading"
      spacing={4}
      modifiers={[containerBackground('#0E7C74', 'widget'), widgetURL('ansammoris://report/new'), padding({ all: 2 })]}>
      <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle('#FFFFFF')]}>Ansam Moris</Text>
      <Spacer />
      <Text modifiers={[font({ size: 34, weight: 'bold' }), foregroundStyle('#FFFFFF')]}>
        {props.signedIn ? String(props.count) : '–'}
      </Text>
      <Text modifiers={[font({ size: 12 }), foregroundStyle('#FFFFFF')]}>
        {props.signedIn ? `open report${props.count === 1 ? '' : 's'} ${props.areaLabel}` : 'Sign in to see reports near you'}
      </Text>
      <Spacer />
      <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle('#FFFFFF')]}>＋ Report a problem</Text>
    </VStack>
  );
};

export default createWidget('AnsamQuick', QuickWidget, { signedIn: false, count: 0, areaLabel: 'near you', updated: '' });
