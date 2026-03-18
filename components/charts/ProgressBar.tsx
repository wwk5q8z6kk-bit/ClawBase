import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import Colors from '@/constants/colors';

const C = Colors.dark;

interface ProgressBarProps {
  value: number;
  max?: number;
  color?: string;
  label?: string;
  showPercentage?: boolean;
  height?: number;
  animated?: boolean;
}

export function ProgressBar({
  value,
  max = 100,
  color = C.secondary,
  label,
  showPercentage = true,
  height = 8,
  animated = true,
}: ProgressBarProps) {
  const pct = Math.min(value / (max || 1), 1);
  const widthAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (animated) {
      Animated.timing(widthAnim, {
        toValue: pct,
        duration: 600,
        delay: 100,
        useNativeDriver: false,
      }).start();
    } else {
      widthAnim.setValue(pct);
    }
  }, [pct, animated, widthAnim]);

  const animatedWidth = widthAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.container}>
      {(label || showPercentage) && (
        <View style={styles.header}>
          {label && <Text style={styles.label}>{label}</Text>}
          {showPercentage && <Text style={[styles.pct, { color }]}>{Math.round(pct * 100)}%</Text>}
        </View>
      )}
      <View style={[styles.track, { height }]}>
        <Animated.View style={[styles.fill, { backgroundColor: color, width: animatedWidth, height }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  label: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: C.textSecondary,
  },
  pct: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
  track: {
    width: '100%',
    backgroundColor: C.cardElevated,
    borderRadius: 100,
    overflow: 'hidden',
  },
  fill: {
    borderRadius: 100,
  },
});
