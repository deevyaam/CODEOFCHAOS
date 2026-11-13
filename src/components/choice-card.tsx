// A big, tappable answer: icon, plain title, one-line hint and a clear tick when chosen.
// Used wherever someone picks one option from a few (report type, place, name, a person's role).
import { StyleSheet, View } from 'react-native';

import { radius, spacing, useTheme } from '@/theme';

import { Icon, PressableScale, Text, type IconName } from './ui';

export function ChoiceCard({
  icon,
  iconBg,
  title,
  hint,
  selected,
  busy,
  disabled,
  onPress,
}: {
  icon: IconName;
  iconBg?: string;
  title: string;
  hint: string;
  selected: boolean;
  busy?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, busy, disabled }}
      accessibilityLabel={`${title}. ${hint}`}
      style={[
        styles.choice,
        { backgroundColor: selected ? colors.primarySoft : colors.surface, borderColor: selected ? colors.primary : 'transparent' },
        disabled && !selected && { opacity: 0.5 },
      ]}>
      <View style={[styles.choiceIcon, { backgroundColor: iconBg ?? (selected ? colors.primary : colors.surfaceMuted) }]}>
        <Icon name={icon} size={26} color={iconBg || selected ? '#fff' : colors.textMuted} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="headline">{title}</Text>
        <Text variant="caption" muted>{busy ? 'Finding where you are…' : hint}</Text>
      </View>
      <View style={[styles.radio, { borderColor: selected ? colors.primary : colors.textFaint, backgroundColor: selected ? colors.primary : 'transparent' }]}>
        {selected && <Icon name="checkmark" size={18} color={colors.onPrimary} />}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  choice: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 76, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 2 },
  choiceIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  radio: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
