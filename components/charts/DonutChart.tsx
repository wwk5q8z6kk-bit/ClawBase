import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Colors from '@/constants/colors';

const C = Colors.dark;

interface DonutSegment {
  value: number;
  color: string;
}

interface DonutChartProps {
  segments: DonutSegment[];
  size?: number;
  strokeWidth?: number;
  centerLabel?: string;
  centerValue?: string;
}

export function DonutChart({ segments, size = 80, strokeWidth = 8, centerLabel, centerValue }: DonutChartProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;

  let accumulated = 0;

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
        {segments.map((seg, i) => {
          const pct = seg.value / total;
          const dashLength = circumference * pct;
          const dashOffset = circumference * (1 - accumulated) + circumference * 0.25;
          accumulated += pct;

          if (seg.value <= 0) return null;

          return (
            <Circle
              key={i}
              cx={center}
              cy={center}
              r={radius}
              stroke={seg.color}
              strokeWidth={strokeWidth}
              fill="none"
              strokeDasharray={`${dashLength} ${circumference - dashLength}`}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
              transform={`rotate(-90 ${center} ${center})`}
            />
          );
        })}
      </Svg>
      {(centerLabel || centerValue) && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            {centerValue && <Text style={s.centerValue}>{centerValue}</Text>}
            {centerLabel && <Text style={s.centerLabel}>{centerLabel}</Text>}
          </View>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  centerValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: C.text,
  },
  centerLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 9,
    color: C.textTertiary,
    marginTop: 1,
  },
});
