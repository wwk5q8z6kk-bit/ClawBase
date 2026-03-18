import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import Colors from '@/constants/colors';

const C = Colors.dark;

interface RadialGaugeProps {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  label?: string;
  showValue?: boolean;
  unit?: string;
}

export function RadialGauge({
  value,
  max = 100,
  size = 80,
  strokeWidth = 8,
  color = C.secondary,
  label,
  showValue = true,
  unit = '%',
}: RadialGaugeProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;
  const pct = Math.min(value / max, 1);
  const dashLength = circumference * pct;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={C.cardElevated}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${dashLength} ${circumference - dashLength}`}
          strokeDashoffset={circumference * 0.25}
          strokeLinecap="round"
          transform={`rotate(-90 ${center} ${center})`}
        />
      </Svg>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          {showValue && (
            <Text style={[styles.value, { fontSize: size > 60 ? 14 : 11 }]}>
              {Math.round(pct * 100)}{unit}
            </Text>
          )}
          {label && <Text style={[styles.label, { fontSize: size > 60 ? 9 : 7 }]}>{label}</Text>}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  value: {
    fontFamily: 'Inter_700Bold',
    color: C.text,
  },
  label: {
    fontFamily: 'Inter_400Regular',
    color: C.textTertiary,
    marginTop: 1,
  },
});
