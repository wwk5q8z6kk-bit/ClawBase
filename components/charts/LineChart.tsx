import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Circle, Defs, LinearGradient as SvgGradient, Stop, Line, Text as SvgText } from 'react-native-svg';
import Colors from '@/constants/colors';

const C = Colors.dark;

interface DataSeries {
  label: string;
  data: number[];
  color: string;
  filled?: boolean;
}

interface LineChartProps {
  series: DataSeries[];
  labels?: string[];
  width?: number;
  height?: number;
  showDots?: boolean;
  showGrid?: boolean;
  showLabels?: boolean;
  showLegend?: boolean;
}

export function LineChart({
  series,
  labels,
  width = 300,
  height = 160,
  showDots = true,
  showGrid = true,
  showLabels = true,
  showLegend = true,
}: LineChartProps) {
  if (series.length === 0 || series[0].data.length < 2) {
    return <View style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: C.textTertiary, fontSize: 12 }}>No data</Text>
    </View>;
  }

  const padL = 30;
  const padR = 10;
  const padT = 10;
  const padB = showLabels ? 24 : 10;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;

  const allVals = series.flatMap(s => s.data);
  const maxVal = Math.max(...allVals, 1);
  const minVal = Math.min(...allVals, 0);
  const range = maxVal - minVal || 1;

  const numPoints = series[0].data.length;

  const getX = (i: number) => padL + (i / (numPoints - 1)) * chartW;
  const getY = (v: number) => padT + (1 - (v - minVal) / range) * chartH;

  const gridLines = 4;
  const gridStep = range / gridLines;

  return (
    <View>
      <Svg width={width} height={height}>
        <Defs>
          {series.map((s, si) => (
            <SvgGradient key={si} id={`fill-${si}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={s.color} stopOpacity="0.3" />
              <Stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </SvgGradient>
          ))}
        </Defs>

        {showGrid && Array.from({ length: gridLines + 1 }, (_, i) => {
          const val = minVal + i * gridStep;
          const y = getY(val);
          return (
            <React.Fragment key={`g-${i}`}>
              <Line x1={padL} y1={y} x2={padL + chartW} y2={y} stroke={C.border} strokeWidth={0.5} />
              <SvgText x={padL - 4} y={y + 3} fill={C.textTertiary} fontSize={8} textAnchor="end">
                {Math.round(val)}
              </SvgText>
            </React.Fragment>
          );
        })}

        {series.map((s, si) => {
          const linePath = s.data.map((v, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(v)}`).join(' ');

          const areaPath = s.filled !== false
            ? `${linePath} L ${getX(numPoints - 1)} ${padT + chartH} L ${getX(0)} ${padT + chartH} Z`
            : '';

          return (
            <React.Fragment key={`s-${si}`}>
              {s.filled !== false && <Path d={areaPath} fill={`url(#fill-${si})`} />}
              <Path d={linePath} fill="none" stroke={s.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              {showDots && s.data.map((v, i) => (
                <Circle key={i} cx={getX(i)} cy={getY(v)} r={3} fill={s.color} stroke={C.background} strokeWidth={1.5} />
              ))}
            </React.Fragment>
          );
        })}

        {showLabels && labels && labels.map((label, i) => (
          <SvgText key={i} x={getX(i)} y={height - 4} fill={C.textTertiary} fontSize={8} textAnchor="middle">
            {label}
          </SvgText>
        ))}
      </Svg>

      {showLegend && series.length > 1 && (
        <View style={styles.legend}>
          {series.map((s, i) => (
            <View key={i} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: s.color }]} />
              <Text style={styles.legendText}>{s.label}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    color: C.textSecondary,
  },
});
