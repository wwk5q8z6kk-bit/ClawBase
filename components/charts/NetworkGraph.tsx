import React, { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Text as SvgText } from 'react-native-svg';
import Colors from '@/constants/colors';

const C = Colors.dark;

interface GraphNode {
  id: string;
  label: string;
  color?: string;
  size?: number;
}

interface GraphEdge {
  source: string;
  target: string;
  weight?: number;
}

interface NetworkGraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  width?: number;
  height?: number;
}

export function NetworkGraph({ nodes, edges, width = 300, height = 200 }: NetworkGraphProps) {
  const positions = useMemo(() => {
    if (nodes.length === 0) return new Map<string, { x: number; y: number }>();

    const pos = new Map<string, { x: number; y: number }>();
    const cx = width / 2;
    const cy = height / 2;
    const maxR = Math.min(width, height) / 2 - 30;

    const edgeCounts = new Map<string, number>();
    nodes.forEach(n => edgeCounts.set(n.id, 0));
    edges.forEach(e => {
      edgeCounts.set(e.source, (edgeCounts.get(e.source) || 0) + 1);
      edgeCounts.set(e.target, (edgeCounts.get(e.target) || 0) + 1);
    });

    const sorted = [...nodes].sort((a, b) => (edgeCounts.get(b.id) || 0) - (edgeCounts.get(a.id) || 0));

    if (sorted.length === 1) {
      pos.set(sorted[0].id, { x: cx, y: cy });
    } else if (sorted.length <= 3) {
      sorted.forEach((n, i) => {
        const angle = (i / sorted.length) * Math.PI * 2 - Math.PI / 2;
        pos.set(n.id, { x: cx + Math.cos(angle) * maxR * 0.5, y: cy + Math.sin(angle) * maxR * 0.5 });
      });
    } else {
      pos.set(sorted[0].id, { x: cx, y: cy });

      const innerCount = Math.min(Math.ceil(sorted.length * 0.3), sorted.length - 1);
      const outerCount = sorted.length - 1 - innerCount;

      for (let i = 1; i <= innerCount; i++) {
        const angle = ((i - 1) / innerCount) * Math.PI * 2 - Math.PI / 2;
        pos.set(sorted[i].id, {
          x: cx + Math.cos(angle) * maxR * 0.4,
          y: cy + Math.sin(angle) * maxR * 0.4,
        });
      }

      for (let i = 0; i < outerCount; i++) {
        const angle = (i / outerCount) * Math.PI * 2 - Math.PI / 2 + 0.3;
        pos.set(sorted[innerCount + 1 + i].id, {
          x: cx + Math.cos(angle) * maxR * 0.85,
          y: cy + Math.sin(angle) * maxR * 0.85,
        });
      }
    }

    return pos;
  }, [nodes, edges, width, height]);

  if (nodes.length === 0) return null;

  return (
    <Svg width={width} height={height}>
      {edges.map((edge, i) => {
        const src = positions.get(edge.source);
        const tgt = positions.get(edge.target);
        if (!src || !tgt) return null;
        return (
          <Line
            key={i}
            x1={src.x}
            y1={src.y}
            x2={tgt.x}
            y2={tgt.y}
            stroke={C.textTertiary}
            strokeWidth={Math.min((edge.weight || 1) * 0.5 + 0.5, 3)}
            opacity={0.4}
          />
        );
      })}
      {nodes.map(node => {
        const p = positions.get(node.id);
        if (!p) return null;
        const r = node.size || 8;
        const color = node.color || C.accent;
        return (
          <React.Fragment key={node.id}>
            <Circle cx={p.x} cy={p.y} r={r + 2} fill={color + '20'} />
            <Circle cx={p.x} cy={p.y} r={r} fill={color + '80'} stroke={color} strokeWidth={1.5} />
            <SvgText
              x={p.x}
              y={p.y + r + 11}
              fill={C.textSecondary}
              fontSize={8}
              textAnchor="middle"
            >
              {node.label.length > 10 ? node.label.slice(0, 9) + '..' : node.label}
            </SvgText>
          </React.Fragment>
        );
      })}
    </Svg>
  );
}
