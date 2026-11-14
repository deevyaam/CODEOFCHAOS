// Small Android home screen widget (2×2): open reports near you. Android widgets can't open the app on tap
// with expo-widgets yet, so it only shows information and a hint.
import { Column, Text } from '@expo/ui/jetpack-compose';
import { background, fillMaxSize, paddingAll } from '@expo/ui/jetpack-compose/modifiers';
import { createWidget } from 'expo-widgets';

import type { QuickWidgetProps } from './types';

const QuickWidget = (props: QuickWidgetProps) => {
  'widget';
  return (
    <Column modifiers={[fillMaxSize(), background('#0E7C74'), paddingAll(14)]} verticalArrangement="spaceBetween">
      <Text color="#FFFFFF" style={{ fontSize: 12, fontWeight: '600' }} maxLines={1}>
        Ansam Moris
      </Text>
      <Column>
        <Text color="#FFFFFF" style={{ fontSize: 32, fontWeight: 'bold' }} maxLines={1}>
          {props.signedIn ? String(props.count) : '–'}
        </Text>
        <Text color="#FFFFFF" style={{ fontSize: 12 }} maxLines={2}>
          {props.signedIn ? `open report${props.count === 1 ? '' : 's'} ${props.areaLabel}` : 'Sign in to see reports near you'}
        </Text>
      </Column>
      <Text color="#CFEDEA" style={{ fontSize: 11 }} maxLines={2}>
        {props.updated ? `Open the app to report · ${props.updated}` : 'Open the app to report a problem'}
      </Text>
    </Column>
  );
};

export default createWidget('AnsamQuick', QuickWidget, { signedIn: false, count: 0, areaLabel: 'near you', updated: '' });
