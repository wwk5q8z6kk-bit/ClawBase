import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  PanResponder,
  Dimensions,
  Platform,
  Pressable,
  GestureResponderEvent,
  PanResponderGestureState,
  Modal,
  TextInput,
  Alert,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Line } from 'react-native-svg';
import Colors from '@/constants/colors';
import {
  MindMap,
  MindMapNode,
  MindMapNodeType,
  MindMapEdge,
  getMindMap,
  updateMindMap,
  createNode,
  addEdge,
  removeNode,
  removeEdge,
  getNodeColor,
  ALL_NODE_TYPES,
  generateRadialNodes,
  getSimulatedIdeas,
  buildAIPrompt,
  parseAIResponse,
} from '@/lib/mindmap';
import { addLink } from '@/lib/entityLinks';
import { useApp } from '@/lib/AppContext';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const NODE_TYPE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  idea: 'bulb-outline',
  task: 'checkmark-circle-outline',
  memory: 'bookmark-outline',
  event: 'calendar-outline',
  contact: 'person-outline',
};

const NODE_TYPE_LABELS: Record<MindMapNodeType, string> = {
  idea: 'Idea',
  task: 'Task',
  memory: 'Memory',
  event: 'Event',
  contact: 'Contact',
};

interface CanvasTransform {
  offsetX: number;
  offsetY: number;
  scale: number;
}

interface UndoSnapshot {
  nodes: MindMapNode[];
  edges: MindMapEdge[];
}

function MindMapNodeCard({
  node,
  selected,
  transform,
  connecting,
}: {
  node: MindMapNode;
  selected: boolean;
  transform: CanvasTransform;
  connecting: boolean;
}) {
  const screenX = (node.x - node.width / 2) * transform.scale + transform.offsetX;
  const screenY = (node.y - node.height / 2) * transform.scale + transform.offsetY;
  const w = node.width * transform.scale;
  const h = node.height * transform.scale;
  const fontSize = Math.max(10, 13 * transform.scale);

  return (
    <View
      style={[
        styles.node,
        {
          left: screenX,
          top: screenY,
          width: w,
          height: h,
          borderColor: connecting
            ? Colors.dark.secondary
            : selected
            ? '#FFFFFF'
            : node.color,
          backgroundColor: selected
            ? `${node.color}40`
            : `${node.color}20`,
          borderWidth: connecting ? 2.5 : 1.5,
        },
      ]}
      pointerEvents="none"
    >
      <Ionicons
        name={NODE_TYPE_ICONS[node.type] || 'ellipse-outline'}
        size={Math.max(12, 16 * transform.scale)}
        color={node.color}
        style={{ marginRight: 4 * transform.scale }}
      />
      <Text
        style={[styles.nodeText, { fontSize, maxWidth: w - 40 * transform.scale }]}
        numberOfLines={2}
      >
        {node.text}
      </Text>
    </View>
  );
}

export default function MindMapScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [mindMap, setMindMap] = useState<MindMap | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [connectingFromId, setConnectingFromId] = useState<string | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingNode, setEditingNode] = useState<MindMapNode | null>(null);
  const [editText, setEditText] = useState('');
  const [editType, setEditType] = useState<MindMapNodeType>('idea');
  const [undoStack, setUndoStack] = useState<UndoSnapshot[]>([]);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);

  const { gateway, gatewayStatus, createTask, createMemoryEntry, createCalendarEvent } = useApp();

  const transformRef = useRef<CanvasTransform>({
    offsetX: SCREEN_W / 2,
    offsetY: SCREEN_H / 2,
    scale: 1,
  });
  const [transform, setTransform] = useState<CanvasTransform>(transformRef.current);

  const mindMapRef = useRef<MindMap | null>(null);
  const draggingNodeRef = useRef<string | null>(null);
  const dragStartRef = useRef<{ nodeX: number; nodeY: number } | null>(null);
  const isPanningRef = useRef(false);
  const lastPanRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const pinchBaseRef = useRef<{ dist: number; scale: number } | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef<{ time: number; x: number; y: number }>({ time: 0, x: 0, y: 0 });
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didDragRef = useRef(false);

  useEffect(() => {
    mindMapRef.current = mindMap;
  }, [mindMap]);

  const didAutoCreate = useRef(false);

  useEffect(() => {
    if (id) {
      getMindMap(id).then((m) => {
        if (m) setMindMap(m);
      });
    } else if (!didAutoCreate.current) {
      didAutoCreate.current = true;
      import('@/lib/mindmap').then(async ({ createMindMap }) => {
        try {
          const map = await createMindMap('New Mind Map');
          setMindMap(map);
          router.replace({ pathname: '/mindmap', params: { id: map.id } } as any);
        } catch {
          Alert.alert('Error', 'Failed to create mind map');
          router.back();
        }
      });
    }
  }, [id]);

  const pushUndo = useCallback((map: MindMap) => {
    setUndoStack((prev) => {
      const snapshot: UndoSnapshot = {
        nodes: JSON.parse(JSON.stringify(map.nodes)),
        edges: JSON.parse(JSON.stringify(map.edges)),
      };
      const next = [...prev, snapshot];
      if (next.length > 30) next.shift();
      return next;
    });
  }, []);

  const handleUndo = useCallback(() => {
    const map = mindMapRef.current;
    if (!map) return;
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      const snapshot = next.pop()!;
      const restored: MindMap = { ...map, nodes: snapshot.nodes, edges: snapshot.edges, updatedAt: Date.now() };
      mindMapRef.current = restored;
      setMindMap(restored);
      updateMindMap(restored);
      return next;
    });
  }, []);

  const debouncedSave = useCallback((map: MindMap) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      updateMindMap(map);
    }, 500);
  }, []);

  const screenToCanvas = useCallback((sx: number, sy: number) => {
    const t = transformRef.current;
    return {
      x: (sx - t.offsetX) / t.scale,
      y: (sy - t.offsetY) / t.scale,
    };
  }, []);

  const findNodeAtRef = useCallback((sx: number, sy: number): MindMapNode | null => {
    const map = mindMapRef.current;
    if (!map) return null;
    const { x, y } = screenToCanvas(sx, sy);
    for (let i = map.nodes.length - 1; i >= 0; i--) {
      const n = map.nodes[i];
      if (
        x >= n.x - n.width / 2 &&
        x <= n.x + n.width / 2 &&
        y >= n.y - n.height / 2 &&
        y <= n.y + n.height / 2
      ) {
        return n;
      }
    }
    return null;
  }, [screenToCanvas]);

  const pinchDist = (touches: any) => {
    const dx = touches[0].pageX - touches[1].pageX;
    const dy = touches[0].pageY - touches[1].pageY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const addNewNodeAtScreen = useCallback((sx: number, sy: number) => {
    const map = mindMapRef.current;
    if (!map) return;
    pushUndo(map);
    const { x, y } = screenToCanvas(sx, sy);
    const node = createNode('New idea', x, y, 'idea');
    const updated: MindMap = { ...map, nodes: [...map.nodes, node], updatedAt: Date.now() };
    mindMapRef.current = updated;
    setMindMap(updated);
    setSelectedNodeId(node.id);
    debouncedSave(updated);
    setEditingNode(node);
    setEditText(node.text);
    setEditType(node.type);
    setEditModalVisible(true);
  }, [screenToCanvas, pushUndo, debouncedSave]);

  const openEditSheet = useCallback((node: MindMapNode) => {
    setEditingNode(node);
    setEditText(node.text);
    setEditType(node.type);
    setEditModalVisible(true);
  }, []);

  const saveEdit = useCallback(() => {
    const map = mindMapRef.current;
    if (!map || !editingNode) return;
    pushUndo(map);
    const newColor = getNodeColor(editType);
    const updatedNodes = map.nodes.map((n) =>
      n.id === editingNode.id ? { ...n, text: editText.trim() || n.text, type: editType, color: newColor } : n,
    );
    const updated: MindMap = { ...map, nodes: updatedNodes, updatedAt: Date.now() };
    mindMapRef.current = updated;
    setMindMap(updated);
    updateMindMap(updated);
    setEditModalVisible(false);
    setEditingNode(null);
  }, [editingNode, editText, editType, pushUndo]);

  const deleteSelectedNode = useCallback(() => {
    const map = mindMapRef.current;
    if (!map || !selectedNodeId) return;
    const doDelete = () => {
      pushUndo(map);
      const updated = removeNode(map, selectedNodeId);
      mindMapRef.current = updated;
      setMindMap(updated);
      setSelectedNodeId(null);
      updateMindMap(updated);
    };
    if (Platform.OS === 'web') {
      if (confirm('Delete this node and its connections?')) {
        doDelete();
      }
    } else {
      Alert.alert('Delete Node', 'Delete this node and its connections?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  }, [selectedNodeId, pushUndo]);

  const addNodeCenter = useCallback(() => {
    const map = mindMapRef.current;
    if (!map) return;
    pushUndo(map);
    const t = transformRef.current;
    const cx = (SCREEN_W / 2 - t.offsetX) / t.scale;
    const cy = (SCREEN_H / 2 - t.offsetY) / t.scale;
    const offsetX = (Math.random() - 0.5) * 80;
    const offsetY = (Math.random() - 0.5) * 80;
    const node = createNode('New idea', cx + offsetX, cy + offsetY, 'idea');
    const updated: MindMap = { ...map, nodes: [...map.nodes, node], updatedAt: Date.now() };
    mindMapRef.current = updated;
    setMindMap(updated);
    setSelectedNodeId(node.id);
    debouncedSave(updated);
    setEditingNode(node);
    setEditText(node.text);
    setEditType(node.type);
    setEditModalVisible(true);
  }, [pushUndo, debouncedSave]);

  const handleConnectionTap = useCallback((node: MindMapNode) => {
    const map = mindMapRef.current;
    if (!map || !connectingFromId) return;
    if (connectingFromId === node.id) {
      setConnectingFromId(null);
      return;
    }
    pushUndo(map);
    const newEdges = addEdge(map.edges, connectingFromId, node.id);
    const updated: MindMap = { ...map, edges: newEdges, updatedAt: Date.now() };
    mindMapRef.current = updated;
    setMindMap(updated);
    updateMindMap(updated);
    setConnectingFromId(null);
    setSelectedNodeId(node.id);
  }, [connectingFromId, pushUndo]);

  const handleAIIdeas = useCallback(async () => {
    const map = mindMapRef.current;
    if (!map || isGeneratingAI) return;

    setIsGeneratingAI(true);

    const sourceNode = selectedNodeId
      ? map.nodes.find((n) => n.id === selectedNodeId)
      : null;
    const centerX = sourceNode ? sourceNode.x : 0;
    const centerY = sourceNode ? sourceNode.y : 0;
    const sourceId = sourceNode?.id || (map.nodes.length > 0 ? map.nodes[0].id : null);

    if (!sourceId) {
      setIsGeneratingAI(false);
      return;
    }

    const nodeTexts = map.nodes.map((n) => n.text);

    try {
      let ideas: string[];

      if (gatewayStatus === 'connected') {
        const prompt = buildAIPrompt(nodeTexts);
        const responsePromise = new Promise<string>((resolve) => {
          let fullText = '';
          const unsubChunk = gateway.on('message_chunk', (event) => {
            fullText = event.data.text || fullText;
          });
          const unsubComplete = gateway.on('message_complete', (event) => {
            unsubChunk();
            unsubComplete();
            resolve(event.data?.text || fullText);
          });
          setTimeout(() => {
            unsubChunk();
            unsubComplete();
            resolve(fullText || '');
          }, 20000);
        });

        await gateway.sendChat(prompt);
        const response = await responsePromise;
        ideas = parseAIResponse(response);

        if (ideas.length === 0) {
          ideas = getSimulatedIdeas(nodeTexts);
        }
      } else {
        await new Promise((r) => setTimeout(r, 600 + Math.random() * 800));
        ideas = getSimulatedIdeas(nodeTexts);
      }

      if (ideas.length > 0) {
        pushUndo(map);
        const { nodes: newNodes, edges: newEdges } = generateRadialNodes(
          ideas,
          centerX,
          centerY,
          sourceId,
          map.edges,
        );
        const updated: MindMap = {
          ...map,
          nodes: [...map.nodes, ...newNodes],
          edges: newEdges,
          updatedAt: Date.now(),
        };
        mindMapRef.current = updated;
        setMindMap(updated);
        updateMindMap(updated);
      }
    } catch {
      await new Promise((r) => setTimeout(r, 400));
      const ideas = getSimulatedIdeas(nodeTexts);
      if (ideas.length > 0) {
        pushUndo(map);
        const { nodes: newNodes, edges: newEdges } = generateRadialNodes(
          ideas,
          centerX,
          centerY,
          sourceId,
          map.edges,
        );
        const updated: MindMap = {
          ...map,
          nodes: [...map.nodes, ...newNodes],
          edges: newEdges,
          updatedAt: Date.now(),
        };
        mindMapRef.current = updated;
        setMindMap(updated);
        updateMindMap(updated);
      }
    } finally {
      setIsGeneratingAI(false);
    }
  }, [selectedNodeId, isGeneratingAI, gatewayStatus, gateway, pushUndo]);

  const promoteNodeToEntity = useCallback(async (targetType: 'task' | 'memory' | 'event') => {
    const map = mindMapRef.current;
    if (!map || !selectedNodeId) return;
    const node = map.nodes.find((n) => n.id === selectedNodeId);
    if (!node) return;

    try {
      let entityId: string | undefined;
      let entityType: 'task' | 'memory' | 'calendar';
      let newNodeType: MindMapNodeType;
      let newColor: string;

      if (targetType === 'task') {
        const task = await createTask(node.text, 'todo', 'medium');
        entityId = task.id;
        entityType = 'task';
        newNodeType = 'task';
        newColor = getNodeColor('task');
      } else if (targetType === 'memory') {
        const mem = await createMemoryEntry({
          type: 'note',
          title: node.text,
          content: node.text,
          source: 'mindmap',
          tags: ['from:mindmap'],
          reviewStatus: 'unread',
        });
        entityId = mem?.id;
        entityType = 'memory';
        newNodeType = 'memory';
        newColor = getNodeColor('memory');
      } else {
        const now = new Date();
        const startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0).getTime();
        const endTime = startTime + 3600000;
        const evt = await createCalendarEvent({
          title: node.text,
          startTime,
          endTime,
          color: Colors.dark.amber,
          allDay: false,
          source: 'manual',
          tags: ['from:mindmap'],
        });
        entityId = evt?.id;
        entityType = 'calendar';
        newNodeType = 'event';
        newColor = getNodeColor('event');
      }

      pushUndo(map);
      const updatedNodes = map.nodes.map((n) =>
        n.id === selectedNodeId ? { ...n, type: newNodeType, color: newColor } : n,
      );
      const updated: MindMap = { ...map, nodes: updatedNodes, updatedAt: Date.now() };
      mindMapRef.current = updated;
      setMindMap(updated);
      updateMindMap(updated);

      if (entityId) {
        await addLink('mindmap', map.id, entityType, entityId, 'created_from');
      }
    } catch {}
  }, [selectedNodeId, pushUndo, createTask, createMemoryEntry, createCalendarEvent]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,

        onPanResponderGrant: (e: GestureResponderEvent) => {
          const { pageX, pageY } = e.nativeEvent;
          didDragRef.current = false;
          const node = findNodeAtRef(pageX, pageY);

          if (connectingFromId && node) {
            handleConnectionTap(node);
            draggingNodeRef.current = null;
            isPanningRef.current = false;
            return;
          }

          if (connectingFromId && !node) {
            setConnectingFromId(null);
          }

          if (node) {
            draggingNodeRef.current = node.id;
            dragStartRef.current = { nodeX: node.x, nodeY: node.y };
            isPanningRef.current = false;
            setSelectedNodeId(node.id);

            if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = setTimeout(() => {
              if (!didDragRef.current) {
                setConnectingFromId(node.id);
                setSelectedNodeId(node.id);
                draggingNodeRef.current = null;
              }
            }, 600);
          } else {
            draggingNodeRef.current = null;
            dragStartRef.current = null;
            isPanningRef.current = true;
            lastPanRef.current = { x: pageX, y: pageY };
            setSelectedNodeId(null);
          }
        },

        onPanResponderMove: (e: GestureResponderEvent, gs: PanResponderGestureState) => {
          if (Math.abs(gs.dx) > 5 || Math.abs(gs.dy) > 5) {
            didDragRef.current = true;
            if (longPressTimerRef.current) {
              clearTimeout(longPressTimerRef.current);
              longPressTimerRef.current = null;
            }
          }

          if ((e.nativeEvent as any).touches?.length === 2) {
            const touches = (e.nativeEvent as any).touches;
            const d = pinchDist(touches);
            if (!pinchBaseRef.current) {
              pinchBaseRef.current = { dist: d, scale: transformRef.current.scale };
              return;
            }
            const newScale = Math.max(
              0.3,
              Math.min(3, pinchBaseRef.current.scale * (d / pinchBaseRef.current.dist)),
            );
            transformRef.current = { ...transformRef.current, scale: newScale };
            setTransform({ ...transformRef.current });
            return;
          }

          pinchBaseRef.current = null;
          const map = mindMapRef.current;

          if (draggingNodeRef.current && dragStartRef.current && map) {
            const t = transformRef.current;
            const newX = dragStartRef.current.nodeX + gs.dx / t.scale;
            const newY = dragStartRef.current.nodeY + gs.dy / t.scale;
            const updatedNodes = map.nodes.map((n) =>
              n.id === draggingNodeRef.current ? { ...n, x: newX, y: newY } : n,
            );
            const updated = { ...map, nodes: updatedNodes };
            mindMapRef.current = updated;
            setMindMap(updated);
          } else if (isPanningRef.current) {
            const { pageX, pageY } = e.nativeEvent;
            const dx = pageX - lastPanRef.current.x;
            const dy = pageY - lastPanRef.current.y;
            lastPanRef.current = { x: pageX, y: pageY };
            transformRef.current = {
              ...transformRef.current,
              offsetX: transformRef.current.offsetX + dx,
              offsetY: transformRef.current.offsetY + dy,
            };
            setTransform({ ...transformRef.current });
          }
        },

        onPanResponderRelease: (e: GestureResponderEvent, gs: PanResponderGestureState) => {
          if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
          }

          const map = mindMapRef.current;
          if (draggingNodeRef.current && map && didDragRef.current) {
            debouncedSave(map);
          }

          const wasDrag = didDragRef.current;
          const { pageX, pageY } = e.nativeEvent;
          const now = Date.now();
          const prevTap = lastTapRef.current;
          const timeDiff = now - prevTap.time;
          const distDiff = Math.sqrt((pageX - prevTap.x) ** 2 + (pageY - prevTap.y) ** 2);

          if (!wasDrag && timeDiff < 350 && distDiff < 30) {
            const node = findNodeAtRef(pageX, pageY);
            if (node) {
              openEditSheet(node);
            } else {
              addNewNodeAtScreen(pageX, pageY);
            }
            lastTapRef.current = { time: 0, x: 0, y: 0 };
          } else {
            lastTapRef.current = { time: now, x: pageX, y: pageY };
          }

          draggingNodeRef.current = null;
          dragStartRef.current = null;
          isPanningRef.current = false;
          pinchBaseRef.current = null;
        },
      }),
    [findNodeAtRef, debouncedSave, connectingFromId, handleConnectionTap, openEditSheet, addNewNodeAtScreen],
  );

  const handleWheel = useCallback((e: any) => {
    if (Platform.OS !== 'web') return;
    e.preventDefault();
    const delta = -e.deltaY * 0.001;
    const newScale = Math.max(0.3, Math.min(3, transformRef.current.scale + delta));
    transformRef.current = { ...transformRef.current, scale: newScale };
    setTransform({ ...transformRef.current });
  }, []);

  const canvasRef = useRef<View>(null);

  useEffect(() => {
    if (Platform.OS === 'web' && canvasRef.current) {
      const el = canvasRef.current as any;
      if (el && el.addEventListener) {
        el.addEventListener('wheel', handleWheel, { passive: false });
        return () => el.removeEventListener('wheel', handleWheel);
      }
    }
  }, [handleWheel]);

  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;

  if (!mindMap) {
    return (
      <View style={[styles.container, { paddingTop: topInset }]}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  const edgeLines = mindMap.edges.map((edge, i) => {
    const fromNode = mindMap.nodes.find((n) => n.id === edge.from);
    const toNode = mindMap.nodes.find((n) => n.id === edge.to);
    if (!fromNode || !toNode) return null;
    const x1 = fromNode.x * transform.scale + transform.offsetX;
    const y1 = fromNode.y * transform.scale + transform.offsetY;
    const x2 = toNode.x * transform.scale + transform.offsetX;
    const y2 = toNode.y * transform.scale + transform.offsetY;
    return (
      <Line
        key={`${edge.from}-${edge.to}-${i}`}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={Colors.dark.textTertiary}
        strokeWidth={2}
        strokeLinecap="round"
      />
    );
  });

  const selectedNode = selectedNodeId ? mindMap.nodes.find((n) => n.id === selectedNodeId) : null;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topInset + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={28} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {mindMap.title}
        </Text>
        <View style={{ width: 28 }} />
      </View>

      {connectingFromId && (
        <View style={styles.connectionBanner}>
          <Ionicons name="git-branch-outline" size={16} color={Colors.dark.secondary} />
          <Text style={styles.connectionBannerText}>Tap another node to connect</Text>
          <Pressable onPress={() => setConnectingFromId(null)} hitSlop={8}>
            <Ionicons name="close" size={18} color={Colors.dark.textSecondary} />
          </Pressable>
        </View>
      )}

      <View
        ref={canvasRef}
        style={styles.canvas}
        {...panResponder.panHandlers}
      >
        <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
          {edgeLines}
        </Svg>

        {mindMap.nodes.map((node) => (
          <MindMapNodeCard
            key={node.id}
            node={node}
            selected={node.id === selectedNodeId}
            transform={transform}
            connecting={node.id === connectingFromId}
          />
        ))}
      </View>

      <View style={[styles.toolbar, { bottom: bottomInset + 16 }]}>
        <Pressable
          style={styles.toolbarBtn}
          onPress={addNodeCenter}
        >
          <Ionicons name="add-circle-outline" size={22} color={Colors.dark.text} />
          <Text style={styles.toolbarLabel}>Add</Text>
        </Pressable>
        <Pressable
          style={[styles.toolbarBtn, isGeneratingAI && styles.toolbarBtnDisabled]}
          onPress={handleAIIdeas}
          disabled={isGeneratingAI}
        >
          <Ionicons
            name={isGeneratingAI ? 'hourglass-outline' : 'sparkles-outline'}
            size={22}
            color={isGeneratingAI ? Colors.dark.secondary : Colors.dark.accent}
          />
          <Text style={[styles.toolbarLabel, { color: isGeneratingAI ? Colors.dark.secondary : Colors.dark.accent }]}>
            {isGeneratingAI ? 'Thinking...' : 'AI Ideas'}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.toolbarBtn, undoStack.length === 0 && styles.toolbarBtnDisabled]}
          onPress={handleUndo}
          disabled={undoStack.length === 0}
        >
          <Ionicons name="arrow-undo-outline" size={22} color={undoStack.length > 0 ? Colors.dark.text : Colors.dark.textTertiary} />
          <Text style={[styles.toolbarLabel, undoStack.length === 0 && { color: Colors.dark.textTertiary }]}>Undo</Text>
        </Pressable>
        <Pressable
          style={[styles.toolbarBtn, !selectedNode && styles.toolbarBtnDisabled]}
          onPress={deleteSelectedNode}
          disabled={!selectedNode}
        >
          <Ionicons name="trash-outline" size={22} color={selectedNode ? Colors.dark.primary : Colors.dark.textTertiary} />
          <Text style={[styles.toolbarLabel, { color: selectedNode ? Colors.dark.primary : Colors.dark.textTertiary }]}>Delete</Text>
        </Pressable>
      </View>

      {selectedNode && selectedNode.type === 'idea' && (
        <View style={[styles.promoteBar, { bottom: bottomInset + 80 }]}>
          <Pressable
            style={styles.promoteBtn}
            onPress={() => promoteNodeToEntity('task')}
          >
            <Ionicons name="checkmark-circle-outline" size={18} color={Colors.dark.primary} />
            <Text style={[styles.promoteBtnText, { color: Colors.dark.primary }]}>Task</Text>
          </Pressable>
          <Pressable
            style={styles.promoteBtn}
            onPress={() => promoteNodeToEntity('memory')}
          >
            <Ionicons name="bookmark-outline" size={18} color={Colors.dark.secondary} />
            <Text style={[styles.promoteBtnText, { color: Colors.dark.secondary }]}>Memory</Text>
          </Pressable>
          <Pressable
            style={styles.promoteBtn}
            onPress={() => promoteNodeToEntity('event')}
          >
            <Ionicons name="calendar-outline" size={18} color={Colors.dark.amber} />
            <Text style={[styles.promoteBtnText, { color: Colors.dark.amber }]}>Event</Text>
          </Pressable>
        </View>
      )}

      <View style={[styles.zoomControls, { bottom: bottomInset + 100 }]}>
        <Pressable
          style={styles.zoomBtn}
          onPress={() => {
            const s = Math.min(3, transformRef.current.scale + 0.2);
            transformRef.current = { ...transformRef.current, scale: s };
            setTransform({ ...transformRef.current });
          }}
        >
          <Ionicons name="add" size={22} color={Colors.dark.text} />
        </Pressable>
        <Pressable
          style={styles.zoomBtn}
          onPress={() => {
            const s = Math.max(0.3, transformRef.current.scale - 0.2);
            transformRef.current = { ...transformRef.current, scale: s };
            setTransform({ ...transformRef.current });
          }}
        >
          <Ionicons name="remove" size={22} color={Colors.dark.text} />
        </Pressable>
        <Pressable
          style={styles.zoomBtn}
          onPress={() => {
            transformRef.current = { offsetX: SCREEN_W / 2, offsetY: SCREEN_H / 2, scale: 1 };
            setTransform({ ...transformRef.current });
          }}
        >
          <Ionicons name="scan-outline" size={20} color={Colors.dark.text} />
        </Pressable>
      </View>

      <Modal
        visible={editModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.editSheet, { paddingBottom: bottomInset + 16 }]}>
            <View style={styles.editSheetHandle} />
            <View style={styles.editSheetHeader}>
              <Text style={styles.editSheetTitle}>Edit Node</Text>
              <Pressable onPress={() => setEditModalVisible(false)} hitSlop={10}>
                <Ionicons name="close" size={24} color={Colors.dark.textSecondary} />
              </Pressable>
            </View>

            <Text style={styles.editLabel}>Text</Text>
            <TextInput
              style={styles.editInput}
              value={editText}
              onChangeText={setEditText}
              placeholder="Node text..."
              placeholderTextColor={Colors.dark.textTertiary}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={saveEdit}
            />

            <Text style={styles.editLabel}>Type</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeRow}>
              {ALL_NODE_TYPES.map((t) => {
                const isActive = editType === t;
                const color = getNodeColor(t);
                return (
                  <Pressable
                    key={t}
                    style={[
                      styles.typeChip,
                      { borderColor: isActive ? color : Colors.dark.border },
                      isActive && { backgroundColor: `${color}25` },
                    ]}
                    onPress={() => setEditType(t)}
                  >
                    <Ionicons
                      name={NODE_TYPE_ICONS[t] || 'ellipse-outline'}
                      size={16}
                      color={isActive ? color : Colors.dark.textSecondary}
                    />
                    <Text style={[styles.typeChipText, isActive && { color }]}>
                      {NODE_TYPE_LABELS[t]}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Pressable style={styles.saveBtn} onPress={saveEdit}>
              <Ionicons name="checkmark" size={22} color="#FFF" />
              <Text style={styles.saveBtnText}>Save</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: Colors.dark.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
    zIndex: 10,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.dark.text,
  },
  loadingText: {
    color: Colors.dark.textSecondary,
    fontSize: 15,
    textAlign: 'center',
    marginTop: 100,
  },
  canvas: {
    flex: 1,
    overflow: 'hidden',
  },
  node: {
    position: 'absolute',
    borderRadius: 14,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  nodeText: {
    color: Colors.dark.text,
    fontFamily: 'Inter_500Medium',
    flexShrink: 1,
  },
  connectionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
    backgroundColor: `${Colors.dark.secondary}15`,
    borderBottomWidth: 1,
    borderBottomColor: `${Colors.dark.secondary}30`,
  },
  connectionBannerText: {
    color: Colors.dark.secondary,
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
  toolbar: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: Colors.dark.card,
    borderRadius: 18,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  toolbarBtn: {
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 12,
  },
  toolbarBtnDisabled: {
    opacity: 0.5,
  },
  toolbarLabel: {
    color: Colors.dark.text,
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
  },
  zoomControls: {
    position: 'absolute',
    right: 16,
    gap: 8,
  },
  zoomBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: Colors.dark.overlay,
  },
  editSheet: {
    backgroundColor: Colors.dark.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  editSheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.dark.textTertiary,
    alignSelf: 'center',
    marginBottom: 16,
  },
  editSheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  editSheetTitle: {
    fontSize: 18,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.dark.text,
  },
  editLabel: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    color: Colors.dark.textSecondary,
    marginBottom: 8,
  },
  editInput: {
    backgroundColor: Colors.dark.inputBackground,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: Colors.dark.text,
    fontFamily: 'Inter_400Regular',
    borderWidth: 1,
    borderColor: Colors.dark.border,
    marginBottom: 20,
  },
  typeRow: {
    flexDirection: 'row',
    marginBottom: 24,
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    marginRight: 8,
  },
  typeChipText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    color: Colors.dark.textSecondary,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.dark.primary,
    borderRadius: 14,
    paddingVertical: 14,
  },
  saveBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
  },
  promoteBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  promoteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.dark.card,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  promoteBtnText: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
  },
});
