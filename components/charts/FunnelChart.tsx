import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Colors from '@/constants/colors';

const C = Colors.dark;

interface FunnelStep {
  label: string;
  value: number;
  color: string;
}

interface FunnelChartProps {
  steps: FunnelStep[];
  height?: number;
  width?: number;
}

export function FunnelChart({ steps, height = 160, width = 280 }: FunnelChartProps) {
  if (steps.length === 0) return null;

  const maxVal = Math.max(...steps.map((s) => s.value), 1);
  const stepHeight = height / steps.length;
  const minWidth = width * 0.2;

  return (
    <View style={[styles.container, { height }]}>
      {steps.map((step, i) => {
        const topPct = i === 0 ? 1 : steps[i - 1].value / maxVal;
        const botPct = step.value / maxVal;
        const topW = minWidth + (width - minWidth) * topPct;
        const botW = minWidth + (width - minWidth) * botPct;

        const topLeft = (width - topW) / 2;
        const botLeft = (width - botW) / 2;

        const y = i * stepHeight;
        const gap = 2;

        const d = `
          M ${topLeft} ${y + gap}
          L ${topLeft + topW} ${y + gap}
          L ${botLeft + botW} ${y + stepHeight}
          L ${botLeft} ${y + stepHeight}
          Z
        `;

        return (
          <View key={i} style={styles.stepRow}>
            <View style={styles.stepLabel}>
              <Text style={styles.stepLabelText} numberOfLines={1}>{step.label}</Text>
              <Text style={[styles.stepValue, { color: step.color }]}>{step.value}</Text>
            </View>
          </View>
        );
      })}

      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width={width} height={height}>
          {steps.map((step, i) => {
            const topPct = i === 0 ? 1 : steps[i - 1].value / maxVal;
            const botPct = step.value / maxVal;
            const topW = minWidth + (width - minWidth) * topPct;
            const botW = minWidth + (width - minWidth) * botPct;
            const topLeft = (width - topW) / 2;
            const botLeft = (width - botW) / 2;
            const y = i * stepHeight;
            const gap = 2;

            const d = `
              M ${topLeft} ${y + gap}
              L ${topLeft + topW} ${y + gap}
              L ${botLeft + botW} ${y + stepHeight}
              L ${botLeft} ${y + stepHeight}
              Z
            `;

            return (
              <Path
                key={i}
                d={d}
                fill={step.color + '25'}
                stroke={step.color + '40'}
                strokeWidth={1}
              />
            );
          })}
        </Svg>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    position: 'relative',
  },
  stepRow: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
    zIndex: 1,
  },
  stepLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepLabelText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: C.text,
  },
  stepValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
  },
});
