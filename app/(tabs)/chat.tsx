import React, { useCallback, useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  Pressable,
  Platform,
  Alert,
  Modal,
  TextInput,
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
  onLongPress,
}: {
  item: Conversation;
  onPress: () => void;
  onLongPress: () => void;
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
        onLongPress();
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
  const { conversations, createConversation, updateConversation, deleteConversation, gatewayStatus, gatewaySessions } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [selectedConvo, setSelectedConvo] = useState<Conversation | null>(null);
  const [renameMode, setRenameMode] = useState(false);
  const [renameText, setRenameText] = useState('');

  const filteredAndSorted = useMemo(() => {
    let filtered = conversations;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = conversations.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          (c.lastMessage && c.lastMessage.toLowerCase().includes(q)),
      );
    }
    return [...filtered].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return b.lastMessageTime - a.lastMessageTime;
    });
  }, [conversations, searchQuery]);

  const stats = useMemo(() => {
    const totalMessages = conversations.reduce((sum, c) => sum + c.messageCount, 0);
    const pinnedCount = conversations.filter((c) => c.pinned).length;
    return { total: conversations.length, messages: totalMessages, pinned: pinnedCount };
  }, [conversations]);

  const hasPinned = useMemo(() => filteredAndSorted.some((c) => c.pinned), [filteredAndSorted]);
  const firstUnpinnedIndex = useMemo(
    () => filteredAndSorted.findIndex((c) => !c.pinned),
    [filteredAndSorted],
  );

  const handleNewChat = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const convo = await createConversation(
      `Session ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
    );
    router.push({ pathname: '/chat/[id]', params: { id: convo.id } });
  }, [createConversation]);

  const openActionSheet = useCallback((item: Conversation) => {
    setSelectedConvo(item);
    setRenameMode(false);
    setRenameText(item.title);
    setActionSheetVisible(true);
  }, []);

  const closeActionSheet = useCallback(() => {
    setActionSheetVisible(false);
    setSelectedConvo(null);
    setRenameMode(false);
  }, []);

  const handlePin = useCallback(async () => {
    if (!selectedConvo) return;
    await updateConversation(selectedConvo.id, { pinned: !selectedConvo.pinned });
    closeActionSheet();
  }, [selectedConvo, updateConversation, closeActionSheet]);

  const handleRename = useCallback(async () => {
    if (!selectedConvo || !renameText.trim()) return;
    await updateConversation(selectedConvo.id, { title: renameText.trim() });
    closeActionSheet();
  }, [selectedConvo, renameText, updateConversation, closeActionSheet]);

  const handleDelete = useCallback(() => {
    if (!selectedConvo) return;
    if (Platform.OS === 'web') {
      deleteConversation(selectedConvo.id);
      closeActionSheet();
      return;
    }
    Alert.alert('Delete Conversation', `Remove "${selectedConvo.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteConversation(selectedConvo.id);
          closeActionSheet();
        },
      },
    ]);
  }, [selectedConvo, deleteConversation, closeActionSheet]);

  const webTopPad = Platform.OS === 'web' ? 67 : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopPad }]}>
      <LinearGradient colors={C.gradient.ocean} style={styles.headerGradient}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Chat</Text>
        </View>
      </LinearGradient>

      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={C.textTertiary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search conversations..."
            placeholderTextColor={C.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color={C.textTertiary} />
            </Pressable>
          )}
        </View>
      </View>

      {conversations.length > 0 && (
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Ionicons name="chatbubbles-outline" size={14} color={C.textSecondary} />
            <Text style={styles.statText}>{stats.total}</Text>
          </View>
          <View style={styles.statItem}>
            <Ionicons name="mail-outline" size={14} color={C.textSecondary} />
            <Text style={styles.statText}>{stats.messages}</Text>
          </View>
          <View style={styles.statItem}>
            <Ionicons name="pin-outline" size={14} color={C.textSecondary} />
            <Text style={styles.statText}>{stats.pinned}</Text>
          </View>
        </View>
      )}

      {gatewayStatus === 'connected' && gatewaySessions.length > 0 && (
        <Pressable
          style={styles.gatewaySessionsBanner}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push('/sessions' as any);
          }}
        >
          <View style={styles.gatewaySessionsLeft}>
            <Ionicons name="radio" size={16} color={C.secondary} />
            <Text style={styles.gatewaySessionsText}>
              {gatewaySessions.length} gateway session{gatewaySessions.length !== 1 ? 's' : ''}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={C.textTertiary} />
        </Pressable>
      )}

      <FlatList
        data={filteredAndSorted}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <View>
            {hasPinned && index === 0 && item.pinned && (
              <View style={styles.sectionHeader}>
                <Ionicons name="pin" size={12} color={C.coral} />
                <Text style={styles.sectionHeaderText}>Pinned</Text>
              </View>
            )}
            {hasPinned && index === firstUnpinnedIndex && (
              <View style={styles.sectionHeader}>
                <Ionicons name="time-outline" size={12} color={C.textTertiary} />
                <Text style={styles.sectionHeaderText}>Recent</Text>
              </View>
            )}
            <View style={styles.conversationItemWrapper}>
              <ConversationItem
                item={item}
                onPress={() => router.push({ pathname: '/chat/[id]', params: { id: item.id } })}
                onLongPress={() => openActionSheet(item)}
              />
            </View>
          </View>
        )}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + 100 },
          filteredAndSorted.length === 0 && styles.emptyListContent,
        ]}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        scrollEnabled={!!conversations.length}
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

      <Modal
        visible={actionSheetVisible}
        transparent
        animationType="fade"
        onRequestClose={closeActionSheet}
      >
        <Pressable style={styles.modalOverlay} onPress={closeActionSheet}>
          <View style={styles.actionSheet}>
            {selectedConvo && !renameMode && (
              <>
                <Text style={styles.actionSheetTitle} numberOfLines={1}>
                  {selectedConvo.title}
                </Text>
                <Pressable
                  style={({ pressed }) => [styles.actionSheetOption, pressed && { backgroundColor: C.cardElevated }]}
                  onPress={handlePin}
                >
                  <Ionicons
                    name={selectedConvo.pinned ? 'pin-outline' : 'pin'}
                    size={20}
                    color={C.text}
                  />
                  <Text style={styles.actionSheetOptionText}>
                    {selectedConvo.pinned ? 'Unpin' : 'Pin'}
                  </Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.actionSheetOption, pressed && { backgroundColor: C.cardElevated }]}
                  onPress={() => setRenameMode(true)}
                >
                  <Ionicons name="pencil" size={20} color={C.text} />
                  <Text style={styles.actionSheetOptionText}>Rename</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.actionSheetOption, pressed && { backgroundColor: C.cardElevated }]}
                  onPress={handleDelete}
                >
                  <Ionicons name="trash" size={20} color={C.error} />
                  <Text style={[styles.actionSheetOptionText, { color: C.error }]}>Delete</Text>
                </Pressable>
                <View style={styles.actionSheetSep} />
                <Pressable
                  style={({ pressed }) => [styles.actionSheetOption, pressed && { backgroundColor: C.cardElevated }]}
                  onPress={closeActionSheet}
                >
                  <Text style={[styles.actionSheetOptionText, { textAlign: 'center', color: C.textSecondary }]}>
                    Cancel
                  </Text>
                </Pressable>
              </>
            )}
            {selectedConvo && renameMode && (
              <>
                <Text style={styles.actionSheetTitle}>Rename Conversation</Text>
                <TextInput
                  style={styles.renameInput}
                  value={renameText}
                  onChangeText={setRenameText}
                  placeholder="Enter new name..."
                  placeholderTextColor={C.textTertiary}
                  autoFocus
                  selectTextOnFocus
                />
                <View style={styles.renameButtons}>
                  <Pressable
                    style={({ pressed }) => [styles.renameBtnCancel, pressed && { opacity: 0.7 }]}
                    onPress={() => setRenameMode(false)}
                  >
                    <Text style={styles.renameBtnCancelText}>Back</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [styles.renameBtnSave, pressed && { opacity: 0.7 }]}
                    onPress={handleRename}
                  >
                    <Text style={styles.renameBtnSaveText}>Save</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  headerGradient: {
    borderBottomWidth: 1,
    borderBottomColor: C.borderLight,
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
  searchContainer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.borderLight,
    borderRadius: 12,
    height: 44,
    paddingHorizontal: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: C.text,
    height: 44,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 4,
    backgroundColor: C.card,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 20,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  statText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: C.textSecondary,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  sectionHeaderText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: C.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  fab: {
    position: 'absolute',
    right: 20,
    zIndex: 10,
    borderRadius: 30,
    overflow: 'hidden',
    ...C.shadow.glow,
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
  conversationItemWrapper: {
    borderRadius: 8,
    ...C.shadow.card,
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
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.borderLight,
    marginLeft: 58,
    opacity: 0.6,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: C.overlay,
    justifyContent: 'flex-end',
  },
  actionSheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingBottom: 40,
    paddingHorizontal: 20,
  },
  actionSheetTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: C.text,
    textAlign: 'center',
    marginBottom: 16,
  },
  actionSheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  actionSheetOptionText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 16,
    color: C.text,
  },
  actionSheetSep: {
    height: 1,
    backgroundColor: C.borderLight,
    marginVertical: 4,
  },
  renameInput: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.borderLight,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: C.text,
    marginBottom: 16,
  },
  renameButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  renameBtnCancel: {
    flex: 1,
    backgroundColor: C.card,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  renameBtnCancelText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    color: C.textSecondary,
  },
  renameBtnSave: {
    flex: 1,
    backgroundColor: C.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  renameBtnSaveText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: '#fff',
  },
  gatewaySessionsBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 20, marginTop: 8, marginBottom: 4, backgroundColor: C.secondaryMuted, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: C.secondary + '20' },
  gatewaySessionsLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  gatewaySessionsText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: C.secondary },
});
