// Medium Android home screen widget (4×2): weather on the left, the 3 newest open reports near you on the right.
// Display only: expo-widgets can't open the app from an Android widget yet.
import { Box, Column, Row, Text } from '@expo/ui/jetpack-compose';
import { background, cornerRadius, fillMaxHeight, fillMaxSize, fillMaxWidth, paddingAll, size, width } from '@expo/ui/jetpack-compose/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

import type { NearbyWidgetProps } from './types';

const NearbyWidget = (props: NearbyWidgetProps, environment: WidgetEnvironment) => {
  'widget';
  const dark = environment.colorScheme === 'dark';
  const bg = dark ? '#17252B' : '#FFFFFF';
  const text = dark ? '#E8EEF0' : '#14212A';
  const muted = dark ? '#9FB0B6' : '#5B6B72';
  return (
    <Row modifiers={[fillMaxSize(), background(bg), paddingAll(12)]} horizontalArrangement={{ spacedBy: 12 }}>
      <Column
        modifiers={[width(96), fillMaxHeight(), background('#2F6FDB'), cornerRadius(16), paddingAll(10)]}
        verticalArrangement="spaceBetween">
        <Text color="#FFFFFF" style={{ fontSize: 11 }} maxLines={1}>
          {props.place || 'Weather'}
        </Text>
        <Text color="#FFFFFF" style={{ fontSize: 26, fontWeight: 'bold' }} maxLines={1}>
          {props.temp || '–'}
        </Text>
        <Text color="#FFFFFF" style={{ fontSize: 11 }} maxLines={2}>
          {props.condition}
          {props.rain ? ` · ${props.rain}` : ''}
        </Text>
      </Column>
      <Column modifiers={[fillMaxWidth(), fillMaxHeight()]} verticalArrangement={{ spacedBy: 6 }}>
        <Text color={muted} style={{ fontSize: 12 }} maxLines={1}>
          {props.updated ? `Reports ${props.areaLabel} · ${props.updated}` : `Reports ${props.areaLabel}`}
        </Text>
        {!props.signedIn ? (
          <Text color={text} style={{ fontSize: 13 }} maxLines={3}>
            Open Ansam Moris and sign in to see reports near you.
          </Text>
        ) : props.items.length === 0 ? (
          <Text color={text} style={{ fontSize: 13 }} maxLines={3}>
            No open reports here right now.
          </Text>
        ) : (
          props.items.map((item) => (
            <Row key={item.id} verticalAlignment="center" horizontalArrangement={{ spacedBy: 8 }}>
              <Box modifiers={[size(10, 10), background(item.color), cornerRadius(5)]} />
              <Text color={text} style={{ fontSize: 13 }} maxLines={1}>
                {`${item.title} · ${item.status}`}
              </Text>
            </Row>
          ))
        )}
      </Column>
    </Row>
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
