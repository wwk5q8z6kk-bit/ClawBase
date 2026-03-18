import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import Svg, { Rect, Line, Circle, Text as SvgText, Path } from 'react-native-svg';
import Colors from '@/constants/colors';

const C = Colors.dark;

interface GanttTask {
  id: string;
  label: string;
  start: number;
  end: number;
  color: string;
  progress?: number;
  isMilestone?: boolean;
  dependsOn?: string[];
}

interface GanttChartProps {
  tasks: GanttTask[];
  width?: number;
  rowHeight?: number;
}

export function GanttChart({ tasks, width = 600, rowHeight = 32 }: GanttChartProps) {
  if (tasks.length === 0) return null;

  const labelW = 100;
  const padT = 24;
  const padR = 10;
  const chartW = width - labelW - padR;
  const chartH = tasks.length * rowHeight;
  const totalH = chartH + padT + 10;

  const allStarts = tasks.filter(t => !t.isMilestone).map(t => t.start);
  const allEnds = tasks.filter(t => !t.isMilestone).map(t => t.end);
  const milestones = tasks.filter(t => t.isMilestone).map(t => t.start);

  const minTime = Math.min(...allStarts, ...milestones);
  const maxTime = Math.max(...allEnds, ...milestones);
  const timeRange = maxTime - minTime || 86400000;

  const getX = (t: number) => labelW + ((t - minTime) / timeRange) * chartW;

  const dayMs = 86400000;
  const numDays = Math.ceil(timeRange / dayMs);
  const dayLabels: { x: number; label: string }[] = [];
  const step = Math.max(1, Math.ceil(numDays / 8));

  for (let i = 0; i <= numDays; i += step) {
    const t = minTime + i * dayMs;
    const d = new Date(t);
    dayLabels.push({
      x: getX(t),
      label: `${d.getMonth() + 1}/${d.getDate()}`,
    });
  }

  const taskMap = new Map(tasks.map(t => [t.id, t]));

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={{ width, minWidth: width }}>
        <Svg width={width} height={totalH}>
          {dayLabels.map((dl, i) => (
            <React.Fragment key={i}>
              <Line x1={dl.x} y1={padT} x2={dl.x} y2={padT + chartH} stroke={C.border} strokeWidth={0.5} />
              <SvgText x={dl.x} y={padT - 6} fill={C.textTertiary} fontSize={8} textAnchor="middle">
                {dl.label}
              </SvgText>
            </React.Fragment>
          ))}

          {tasks.map((task, i) => {
            const y = padT + i * rowHeight;

            return (
              <React.Fragment key={task.id}>
                <Line x1={labelW} y1={y + rowHeight} x2={width - padR} y2={y + rowHeight} stroke={C.border} strokeWidth={0.3} />

                <SvgText x={4} y={y + rowHeight / 2 + 3} fill={C.textSecondary} fontSize={9}>
                  {task.label.length > 13 ? task.label.slice(0, 12) + '..' : task.label}
                </SvgText>

                {task.isMilestone ? (
                  <React.Fragment>
                    <Path
                      d={`M ${getX(task.start)} ${y + rowHeight / 2 - 6} L ${getX(task.start) + 6} ${y + rowHeight / 2} L ${getX(task.start)} ${y + rowHeight / 2 + 6} L ${getX(task.start) - 6} ${y + rowHeight / 2} Z`}
                      fill={task.color}
                    />
                  </React.Fragment>
                ) : (
                  <React.Fragment>
                    <Rect
                      x={getX(task.start)}
                      y={y + 6}
                      width={Math.max(getX(task.end) - getX(task.start), 4)}
                      height={rowHeight - 12}
                      rx={4}
                      fill={task.color + '30'}
                      stroke={task.color + '60'}
                      strokeWidth={1}
                    />
                    {task.progress !== undefined && task.progress > 0 && (
                      <Rect
                        x={getX(task.start)}
                        y={y + 6}
                        width={Math.max((getX(task.end) - getX(task.start)) * task.progress, 2)}
                        height={rowHeight - 12}
                        rx={4}
                        fill={task.color + '80'}
                      />
                    )}
                  </React.Fragment>
                )}

                {task.dependsOn && task.dependsOn.map(depId => {
                  const dep = taskMap.get(depId);
                  if (!dep) return null;
                  const depIdx = tasks.findIndex(t => t.id === depId);
                  if (depIdx < 0) return null;

                  const fromX = dep.isMilestone ? getX(dep.start) : getX(dep.end);
                  const fromY = padT + depIdx * rowHeight + rowHeight / 2;
                  const toX = task.isMilestone ? getX(task.start) - 6 : getX(task.start);
                  const toY = y + rowHeight / 2;

                  return (
                    <Path
                      key={`dep-${depId}-${task.id}`}
                      d={`M ${fromX} ${fromY} L ${fromX + 8} ${fromY} L ${fromX + 8} ${toY} L ${toX} ${toY}`}
                      fill="none"
                      stroke={C.textTertiary}
                      strokeWidth={1}
                      opacity={0.5}
                    />
                  );
                })}
              </React.Fragment>
            );
          })}
        </Svg>
      </View>
    </ScrollView>
  );
}
