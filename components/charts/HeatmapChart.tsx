import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';
import Colors from '@/constants/colors';

const C = Colors.dark;

interface HeatmapChartProps {
  data: number[][];
  rowLabels: string[];
  colLabels: string[];
  width?: number;
  height?: number;
  colorScale?: [string, string];
  title?: string;
}

export function HeatmapChart({
  data,
  rowLabels,
  colLabels,
  width = 300,
  height = 160,
  colorScale = [C.background, C.primary],
  title,
}: HeatmapChartProps) {
  if (data.length === 0) return null;

  const padL = 36;
  const padT = title ? 20 : 6;
  const padR = 6;
  const padB = 18;
  const gridW = width - padL - padR;
  const gridH = height - padT - padB;

  const rows = data.length;
  const cols = data[0]?.length || 0;
  const cellW = gridW / cols;
  const cellH = gridH / rows;

  const allVals = data.flat();
  const maxVal = Math.max(...allVals, 1);

  const interpolateColor = (t: number) => {
    const r1 = parseInt(colorScale[0].slice(1, 3), 16);
    const g1 = parseInt(colorScale[0].slice(3, 5), 16);
    const b1 = parseInt(colorScale[0].slice(5, 7), 16);
    const r2 = parseInt(colorScale[1].slice(1, 3), 16);
    const g2 = parseInt(colorScale[1].slice(3, 5), 16);
    const b2 = parseInt(colorScale[1].slice(5, 7), 16);
    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);
    return `rgb(${r},${g},${b})`;
  };

  return (
    <View>
      <Svg width={width} height={height}>
        {title && (
          <SvgText x={width / 2} y={14} fill={C.text} fontSize={11} fontWeight="600" textAnchor="middle">
            {title}
          </SvgText>
        )}

        {data.map((row, ri) =>
          row.map((val, ci) => {
            const t = maxVal > 0 ? val / maxVal : 0;
            return (
              <Rect
                key={`${ri}-${ci}`}
                x={padL + ci * cellW + 1}
                y={padT + ri * cellH + 1}
                width={cellW - 2}
                height={cellH - 2}
                rx={3}
                fill={t > 0 ? interpolateColor(t) : C.cardElevated}
                opacity={t > 0 ? 0.3 + t * 0.7 : 0.3}
              />
            );
          })
        )}

        {rowLabels.map((label, i) => (
          <SvgText key={`r-${i}`} x={padL - 4} y={padT + i * cellH + cellH / 2 + 3} fill={C.textTertiary} fontSize={8} textAnchor="end">
            {label}
          </SvgText>
        ))}

        {colLabels.map((label, i) => (
          <SvgText key={`c-${i}`} x={padL + i * cellW + cellW / 2} y={height - 4} fill={C.textTertiary} fontSize={7} textAnchor="middle">
            {label}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
}
