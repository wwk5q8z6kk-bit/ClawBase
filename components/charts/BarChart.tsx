import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated, Platform } from 'react-native';
import Colors from '@/constants/colors';

const C = Colors.dark;

interface BarItem {
  label: string;
  value: number;
  color: string;
}

interface BarChartProps {
  data: BarItem[];
  height?: number;
  animated?: boolean;
}

export function BarChart({ data, height = 100, animated = true }: BarChartProps) {
  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const animValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (animated) {
      Animated.timing(animValue, {
        toValue: 1,
        duration: 600,
        delay: 200,
        useNativeDriver: false,
      }).start();
    } else {
      animValue.setValue(1);
    }
  }, [animated, animValue]);

  return (
    <View style={[styles.container, { height }]}>
      <View style={styles.barsRow}>
        {data.map((item, i) => {
          const pct = item.value / maxVal;
          const barHeight = animValue.interpolate({
            inputRange: [0, 1],
            outputRange: [0, pct * (height - 24)],
          });

          return (
            <View key={i} style={styles.barCol}>
              <View style={styles.barWrapper}>
                <Animated.View
                  style={[
                    styles.bar,
                    {
                      backgroundColor: item.color,
                      height: barHeight,
                    },
                  ]}
                />
              </View>
              <Text style={styles.barLabel} numberOfLines={1}>
                {item.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  barsRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  barWrapper: {
    flex: 1,
    width: '100%',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  bar: {
    width: '70%',
    borderRadius: 4,
    minHeight: 2,
  },
  barLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 9,
    color: C.textTertiary,
    textAlign: 'center',
  },
});
