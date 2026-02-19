import React, { useCallback, useState } from 'react';
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

  return (
    <Pressable
      style={({ pressed }) => [
        styles.conversationItem,
        pressed && { backgroundColor: C.cardElevated },
      ]}
      onPress={onPress}
      onLongPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onDelete();
      }}
    >
      <View style={styles.convoIcon}>
        <Ionicons name="chatbubble" size={20} color={C.accent} />
      </View>
      <View style={styles.convoContent}>
        <View style={styles.convoHeader}>
          <Text style={styles.convoTitle} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.convoTime}>{formatTime(item.lastMessageTime)}</Text>
        </View>
        {item.lastMessage ? (
          <Text style={styles.convoPreview} numberOfLines={2}>
            {item.lastMessage}
          </Text>
        ) : (
          <Text style={[styles.convoPreview, { fontStyle: 'italic' }]}>
            No messages yet
          </Text>
        )}
      </View>
    </Pressable>
  );
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
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteConversation(item.id),
        },
      ]);
    },
    [deleteConversation],
  );

  const webTopPad = Platform.OS === 'web' ? 67 : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopPad }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Chat</Text>
        <Pressable
          onPress={handleNewChat}
          style={({ pressed }) => [
            styles.newBtn,
            pressed && { opacity: 0.7 },
          ]}
        >
          <Ionicons name="create-outline" size={24} color={C.primary} />
        </Pressable>
      </View>

      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ConversationItem
            item={item}
            onPress={() =>
              router.push({ pathname: '/chat/[id]', params: { id: item.id } })
            }
            onDelete={() => handleDelete(item)}
          />
        )}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + 100 },
          conversations.length === 0 && styles.emptyListContent,
        ]}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="chatbubbles-outline" size={48} color={C.textTertiary} />
            </View>
            <Text style={styles.emptyTitle}>No conversations yet</Text>
            <Text style={styles.emptySubtitle}>
              Tap the compose button to start chatting with your agent
            </Text>
            <Pressable
              onPress={handleNewChat}
              style={({ pressed }) => [
                styles.emptyBtn,
                pressed && { opacity: 0.8 },
              ]}
            >
              <LinearGradient
                colors={[C.primary, '#E63E3E']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.emptyBtnGradient}
              >
                <Ionicons name="add" size={20} color={C.text} />
                <Text style={styles.emptyBtnText}>New Chat</Text>
              </LinearGradient>
            </Pressable>
          </View>
        }
      />
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
  newBtn: {
    width: 44,
    height: 44,
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
    backgroundColor: C.accentMuted,
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
    color: C.text,
  },
});
