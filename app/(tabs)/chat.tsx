import React, { useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  Pressable,
  Platform,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import Colors from '@/constants/colors';
import { useApp } from '@/lib/AppContext';
import type { Conversation } from '@/lib/types';

const C = Colors.dark;

function getSessionIcon(title: string): { name: keyof typeof Ionicons.glyphMap; color: string } {
  const t = title.toLowerCase();
  if (t.includes('email') || t.includes('mail')) return { name: 'mail', color: C.coral };
  if (t.includes('github')) return { name: 'logo-github', color: C.purple };
  if (t.includes('code')) return { name: 'code-slash', color: C.accent };
  if (t.includes('calendar')) return { name: 'calendar', color: C.amber };
  return { name: 'chatbubble', color: C.secondary };
}

const AGENT_PATTERNS = /^(I found|Here's|Update:|I've |Let me|Based on|According to)/i;

function ConversationItem({
  item,
  onPress,
  onDelete,
}: {
  item: Conversation;
  onPress: () => void;
  onDelete: () => void;
}) {
  const formatTime = (ts: number) => {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Now';
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d`;
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const sessionIcon = getSessionIcon(item.title);
  const isRecent = Date.now() - item.lastMessageTime < 3600000;
  const isAgentMsg = item.lastMessage ? AGENT_PATTERNS.test(item.lastMessage) : false;

  const cardInner = (
    <Pressable
      style={({ pressed }) => [
        styles.conversationItem,
        { borderLeftWidth: 3, borderLeftColor: item.pinned ? C.coral : 'transparent' },
        pressed && { backgroundColor: C.cardElevated },
      ]}
      onPress={onPress}
      onLongPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onDelete();
      }}
    >
      <LinearGradient
        colors={item.pinned ? C.gradient.lobster : [C.cardElevated, C.card]}
        style={styles.convoIcon}
      >
        <Ionicons name={item.pinned ? 'pin' : sessionIcon.name} size={18} color={item.pinned ? '#fff' : sessionIcon.color} />
      </LinearGradient>
      <View style={styles.convoContent}>
        <View style={styles.convoHeader}>
          <Text style={styles.convoTitle} numberOfLines={1}>{item.title}</Text>
          <View style={styles.timeRow}>
            {isRecent && <View style={styles.unreadDot} />}
            <Text style={styles.convoTime}>{formatTime(item.lastMessageTime)}</Text>
          </View>
        </View>
        {item.lastMessage ? (
          <View style={styles.previewRow}>
            {isAgentMsg && (
              <View style={styles.agentBadge}>
                <Ionicons name="flash" size={10} color={C.amber} />
                <Text style={styles.agentBadgeText}>Agent</Text>
              </View>
            )}
            <Text style={[styles.convoPreview, { marginTop: 0 }, isAgentMsg && { flex: 1 }]} numberOfLines={2}>{item.lastMessage}</Text>
          </View>
        ) : (
          <Text style={[styles.convoPreview, { fontStyle: 'italic' }]}>No messages yet</Text>
        )}
        <View style={styles.convoMeta}>
          <View style={styles.msgCountBadge}>
            <Ionicons name="chatbubble-outline" size={10} color={C.textTertiary} />
            <Text style={styles.msgCountText}>{item.messageCount}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );

  if (item.pinned) {
    return (
      <LinearGradient
        colors={['rgba(255, 90, 60, 0.06)', 'rgba(255, 140, 0, 0.03)']}
        style={styles.pinnedBg}
      >
        {cardInner}
      </LinearGradient>
    );
  }

  return cardInner;
}

export default function ChatListScreen() {
  const insets = useSafeAreaInsets();
  const { conversations, createConversation, deleteConversation } = useApp();

  const handleNewChat = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const convo = await createConversation(
      `Session ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
    );
    router.push({ pathname: '/chat/[id]', params: { id: convo.id } });
  }, [createConversation]);

  const handleDelete = useCallback(
    (item: Conversation) => {
      if (Platform.OS === 'web') {
        deleteConversation(item.id);
        return;
      }
      Alert.alert('Delete Conversation', `Remove "${item.title}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteConversation(item.id) },
      ]);
    },
    [deleteConversation],
  );

  const webTopPad = Platform.OS === 'web' ? 67 : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopPad }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Chat</Text>
      </View>

      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ConversationItem
            item={item}
            onPress={() => router.push({ pathname: '/chat/[id]', params: { id: item.id } })}
            onDelete={() => handleDelete(item)}
          />
        )}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + 100 },
          conversations.length === 0 && styles.emptyListContent,
        ]}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        scrollEnabled={conversations.length > 0}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <LinearGradient colors={C.gradient.lobster} style={styles.emptyIconWrap}>
              <Ionicons name="chatbubbles-outline" size={36} color="#fff" />
            </LinearGradient>
            <Text style={styles.emptyTitle}>No conversations yet</Text>
            <Text style={styles.emptySubtitle}>
              Tap the compose button to start chatting with your agent
            </Text>
            <Pressable
              onPress={handleNewChat}
              style={({ pressed }) => [styles.emptyBtn, pressed && { opacity: 0.8 }]}
            >
              <LinearGradient
                colors={C.gradient.lobster}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.emptyBtnGradient}
              >
                <Ionicons name="add" size={20} color="#fff" />
                <Text style={styles.emptyBtnText}>New Chat</Text>
              </LinearGradient>
            </Pressable>
          </View>
        }
      />

      <Pressable
        onPress={handleNewChat}
        style={({ pressed }) => [
          styles.fab,
          { bottom: insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 80 },
          pressed && { opacity: 0.85, transform: [{ scale: 0.95 }] },
        ]}
      >
        <LinearGradient colors={C.gradient.lobster} style={styles.fabGrad}>
          <Ionicons name="add" size={28} color="#fff" />
        </LinearGradient>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 26,
    color: C.text,
  },
  fab: {
    position: 'absolute',
    right: 20,
    zIndex: 10,
    borderRadius: 30,
    overflow: 'hidden',
    ...C.shadow.elevated,
  },
  fabGrad: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: 20,
  },
  emptyListContent: {
    flex: 1,
    justifyContent: 'center',
  },
  conversationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 14,
  },
  convoIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  convoContent: {
    flex: 1,
  },
  convoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  convoTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: C.text,
    flex: 1,
    marginRight: 8,
  },
  convoTime: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: C.textTertiary,
  },
  convoPreview: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: C.textSecondary,
    marginTop: 3,
  },
  convoMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 8,
  },
  msgCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  msgCountText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: C.textTertiary,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.coral,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
    gap: 6,
  },
  agentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: C.amberMuted,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  agentBadgeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    color: C.amber,
  },
  pinnedBg: {
    borderRadius: 8,
  },
  separator: {
    height: 1,
    backgroundColor: C.borderLight,
    marginLeft: 58,
  },
  emptyState: {
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 40,
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 18,
    color: C.text,
  },
  emptySubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: C.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyBtn: {
    marginTop: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  emptyBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 14,
    gap: 8,
  },
  emptyBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: '#fff',
  },
});
