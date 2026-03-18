import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, Line, Text as SvgText } from 'react-native-svg';
import Colors from '@/constants/colors';

const C = Colors.dark;

interface ScatterPoint {
  x: number;
  y: number;
  label?: string;
  color?: string;
  size?: number;
}

interface ScatterPlotProps {
  points: ScatterPoint[];
  width?: number;
  height?: number;
  xLabel?: string;
  yLabel?: string;
  defaultColor?: string;
  showGrid?: boolean;
}

export function ScatterPlot({
  points,
  width = 300,
  height = 160,
  xLabel,
  yLabel,
  defaultColor = C.accent,
  showGrid = true,
}: ScatterPlotProps) {
  if (points.length === 0) {
    return <View style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: C.textTertiary, fontSize: 12 }}>No data</Text>
    </View>;
  }

  const padL = 30;
  const padR = 10;
  const padT = 10;
  const padB = xLabel ? 28 : 14;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;

  const xVals = points.map(p => p.x);
  const yVals = points.map(p => p.y);
  const xMin = Math.min(...xVals);
  const xMax = Math.max(...xVals);
  const yMin = Math.min(...yVals);
  const yMax = Math.max(...yVals);
  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;

  const getX = (v: number) => padL + ((v - xMin) / xRange) * chartW;
  const getY = (v: number) => padT + (1 - (v - yMin) / yRange) * chartH;

  return (
    <View>
      <Svg width={width} height={height}>
        {showGrid && Array.from({ length: 5 }, (_, i) => {
          const y = padT + (i / 4) * chartH;
          const x = padL + (i / 4) * chartW;
          return (
            <React.Fragment key={i}>
              <Line x1={padL} y1={y} x2={padL + chartW} y2={y} stroke={C.border} strokeWidth={0.5} />
              <Line x1={x} y1={padT} x2={x} y2={padT + chartH} stroke={C.border} strokeWidth={0.5} />
            </React.Fragment>
          );
        })}

        <Line x1={padL} y1={padT + chartH} x2={padL + chartW} y2={padT + chartH} stroke={C.textTertiary} strokeWidth={0.5} />
        <Line x1={padL} y1={padT} x2={padL} y2={padT + chartH} stroke={C.textTertiary} strokeWidth={0.5} />

        {points.map((p, i) => (
          <Circle
            key={i}
            cx={getX(p.x)}
            cy={getY(p.y)}
            r={p.size || 4}
            fill={(p.color || defaultColor) + '80'}
            stroke={p.color || defaultColor}
            strokeWidth={1.5}
          />
        ))}

        {xLabel && (
          <SvgText x={padL + chartW / 2} y={height - 2} fill={C.textTertiary} fontSize={9} textAnchor="middle">
            {xLabel}
          </SvgText>
        )}
        {yLabel && (
          <SvgText x={8} y={padT + chartH / 2} fill={C.textTertiary} fontSize={9} textAnchor="middle" rotation="-90" originX={8} originY={padT + chartH / 2}>
            {yLabel}
          </SvgText>
        )}
      </Svg>
    </View>
  );
}
