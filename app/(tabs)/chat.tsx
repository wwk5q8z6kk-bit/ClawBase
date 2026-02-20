import React, { useCallback, useMemo, useState, useRef, useEffect } from 'react';
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
  ScrollView,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Swipeable } from 'react-native-gesture-handler';
import Colors from '@/constants/colors';
import { useApp } from '@/lib/AppContext';
import { PulsingDot } from '@/components/PulsingDot';
import { GlassCard } from '@/components/GlassCard';
import type { Conversation } from '@/lib/types';

const C = Colors.dark;

const CODE_PATTERNS = /(\bcode\b|```|function\s|const\s|import\s|class\s|def\s|var\s|let\s|<\w+>|{|}|\[\]|=>|console\.|return\s)/i;

function getSessionIcon(title: string): { name: keyof typeof Ionicons.glyphMap; color: string } {
  const t = title.toLowerCase();
  if (t.includes('email') || t.includes('mail')) return { name: 'mail', color: C.coral };
  if (t.includes('github')) return { name: 'logo-github', color: C.purple };
  if (t.includes('code')) return { name: 'code-slash', color: C.accent };
  if (t.includes('calendar')) return { name: 'calendar', color: C.amber };
  return { name: 'chatbubble', color: C.secondary };
}

function getChannelIcon(channelType: string): keyof typeof Ionicons.glyphMap {
  const t = channelType.toLowerCase();
  if (t.includes('whatsapp')) return 'logo-whatsapp';
  if (t.includes('discord')) return 'logo-discord';
  if (t.includes('slack')) return 'logo-slack';
  if (t.includes('telegram')) return 'paper-plane';
  if (t.includes('imessage') || t.includes('sms')) return 'chatbubble-ellipses';
  if (t.includes('signal')) return 'shield-checkmark';
  if (t.includes('webchat') || t.includes('web')) return 'globe';
  return 'radio';
}

const AGENT_PATTERNS = /^(I found|Here's|Update:|I've |Let me|Based on|According to)/i;

function ActionChip({ icon, label, color }: { icon: keyof typeof Ionicons.glyphMap; label: string; color: string }) {
  return (
    <View style={[styles.actionChip, { backgroundColor: color + '18' }]}>
      <Ionicons name={icon} size={10} color={color} />
      <Text style={[styles.actionChipText, { color }]}>{label}</Text>
    </View>
  );
}



const ConversationItem = React.memo(function ConversationItem({
  item,
  onPress,
  onLongPress,
  isFirstUnpinned,
}: {
  item: Conversation;
  onPress: () => void;
  onLongPress: () => void;
  isFirstUnpinned?: boolean;
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
  const hasCode = item.lastMessage ? CODE_PATTERNS.test(item.lastMessage) : false;

  const chips = useMemo(() => {
    const result: { icon: keyof typeof Ionicons.glyphMap; label: string; color: string }[] = [];
    if (hasCode) result.push({ icon: 'code-slash', label: 'Code', color: C.accent });
    if (isAgentMsg) result.push({ icon: 'flash', label: 'Agent', color: C.amber });
    if (isRecent) result.push({ icon: 'radio', label: 'Active', color: C.secondary });
    return result;
  }, [hasCode, isAgentMsg, isRecent]);

  const cardInner = (
    <Pressable
      style={({ pressed }) => [
        styles.conversationItem,
        { borderLeftWidth: 3, borderLeftColor: item.pinned ? C.coral : (isFirstUnpinned ? C.accent : 'transparent') },
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
        {chips.length > 0 && (
          <View style={styles.chipRow}>
            {chips.map((chip) => (
              <View key={chip.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                {chip.label === 'Active' && <PulsingDot color={chip.color} />}
                <ActionChip icon={chip.icon} label={chip.label} color={chip.color} />
              </View>
            ))}
          </View>
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
}, (prevProps, nextProps) => {
  return (
    prevProps.item.id === nextProps.item.id &&
    prevProps.item.title === nextProps.item.title &&
    prevProps.item.lastMessage === nextProps.item.lastMessage &&
    prevProps.item.lastMessageTime === nextProps.item.lastMessageTime &&
    prevProps.item.pinned === nextProps.item.pinned &&
    prevProps.item.messageCount === nextProps.item.messageCount &&
    prevProps.isFirstUnpinned === nextProps.isFirstUnpinned &&
    prevProps.onPress === nextProps.onPress &&
    prevProps.onLongPress === nextProps.onLongPress
  );
});

function SwipeableConversationItem({
  item,
  onPress,
  onLongPress,
  isFirstUnpinned,
  onDelete,
  onTogglePin,
}: {
  item: Conversation;
  onPress: () => void;
  onLongPress: () => void;
  isFirstUnpinned?: boolean;
  onDelete: (item: Conversation) => void;
  onTogglePin: (item: Conversation) => void;
}) {
  const swipeableRef = useRef<Swipeable>(null);

  const renderRightActions = useCallback(() => (
    <Pressable
      style={styles.swipeActionDelete}
      onPress={() => {
        swipeableRef.current?.close();
        onDelete(item);
      }}
    >
      <Ionicons name="trash" size={22} color="#fff" />
      <Text style={styles.swipeActionText}>Delete</Text>
    </Pressable>
  ), [item, onDelete]);

  const renderLeftActions = useCallback(() => (
    <Pressable
      style={styles.swipeActionPin}
      onPress={() => {
        swipeableRef.current?.close();
        onTogglePin(item);
      }}
    >
      <Ionicons name={item.pinned ? 'pin-outline' : 'pin'} size={22} color="#fff" />
      <Text style={styles.swipeActionText}>{item.pinned ? 'Unpin' : 'Pin'}</Text>
    </Pressable>
  ), [item, onTogglePin]);

  if (Platform.OS === 'web') {
    return (
      <ConversationItem
        item={item}
        onPress={onPress}
        onLongPress={onLongPress}
        isFirstUnpinned={isFirstUnpinned}
      />
    );
  }

  return (
    <Swipeable
      ref={swipeableRef}
      testID="swipe-conversation"
      renderRightActions={renderRightActions}
      renderLeftActions={renderLeftActions}
      overshootRight={false}
      overshootLeft={false}
      friction={2}
    >
      <ConversationItem
        item={item}
        onPress={onPress}
        onLongPress={onLongPress}
        isFirstUnpinned={isFirstUnpinned}
      />
    </Swipeable>
  );
}

export default function ChatListScreen() {
  const insets = useSafeAreaInsets();
  const { conversations, createConversation, updateConversation, deleteConversation, gatewayStatus, gatewaySessions } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [selectedConvo, setSelectedConvo] = useState<Conversation | null>(null);
  const [renameMode, setRenameMode] = useState(false);
  const [renameText, setRenameText] = useState('');
  const [fabExpanded, setFabExpanded] = useState(false);
  const [commandModalVisible, setCommandModalVisible] = useState(false);
  const [commandText, setCommandText] = useState('');

  const searchBorderAnim = useRef(new Animated.Value(0)).current;

  const onSearchFocus = useCallback(() => {
    Animated.timing(searchBorderAnim, { toValue: 1, duration: 200, useNativeDriver: false }).start();
  }, [searchBorderAnim]);

  const onSearchBlur = useCallback(() => {
    Animated.timing(searchBorderAnim, { toValue: 0, duration: 200, useNativeDriver: false }).start();
  }, [searchBorderAnim]);

  const searchBorderColor = searchBorderAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [C.borderLight, C.coral],
  });

  const fabAnim = useRef(new Animated.Value(0)).current;
  const fabRotateAnim = useRef(new Animated.Value(0)).current;

  const toggleFab = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const toValue = fabExpanded ? 0 : 1;
    setFabExpanded(!fabExpanded);
    Animated.parallel([
      Animated.spring(fabAnim, { toValue, useNativeDriver: Platform.OS !== 'web', friction: 6, tension: 60 }),
      Animated.spring(fabRotateAnim, { toValue, useNativeDriver: Platform.OS !== 'web', friction: 6, tension: 60 }),
    ]).start();
  }, [fabExpanded, fabAnim, fabRotateAnim]);

  const closeFab = useCallback(() => {
    if (!fabExpanded) return;
    setFabExpanded(false);
    Animated.parallel([
      Animated.spring(fabAnim, { toValue: 0, useNativeDriver: Platform.OS !== 'web', friction: 6, tension: 60 }),
      Animated.spring(fabRotateAnim, { toValue: 0, useNativeDriver: Platform.OS !== 'web', friction: 6, tension: 60 }),
    ]).start();
  }, [fabExpanded, fabAnim, fabRotateAnim]);

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
    closeFab();
    const convo = await createConversation(
      `Session ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
    );
    router.push({ pathname: '/chat/[id]', params: { id: convo.id } });
  }, [createConversation, closeFab]);

  const handleQuickCommand = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    closeFab();
    setCommandText('');
    setCommandModalVisible(true);
  }, [closeFab]);

  const handleVoiceInput = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    closeFab();
    if (Platform.OS === 'web') {
      alert('Voice input coming soon!');
    } else {
      Alert.alert('Coming Soon', 'Voice input will be available in a future update.');
    }
  }, [closeFab]);

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

  const handleSwipeDelete = useCallback((item: Conversation) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (Platform.OS === 'web') {
      deleteConversation(item.id);
      return;
    }
    Alert.alert('Delete Conversation', `Remove "${item.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => deleteConversation(item.id),
      },
    ]);
  }, [deleteConversation]);

  const handleSwipeTogglePin = useCallback((item: Conversation) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateConversation(item.id, { pinned: !item.pinned });
  }, [updateConversation]);

  const webTopPad = Platform.OS === 'web' ? 67 : 0;

  const fabRotation = fabRotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '45deg'],
  });

  const fabMenuItem1Y = fabAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -70] });
  const fabMenuItem2Y = fabAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -130] });
  const fabMenuItem3Y = fabAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -190] });
  const fabMenuOpacity = fabAnim.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 0, 1] });
  const fabMenuScale = fabAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] });

  const isGatewayConnected = gatewayStatus === 'connected';

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopPad }]}>
      <LinearGradient colors={C.gradient.ocean} style={styles.headerGradient}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Chat</Text>
        </View>
      </LinearGradient>

      {isGatewayConnected && gatewaySessions.length > 0 && (
        <View style={styles.sessionSwitcherContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sessionScrollContent}>
            <Pressable
              style={[styles.sessionPill, styles.sessionPillActive]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
            >
              <Ionicons name="phone-portrait-outline" size={14} color="#fff" />
              <Text style={[styles.sessionPillText, styles.sessionPillTextActive]}>App Chat</Text>
            </Pressable>
            <View style={styles.sessionDivider} />
            {gatewaySessions.map((session) => (
              <Pressable
                key={session.sessionKey}
                style={[styles.sessionPill]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push('/sessions' as any);
                }}
              >
                <Ionicons name={getChannelIcon(session.channelType || session.label)} size={14} color={C.textSecondary} />
                <Text style={styles.sessionPillText} numberOfLines={1}>{session.label}</Text>
                {session.isActive && <View style={styles.sessionActiveDot} />}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      <View style={styles.searchContainer}>
        <Animated.View style={[styles.searchBar, { borderColor: searchBorderColor }]}>
          <Ionicons name="search" size={18} color={C.textTertiary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search conversations..."
            placeholderTextColor={C.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onFocus={onSearchFocus}
            onBlur={onSearchBlur}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color={C.textTertiary} />
            </Pressable>
          )}
        </Animated.View>
      </View>

      {conversations.length > 0 && (
        <View style={styles.statsRow}>
          <Text style={styles.statText}>{stats.total} chats</Text>
          <Text style={styles.statDivider}>·</Text>
          <Text style={styles.statText}>{stats.messages} msgs</Text>
          <Text style={styles.statDivider}>·</Text>
          <Text style={styles.statText}>{stats.pinned} pinned</Text>
        </View>
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
              <SwipeableConversationItem
                item={item}
                onPress={() => router.push({ pathname: '/chat/[id]', params: { id: item.id } })}
                onLongPress={() => openActionSheet(item)}
                isFirstUnpinned={index === firstUnpinnedIndex}
                onDelete={handleSwipeDelete}
                onTogglePin={handleSwipeTogglePin}
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
          searchQuery.trim().length > 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptySearchIconWrap}>
                <Ionicons name="search" size={36} color={C.textTertiary} />
              </View>
              <Text style={styles.emptyTitle}>No matches found</Text>
              <Text style={styles.emptySubtitle}>
                No conversations matching &quot;{searchQuery}&quot;
              </Text>
            </View>
          ) : (
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
          )
        }
      />

      {fabExpanded && (
        <Pressable style={styles.fabOverlay} onPress={closeFab} />
      )}

      <View style={[styles.fabContainer, { bottom: insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 80 }]} pointerEvents="box-none">
        <Animated.View style={[styles.fabMenuItem, { transform: [{ translateY: fabMenuItem3Y }, { scale: fabMenuScale }], opacity: fabMenuOpacity }]}>
          <Pressable
            style={styles.fabMenuItemInner}
            onPress={handleVoiceInput}
          >
            <View style={[styles.fabMenuIcon, { backgroundColor: C.purpleMuted }]}>
              <Ionicons name="mic" size={18} color={C.purple} />
            </View>
            <View style={styles.fabMenuLabel}>
              <Text style={styles.fabMenuLabelText}>Voice Input</Text>
            </View>
          </Pressable>
        </Animated.View>

        <Animated.View style={[styles.fabMenuItem, { transform: [{ translateY: fabMenuItem2Y }, { scale: fabMenuScale }], opacity: fabMenuOpacity }]}>
          <Pressable
            style={styles.fabMenuItemInner}
            onPress={handleQuickCommand}
          >
            <View style={[styles.fabMenuIcon, { backgroundColor: C.amberMuted }]}>
              <Ionicons name="terminal" size={18} color={C.amber} />
            </View>
            <View style={styles.fabMenuLabel}>
              <Text style={styles.fabMenuLabelText}>Quick Command</Text>
            </View>
          </Pressable>
        </Animated.View>

        <Animated.View style={[styles.fabMenuItem, { transform: [{ translateY: fabMenuItem1Y }, { scale: fabMenuScale }], opacity: fabMenuOpacity }]}>
          <Pressable
            style={styles.fabMenuItemInner}
            onPress={handleNewChat}
          >
            <View style={[styles.fabMenuIcon, { backgroundColor: C.secondaryMuted }]}>
              <Ionicons name="chatbubble" size={18} color={C.secondary} />
            </View>
            <View style={styles.fabMenuLabel}>
              <Text style={styles.fabMenuLabelText}>New Chat</Text>
            </View>
          </Pressable>
        </Animated.View>

        <Pressable onPress={toggleFab} style={styles.fabButton}>
          <LinearGradient colors={C.gradient.lobster} style={styles.fabGrad}>
            <Animated.View style={{ transform: [{ rotate: fabRotation }] }}>
              <Ionicons name="add" size={28} color="#fff" />
            </Animated.View>
          </LinearGradient>
        </Pressable>
      </View>

      <Modal
        visible={commandModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCommandModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setCommandModalVisible(false)}>
          <View style={styles.commandSheet}>
            <Text style={styles.actionSheetTitle}>Quick Command</Text>
            <TextInput
              style={styles.renameInput}
              value={commandText}
              onChangeText={setCommandText}
              placeholder="Type a command..."
              placeholderTextColor={C.textTertiary}
              autoFocus
            />
            <View style={styles.renameButtons}>
              <Pressable
                style={({ pressed }) => [styles.renameBtnCancel, pressed && { opacity: 0.7 }]}
                onPress={() => setCommandModalVisible(false)}
              >
                <Text style={styles.renameBtnCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.renameBtnSave, pressed && { opacity: 0.7 }]}
                onPress={async () => {
                  if (!commandText.trim()) return;
                  setCommandModalVisible(false);
                  const convo = await createConversation(commandText.trim().slice(0, 40));
                  router.push({ pathname: '/chat/[id]', params: { id: convo.id } });
                }}
              >
                <Text style={styles.renameBtnSaveText}>Run</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>

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
  sessionSwitcherContainer: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.borderLight,
  },
  sessionScrollContent: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center',
  },
  sessionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.card,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: C.borderLight,
  },
  sessionPillActive: {
    backgroundColor: C.coral,
    borderColor: C.coral,
  },
  sessionPillText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: C.textSecondary,
    maxWidth: 100,
  },
  sessionPillTextActive: {
    color: '#fff',
  },
  sessionDivider: {
    width: 1,
    height: 20,
    backgroundColor: C.borderLight,
    marginHorizontal: 4,
  },
  sessionActiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.secondary,
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
    gap: 8,
  },
  statText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: C.textSecondary,
  },
  statDivider: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: C.textTertiary,
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
  fabOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    zIndex: 9,
  },
  fabContainer: {
    position: 'absolute',
    right: 20,
    zIndex: 10,
    alignItems: 'flex-end',
  },
  fabButton: {
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
  fabMenuItem: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  fabMenuItemInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  fabMenuLabel: {
    backgroundColor: C.surface,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: C.borderLight,
    ...C.shadow.card,
  },
  fabMenuLabelText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: C.text,
  },
  fabMenuIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    ...C.shadow.card,
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
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  actionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  actionChipText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
  },
  pulsingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 2,
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
  emptySearchIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: C.card,
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
  commandSheet: {
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
  swipeActionDelete: {
    backgroundColor: C.error,
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    borderRadius: 8,
    marginLeft: 4,
  },
  swipeActionPin: {
    backgroundColor: C.coral,
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    borderRadius: 8,
    marginRight: 4,
  },
  swipeActionText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: '#fff',
    marginTop: 4,
  },
});
