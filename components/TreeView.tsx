import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';

const C = Colors.dark;

interface TreeNode {
  id: string;
  label: string;
  icon?: string;
  color?: string;
  count?: number;
  children?: TreeNode[];
}

interface TreeViewProps {
  nodes: TreeNode[];
  onNodePress?: (node: TreeNode) => void;
  defaultExpanded?: boolean;
}

function TreeNodeItem({
  node,
  depth,
  onNodePress,
  defaultExpanded,
}: {
  node: TreeNode;
  depth: number;
  onNodePress?: (node: TreeNode) => void;
  defaultExpanded: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const hasChildren = node.children && node.children.length > 0;

  const handlePress = useCallback(() => {
    if (hasChildren) {
      setExpanded(prev => !prev);
    }
    onNodePress?.(node);
  }, [hasChildren, onNodePress, node]);

  return (
    <View>
      <Pressable
        style={[styles.nodeRow, { paddingLeft: 12 + depth * 20 }]}
        onPress={handlePress}
      >
        {hasChildren ? (
          <Ionicons
            name={expanded ? 'chevron-down' : 'chevron-forward'}
            size={14}
            color={C.textTertiary}
          />
        ) : (
          <View style={{ width: 14 }} />
        )}

        <Ionicons
          name={(node.icon as any) || (hasChildren ? (expanded ? 'folder-open' : 'folder') : 'document-text-outline')}
          size={16}
          color={node.color || C.accent}
        />

        <Text style={styles.nodeLabel} numberOfLines={1}>{node.label}</Text>

        {node.count !== undefined && (
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{node.count}</Text>
          </View>
        )}
      </Pressable>

      {expanded && hasChildren && node.children!.map(child => (
        <TreeNodeItem
          key={child.id}
          node={child}
          depth={depth + 1}
          onNodePress={onNodePress}
          defaultExpanded={defaultExpanded}
        />
      ))}
    </View>
  );
}

export function TreeView({ nodes, onNodePress, defaultExpanded = false }: TreeViewProps) {
  if (nodes.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No items</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {nodes.map(node => (
        <TreeNodeItem
          key={node.id}
          node={node}
          depth={0}
          onNodePress={onNodePress}
          defaultExpanded={defaultExpanded}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  nodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingRight: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: C.border,
  },
  nodeLabel: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: C.text,
  },
  countBadge: {
    backgroundColor: C.cardElevated,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  countText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    color: C.textSecondary,
  },
  empty: {
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: C.textTertiary,
  },
});
