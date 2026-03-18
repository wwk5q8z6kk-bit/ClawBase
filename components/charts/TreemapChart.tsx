import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';
import Colors from '@/constants/colors';

const C = Colors.dark;

interface TreemapItem {
  label: string;
  value: number;
  color: string;
}

interface TreemapChartProps {
  items: TreemapItem[];
  width?: number;
  height?: number;
}

interface LayoutRect {
  x: number;
  y: number;
  w: number;
  h: number;
  item: TreemapItem;
}

function squarify(items: TreemapItem[], x: number, y: number, w: number, h: number): LayoutRect[] {
  if (items.length === 0) return [];
  if (items.length === 1) return [{ x, y, w, h, item: items[0] }];

  const total = items.reduce((sum, it) => sum + it.value, 0);
  if (total <= 0) return [];

  const sorted = [...items].sort((a, b) => b.value - a.value);
  const rects: LayoutRect[] = [];

  let cx = x, cy = y, cw = w, ch = h;
  let remaining = [...sorted];
  let remTotal = total;

  while (remaining.length > 0) {
    const isHorizontal = cw >= ch;
    const side = isHorizontal ? ch : cw;

    let row: TreemapItem[] = [];
    let rowTotal = 0;
    let bestRatio = Infinity;

    for (const item of remaining) {
      row.push(item);
      rowTotal += item.value;

      const rowFraction = rowTotal / remTotal;
      const rowSize = isHorizontal ? cw * rowFraction : ch * rowFraction;

      let worstRatio = 0;
      for (const r of row) {
        const frac = r.value / rowTotal;
        const cellSide = side * frac;
        const ratio = Math.max(rowSize / cellSide, cellSide / rowSize);
        worstRatio = Math.max(worstRatio, ratio);
      }

      if (worstRatio <= bestRatio || row.length === remaining.length) {
        bestRatio = worstRatio;
        if (row.length === remaining.length) break;
      } else {
        row.pop();
        rowTotal -= item.value;
        break;
      }
    }

    const rowFraction = rowTotal / remTotal;

    if (isHorizontal) {
      const rowW = cw * rowFraction;
      let ry = cy;
      for (const r of row) {
        const cellH = (r.value / rowTotal) * ch;
        rects.push({ x: cx, y: ry, w: rowW, h: cellH, item: r });
        ry += cellH;
      }
      cx += rowW;
      cw -= rowW;
    } else {
      const rowH = ch * rowFraction;
      let rx = cx;
      for (const r of row) {
        const cellW = (r.value / rowTotal) * cw;
        rects.push({ x: rx, y: cy, w: cellW, h: rowH, item: r });
        rx += cellW;
      }
      cy += rowH;
      ch -= rowH;
    }

    remaining = remaining.filter(it => !row.includes(it));
    remTotal -= rowTotal;

    if (cw <= 0 || ch <= 0) break;
  }

  return rects;
}

export function TreemapChart({ items, width = 300, height = 160 }: TreemapChartProps) {
  if (items.length === 0) return null;

  const gap = 2;
  const rects = squarify(items, gap, gap, width - gap * 2, height - gap * 2);

  return (
    <Svg width={width} height={height}>
      {rects.map((r, i) => (
        <React.Fragment key={i}>
          <Rect
            x={r.x + 1}
            y={r.y + 1}
            width={Math.max(r.w - 2, 0)}
            height={Math.max(r.h - 2, 0)}
            rx={4}
            fill={r.item.color + '30'}
            stroke={r.item.color + '60'}
            strokeWidth={1}
          />
          {r.w > 30 && r.h > 16 && (
            <SvgText
              x={r.x + r.w / 2}
              y={r.y + r.h / 2 - 2}
              fill={C.text}
              fontSize={Math.min(10, r.w / 6)}
              textAnchor="middle"
              fontWeight="600"
            >
              {r.item.label.length > Math.floor(r.w / 7) ? r.item.label.slice(0, Math.floor(r.w / 7) - 1) + '..' : r.item.label}
            </SvgText>
          )}
          {r.w > 30 && r.h > 28 && (
            <SvgText
              x={r.x + r.w / 2}
              y={r.y + r.h / 2 + 10}
              fill={r.item.color}
              fontSize={Math.min(9, r.w / 7)}
              textAnchor="middle"
            >
              {r.item.value}
            </SvgText>
          )}
        </React.Fragment>
      ))}
    </Svg>
  );
}
