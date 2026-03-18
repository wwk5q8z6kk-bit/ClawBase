import React from 'react';
import { View } from 'react-native';
import Svg, { Text as SvgText } from 'react-native-svg';
import Colors from '@/constants/colors';

const C = Colors.dark;

interface WordItem {
  text: string;
  weight: number;
  color?: string;
}

interface WordCloudProps {
  words: WordItem[];
  width?: number;
  height?: number;
  minFontSize?: number;
  maxFontSize?: number;
}

export function WordCloud({ words, width = 300, height = 140, minFontSize = 9, maxFontSize = 24 }: WordCloudProps) {
  if (words.length === 0) return null;

  const sorted = [...words].sort((a, b) => b.weight - a.weight).slice(0, 30);
  const maxWeight = Math.max(...sorted.map(w => w.weight), 1);
  const minWeight = Math.min(...sorted.map(w => w.weight), 0);
  const weightRange = maxWeight - minWeight || 1;

  const colors = [C.primary, C.secondary, C.accent, C.coral, C.amber, C.purple];

  const placed: { x: number; y: number; w: number; h: number }[] = [];

  const positions = sorted.map((word, i) => {
    const t = (word.weight - minWeight) / weightRange;
    const fontSize = minFontSize + t * (maxFontSize - minFontSize);
    const estW = word.text.length * fontSize * 0.6;
    const estH = fontSize * 1.3;

    let bestX = width / 2;
    let bestY = height / 2;
    let found = false;

    for (let attempt = 0; attempt < 80; attempt++) {
      const angle = (attempt * 137.508 * Math.PI) / 180;
      const r = 8 + attempt * 3.5;
      const cx = width / 2 + Math.cos(angle) * r * (width / height);
      const cy = height / 2 + Math.sin(angle) * r * 0.7;

      const px = cx - estW / 2;
      const py = cy - estH / 2;

      if (px < 2 || py < 2 || px + estW > width - 2 || py + estH > height - 2) continue;

      const overlap = placed.some(p =>
        px < p.x + p.w && px + estW > p.x && py < p.y + p.h && py + estH > p.y
      );

      if (!overlap) {
        bestX = cx;
        bestY = cy;
        found = true;
        placed.push({ x: px, y: py, w: estW, h: estH });
        break;
      }
    }

    if (!found) return null;

    return {
      text: word.text,
      x: bestX,
      y: bestY + fontSize * 0.35,
      fontSize,
      color: word.color || colors[i % colors.length],
      opacity: 0.5 + t * 0.5,
    };
  }).filter(Boolean);

  return (
    <Svg width={width} height={height}>
      {positions.map((p, i) => p && (
        <SvgText
          key={i}
          x={p.x}
          y={p.y}
          fill={p.color}
          fontSize={p.fontSize}
          textAnchor="middle"
          fontWeight={p.fontSize > maxFontSize * 0.6 ? '700' : '500'}
          opacity={p.opacity}
        >
          {p.text}
        </SvgText>
      ))}
    </Svg>
  );
}
