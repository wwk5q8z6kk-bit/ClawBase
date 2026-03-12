import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

export type MindMapNodeType = 'idea' | 'task' | 'memory' | 'event' | 'contact';

export interface MindMapNode {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  type: MindMapNodeType;
}

export interface MindMapEdge {
  from: string;
  to: string;
}

export interface MindMap {
  id: string;
  title: string;
  nodes: MindMapNode[];
  edges: MindMapEdge[];
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = '@clawbase:mindmaps';

export const NODE_TYPE_COLORS: Record<MindMapNodeType, string> = {
  idea: '#5B7FFF',
  task: '#FF5A3C',
  memory: '#00D4AA',
  event: '#FFB020',
  contact: '#8B7FFF',
};

export const ALL_NODE_TYPES: MindMapNodeType[] = ['idea', 'task', 'memory', 'event', 'contact'];

export function getNodeColor(type: MindMapNodeType): string {
  return NODE_TYPE_COLORS[type];
}

async function loadAll(): Promise<MindMap[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.warn('[mindmap] Failed to load mind maps:', e);
    return [];
  }
}

async function saveAll(maps: MindMap[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(maps));
}

export async function getAllMindMaps(): Promise<MindMap[]> {
  return loadAll();
}

export async function getMindMap(id: string): Promise<MindMap | undefined> {
  const all = await loadAll();
  return all.find((m) => m.id === id);
}

export async function createMindMap(title: string): Promise<MindMap> {
  const all = await loadAll();
  const map: MindMap = {
    id: Crypto.randomUUID(),
    title,
    nodes: [
      {
        id: Crypto.randomUUID(),
        text: title,
        x: 0,
        y: 0,
        width: 160,
        height: 60,
        color: NODE_TYPE_COLORS.idea,
        type: 'idea',
      },
    ],
    edges: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  all.push(map);
  await saveAll(all);
  return map;
}

export async function updateMindMap(updated: MindMap): Promise<void> {
  const all = await loadAll();
  const idx = all.findIndex((m) => m.id === updated.id);
  if (idx !== -1) {
    all[idx] = { ...updated, updatedAt: Date.now() };
    await saveAll(all);
  }
}

export async function deleteMindMap(id: string): Promise<void> {
  const all = await loadAll();
  await saveAll(all.filter((m) => m.id !== id));
}

export function createNode(
  text: string,
  x: number,
  y: number,
  type: MindMapNodeType = 'idea',
): MindMapNode {
  return {
    id: Crypto.randomUUID(),
    text,
    x,
    y,
    width: 160,
    height: 60,
    color: NODE_TYPE_COLORS[type],
    type,
  };
}

export function addEdge(edges: MindMapEdge[], from: string, to: string): MindMapEdge[] {
  if (from === to) return edges;
  const exists = edges.some((e) => (e.from === from && e.to === to) || (e.from === to && e.to === from));
  if (exists) return edges;
  return [...edges, { from, to }];
}

export function removeEdge(edges: MindMapEdge[], from: string, to: string): MindMapEdge[] {
  return edges.filter(
    (e) => !((e.from === from && e.to === to) || (e.from === to && e.to === from)),
  );
}

export function removeNode(map: MindMap, nodeId: string): MindMap {
  return {
    ...map,
    nodes: map.nodes.filter((n) => n.id !== nodeId),
    edges: map.edges.filter((e) => e.from !== nodeId && e.to !== nodeId),
    updatedAt: Date.now(),
  };
}

export function generateRadialNodes(
  ideas: string[],
  centerX: number,
  centerY: number,
  sourceNodeId: string,
  existingEdges: MindMapEdge[],
): { nodes: MindMapNode[]; edges: MindMapEdge[] } {
  const radius = 180;
  const angleStep = (2 * Math.PI) / Math.max(ideas.length, 1);
  const startAngle = -Math.PI / 2;
  const newNodes: MindMapNode[] = [];
  let edges = [...existingEdges];

  for (let i = 0; i < ideas.length; i++) {
    const angle = startAngle + i * angleStep;
    const x = centerX + radius * Math.cos(angle);
    const y = centerY + radius * Math.sin(angle);
    const node = createNode(ideas[i], x, y, 'idea');
    newNodes.push(node);
    edges = addEdge(edges, sourceNodeId, node.id);
  }

  return { nodes: newNodes, edges };
}

const SIMULATED_EXPANSIONS: string[][] = [
  ['Explore alternatives', 'Define success metrics', 'Identify blockers', 'Research competitors', 'Create timeline'],
  ['Break into subtasks', 'Assign ownership', 'Set deadlines', 'Review dependencies', 'Plan resources'],
  ['Gather feedback', 'Prototype solution', 'Test assumptions', 'Document findings', 'Iterate on design'],
  ['Analyze root cause', 'Map stakeholders', 'Estimate effort', 'Prioritize impact', 'Schedule review'],
];

export function getSimulatedIdeas(existingTexts: string[]): string[] {
  const idx = Math.floor(Math.random() * SIMULATED_EXPANSIONS.length);
  const ideas = SIMULATED_EXPANSIONS[idx];
  const count = 3 + Math.floor(Math.random() * 3);
  return ideas.slice(0, count);
}

export function buildAIPrompt(nodeTexts: string[]): string {
  const joined = nodeTexts.join(', ');
  return `Based on these ideas: [${joined}], suggest 3-5 related ideas. Return each on a new line. Only output the ideas, no numbering, no explanation.`;
}

export function parseAIResponse(response: string): string[] {
  return response
    .split('\n')
    .map((line) => line.replace(/^\d+[\.\)\-]\s*/, '').replace(/^[-*]\s*/, '').trim())
    .filter((line) => line.length > 0 && line.length < 200)
    .slice(0, 7);
}
