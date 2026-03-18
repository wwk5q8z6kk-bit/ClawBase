import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Rect, Text as SvgText } from 'react-native-svg';
import Colors from '@/constants/colors';

const C = Colors.dark;

interface SankeyNode {
  id: string;
  label: string;
  color: string;
}

interface SankeyLink {
  source: string;
  target: string;
  value: number;
}

interface SankeyDiagramProps {
  nodes: SankeyNode[];
  links: SankeyLink[];
  width?: number;
  height?: number;
}

export function SankeyDiagram({ nodes, links, width = 300, height = 180 }: SankeyDiagramProps) {
  if (nodes.length === 0) return null;

  const padL = 4;
  const padR = 4;
  const padT = 6;
  const padB = 6;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;

  const nodeIds = nodes.map(n => n.id);
  const hasIncoming = new Set(links.map(l => l.target));
  const hasOutgoing = new Set(links.map(l => l.source));

  const columns: string[][] = [];
  const placed = new Set<string>();

  const sources = nodeIds.filter(id => !hasIncoming.has(id));
  if (sources.length > 0) {
    columns.push(sources);
    sources.forEach(id => placed.add(id));
  }

  let maxIter = 10;
  while (placed.size < nodeIds.length && maxIter-- > 0) {
    const nextCol: string[] = [];
    for (const id of nodeIds) {
      if (placed.has(id)) continue;
      const incomingSources = links.filter(l => l.target === id).map(l => l.source);
      if (incomingSources.every(s => placed.has(s))) {
        nextCol.push(id);
      }
    }
    if (nextCol.length === 0) {
      const remaining = nodeIds.filter(id => !placed.has(id));
      nextCol.push(...remaining);
    }
    columns.push(nextCol);
    nextCol.forEach(id => placed.add(id));
  }

  const numCols = columns.length;
  const colWidth = 24;
  const colSpacing = numCols > 1 ? (chartW - colWidth) / (numCols - 1) : 0;

  const nodeMap = new Map<string, { x: number; y: number; h: number; color: string; label: string }>();

  const totalVal = Math.max(...columns.map(col => {
    return col.reduce((sum, id) => {
      const inVal = links.filter(l => l.target === id).reduce((s, l) => s + l.value, 0);
      const outVal = links.filter(l => l.source === id).reduce((s, l) => s + l.value, 0);
      return sum + Math.max(inVal, outVal, 1);
    }, 0);
  }), 1);

  columns.forEach((col, ci) => {
    const x = padL + ci * colSpacing;
    const colTotal = col.reduce((sum, id) => {
      const inVal = links.filter(l => l.target === id).reduce((s, l) => s + l.value, 0);
      const outVal = links.filter(l => l.source === id).reduce((s, l) => s + l.value, 0);
      return sum + Math.max(inVal, outVal, 1);
    }, 0);

    const gap = 4;
    const availH = chartH - gap * (col.length - 1);
    let yOffset = padT;

    col.forEach(id => {
      const node = nodes.find(n => n.id === id);
      const inVal = links.filter(l => l.target === id).reduce((s, l) => s + l.value, 0);
      const outVal = links.filter(l => l.source === id).reduce((s, l) => s + l.value, 0);
      const nodeVal = Math.max(inVal, outVal, 1);
      const h = Math.max((nodeVal / colTotal) * availH, 12);

      nodeMap.set(id, {
        x, y: yOffset, h,
        color: node?.color || C.accent,
        label: node?.label || id,
      });
      yOffset += h + gap;
    });
  });

  const sourceOffsets = new Map<string, number>();
  const targetOffsets = new Map<string, number>();

  return (
    <View>
      <Svg width={width} height={height}>
        {links.map((link, i) => {
          const src = nodeMap.get(link.source);
          const tgt = nodeMap.get(link.target);
          if (!src || !tgt) return null;

          const srcOff = sourceOffsets.get(link.source) || 0;
          const tgtOff = targetOffsets.get(link.target) || 0;

          const srcTotal = links.filter(l => l.source === link.source).reduce((s, l) => s + l.value, 0) || 1;
          const tgtTotal = links.filter(l => l.target === link.target).reduce((s, l) => s + l.value, 0) || 1;

          const linkHSrc = (link.value / srcTotal) * src.h;
          const linkHTgt = (link.value / tgtTotal) * tgt.h;

          const x1 = src.x + colWidth;
          const y1 = src.y + srcOff + linkHSrc / 2;
          const x2 = tgt.x;
          const y2 = tgt.y + tgtOff + linkHTgt / 2;
          const cx = (x1 + x2) / 2;

          sourceOffsets.set(link.source, srcOff + linkHSrc);
          targetOffsets.set(link.target, tgtOff + linkHTgt);

          const d = `
            M ${x1} ${y1 - linkHSrc / 2}
            C ${cx} ${y1 - linkHSrc / 2}, ${cx} ${y2 - linkHTgt / 2}, ${x2} ${y2 - linkHTgt / 2}
            L ${x2} ${y2 + linkHTgt / 2}
            C ${cx} ${y2 + linkHTgt / 2}, ${cx} ${y1 + linkHSrc / 2}, ${x1} ${y1 + linkHSrc / 2}
            Z
          `;

          return <Path key={i} d={d} fill={src.color + '20'} stroke={src.color + '30'} strokeWidth={0.5} />;
        })}

        {Array.from(nodeMap.entries()).map(([id, n]) => (
          <React.Fragment key={id}>
            <Rect x={n.x} y={n.y} width={colWidth} height={n.h} rx={4} fill={n.color + '60'} stroke={n.color} strokeWidth={1} />
            <SvgText
              x={n.x + colWidth / 2}
              y={n.y + n.h / 2 + 3}
              fill={C.text}
              fontSize={8}
              textAnchor="middle"
              fontWeight="600"
            >
              {n.label.length > 6 ? n.label.slice(0, 5) + '..' : n.label}
            </SvgText>
          </React.Fragment>
        ))}
      </Svg>
    </View>
  );
}
