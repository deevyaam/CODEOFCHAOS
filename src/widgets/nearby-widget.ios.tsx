// Medium iPhone home screen widget: weather on the left, the 3 newest open reports near you on the right.
// Tapping a report opens it; tapping elsewhere opens the Reports list.
import { HStack, Link, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { background, containerBackground, cornerRadius, font, foregroundStyle, padding, widgetURL } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

import type { NearbyWidgetProps } from './types';

const NearbyWidget = (props: NearbyWidgetProps, environment: WidgetEnvironment) => {
  'widget';
  const dark = environment.colorScheme === 'dark';
  const text = dark ? '#E8EEF0' : '#14212A';
  const muted = dark ? '#9FB0B6' : '#5B6B72';
  return (
    <HStack
      spacing={12}
      modifiers={[containerBackground(dark ? '#17252B' : '#FFFFFF', 'widget'), widgetURL('ansammoris://reports')]}>
      <VStack alignment="leading" spacing={2} modifiers={[padding({ all: 10 }), background('#2F6FDB'), cornerRadius(16)]}>
        <Text modifiers={[font({ size: 11 }), foregroundStyle('#FFFFFF')]}>{props.place || 'Weather'}</Text>
        <Spacer />
        <Text modifiers={[font({ size: 26, weight: 'bold' }), foregroundStyle('#FFFFFF')]}>{props.temp || '–'}</Text>
        <Text modifiers={[font({ size: 11 }), foregroundStyle('#FFFFFF')]}>
          {props.condition}
          {props.rain ? ` · ${props.rain}` : ''}
        </Text>
      </VStack>
      <VStack alignment="leading" spacing={6}>
        <Text modifiers={[font({ size: 12 }), foregroundStyle(muted)]}>
          {props.updated ? `Reports ${props.areaLabel} · ${props.updated}` : `Reports ${props.areaLabel}`}
        </Text>
        {!props.signedIn ? (
          <Text modifiers={[font({ size: 13 }), foregroundStyle(text)]}>Open Ansam Moris and sign in to see reports near you.</Text>
        ) : props.items.length === 0 ? (
          <Text modifiers={[font({ size: 13 }), foregroundStyle(text)]}>No open reports here right now.</Text>
        ) : (
          props.items.map((item) => (
            <Link key={item.id} destination={`ansammoris://report/${item.id}`}>
              <HStack spacing={8}>
                <Text modifiers={[font({ size: 12 }), foregroundStyle(item.color)]}>●</Text>
                <Text modifiers={[font({ size: 13 }), foregroundStyle(text)]}>{`${item.title} · ${item.status}`}</Text>
              </HStack>
            </Link>
          ))
        )}
        <Spacer />
      </VStack>
    </HStack>
  );
};

export default createWidget('AnsamNearby', NearbyWidget, {
  signedIn: false,
  place: '',
  temp: '',
  condition: '',
  rain: '',
  areaLabel: 'near you',
  items: [],
  updated: '',
});
