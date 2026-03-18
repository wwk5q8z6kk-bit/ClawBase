import React from 'react';
import { View } from 'react-native';
import Svg, { Polyline, Defs, LinearGradient as SvgGradient, Stop, Rect } from 'react-native-svg';
import Colors from '@/constants/colors';

const C = Colors.dark;

interface SparkLineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  strokeWidth?: number;
}

export function SparkLine({ data, width = 80, height = 30, color = C.secondary, strokeWidth = 2 }: SparkLineProps) {
  if (data.length < 2) return <View style={{ width, height }} />;

  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const padding = 2;

  const points = data
    .map((val, i) => {
      const x = padding + (i / (data.length - 1)) * (width - padding * 2);
      const y = padding + (1 - (val - min) / range) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <Svg width={width} height={height}>
      <Polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
