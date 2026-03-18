import React from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';

const C = Colors.dark;

export interface ViewOption {
  key: string;
  label: string;
  icon: string;
}

interface ViewSwitcherProps {
  options: ViewOption[];
  selected: string;
  onSelect: (key: string) => void;
  compact?: boolean;
}

export function ViewSwitcher({ options, selected, onSelect, compact }: ViewSwitcherProps) {
  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      {options.map((opt) => {
        const active = opt.key === selected;
        return (
          <Pressable
            key={opt.key}
            onPress={() => {
              if (!active) {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onSelect(opt.key);
              }
            }}
            style={[styles.pill, active && styles.pillActive]}
          >
            <Ionicons
              name={opt.icon as any}
              size={compact ? 14 : 16}
              color={active ? C.text : C.textTertiary}
            />
            {!compact && (
              <Text style={[styles.pillText, active && styles.pillTextActive]}>
                {opt.label}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: C.surface,
    borderRadius: 12,
    padding: 3,
    gap: 2,
  },
  containerCompact: {
    borderRadius: 10,
    padding: 2,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  pillActive: {
    backgroundColor: C.cardElevated,
  },
  pillText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: C.textTertiary,
  },
  pillTextActive: {
    color: C.text,
  },
});
