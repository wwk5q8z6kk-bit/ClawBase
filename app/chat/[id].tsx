import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TextInput,
  Pressable,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import Colors from '@/constants/colors';
import { useApp } from '@/lib/AppContext';
import type { ChatMessage } from '@/lib/types';

const C = Colors.dark;

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <View
      style={[
        styles.bubbleWrap,
        isUser ? styles.bubbleWrapUser : styles.bubbleWrapAssistant,
      ]}
    >
      {!isUser && (
        <View style={styles.assistantAvatar}>
          <Ionicons name="sparkles" size={14} color={C.primary} />
        </View>
      )}
      <View
        style={[
          styles.bubble,
          isUser ? styles.bubbleUser : styles.bubbleAssistant,
        ]}
      >
        <Text
          style={[
            styles.bubbleText,
            isUser ? styles.bubbleTextUser : styles.bubbleTextAssistant,
          ]}
        >
          {message.content}
        </Text>
        <Text
          style={[
            styles.bubbleTime,
            isUser ? styles.bubbleTimeUser : styles.bubbleTimeAssistant,
          ]}
        >
          {new Date(message.timestamp).toLocaleTimeString(undefined, {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>
      </View>
    </View>
  );
}

function TypingIndicator() {
  return (
    <View style={[styles.bubbleWrap, styles.bubbleWrapAssistant]}>
      <View style={styles.assistantAvatar}>
        <Ionicons name="sparkles" size={14} color={C.primary} />
      </View>
      <View style={[styles.bubble, styles.bubbleAssistant, styles.typingBubble]}>
        <View style={styles.typingDots}>
          <View style={[styles.typingDot, { opacity: 0.4 }]} />
          <View style={[styles.typingDot, { opacity: 0.6 }]} />
          <View style={[styles.typingDot, { opacity: 0.8 }]} />
        </View>
      </View>
    </View>
  );
}

export default function ChatDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getMessages, sendMessage, conversations } = useApp();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const conversation = conversations.find((c) => c.id === id);

  const loadMessages = useCallback(async () => {
    if (!id) return;
    const msgs = await getMessages(id);
    setMessages(msgs);
  }, [id, getMessages]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  const handleSend = useCallback(async () => {
    if (!inputText.trim() || isSending || !id) return;
    const text = inputText.trim();
    setInputText('');
    setIsSending(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const userMsg: ChatMessage = {
      id: 'temp-' + Date.now(),
      conversationId: id,
      role: 'user',
      content: text,
      timestamp: Date.now(),
      status: 'sent',
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      await sendMessage(id, text);
      const updated = await getMessages(id);
      setMessages(updated);
    } catch {
      console.error('Failed to send');
    } finally {
      setIsSending(false);
      inputRef.current?.focus();
    }
  }, [inputText, isSending, id, sendMessage, getMessages]);

  const webTopPad = Platform.OS === 'web' ? 67 : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopPad }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="chevron-back" size={28} color={C.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {conversation?.title || 'Chat'}
          </Text>
          <View style={styles.headerStatus}>
            <View style={styles.headerDot} />
            <Text style={styles.headerStatusText}>Agent Online</Text>
          </View>
        </View>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
        >
          <Ionicons name="ellipsis-horizontal" size={24} color={C.textSecondary} />
        </Pressable>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={0}>
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <MessageBubble message={item} />}
          contentContainerStyle={[
            styles.messageList,
            messages.length === 0 && styles.emptyMessages,
          ]}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          ListFooterComponent={isSending ? <TypingIndicator /> : null}
          ListEmptyComponent={
            <View style={styles.welcomeState}>
              <View style={styles.welcomeIcon}>
                <Ionicons name="sparkles" size={32} color={C.primary} />
              </View>
              <Text style={styles.welcomeTitle}>Start a conversation</Text>
              <Text style={styles.welcomeSubtitle}>
                Ask your agent anything - it's ready to help
              </Text>
            </View>
          }
        />

        <View
          style={[
            styles.inputContainer,
            { paddingBottom: Platform.OS === 'web' ? 34 : insets.bottom + 8 },
          ]}
        >
          <View style={styles.inputWrap}>
            <TextInput
              ref={inputRef}
              style={styles.textInput}
              placeholder="Message your agent..."
              placeholderTextColor={C.textTertiary}
              value={inputText}
              onChangeText={setInputText}
              multiline
              maxLength={2000}
              returnKeyType="default"
            />
            <Pressable
              onPress={handleSend}
              style={({ pressed }) => [
                styles.sendBtn,
                !!inputText.trim() && styles.sendBtnActive,
                pressed && { opacity: 0.7 },
              ]}
              disabled={!inputText.trim() || isSending}
            >
              {isSending ? (
                <ActivityIndicator size="small" color={C.text} />
              ) : (
                <Ionicons
                  name="arrow-up"
                  size={20}
                  color={inputText.trim() ? C.text : C.textTertiary}
                />
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
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
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLight,
    gap: 8,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: C.text,
  },
  headerStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.success,
  },
  headerStatusText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: C.success,
  },
  messageList: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 8,
  },
  emptyMessages: {
    flex: 1,
    justifyContent: 'center',
  },
  bubbleWrap: {
    flexDirection: 'row',
    marginBottom: 4,
    gap: 8,
    maxWidth: '85%',
  },
  bubbleWrapUser: {
    alignSelf: 'flex-end',
  },
  bubbleWrapAssistant: {
    alignSelf: 'flex-start',
  },
  assistantAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '100%',
  },
  bubbleUser: {
    backgroundColor: C.primary,
    borderBottomRightRadius: 4,
  },
  bubbleAssistant: {
    backgroundColor: C.card,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: C.borderLight,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 21,
  },
  bubbleTextUser: {
    fontFamily: 'Inter_400Regular',
    color: '#FFFFFF',
  },
  bubbleTextAssistant: {
    fontFamily: 'Inter_400Regular',
    color: C.text,
  },
  bubbleTime: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    marginTop: 4,
  },
  bubbleTimeUser: {
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'right',
  },
  bubbleTimeAssistant: {
    color: C.textTertiary,
  },
  typingBubble: {
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  typingDots: {
    flexDirection: 'row',
    gap: 4,
  },
  typingDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: C.textSecondary,
  },
  welcomeState: {
    alignItems: 'center',
    gap: 8,
  },
  welcomeIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: C.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  welcomeTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 20,
    color: C.text,
  },
  welcomeSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: C.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  inputContainer: {
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: C.borderLight,
    backgroundColor: C.background,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: C.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: C.border,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
    gap: 8,
  },
  textInput: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: C.text,
    maxHeight: 100,
    paddingVertical: 6,
  },
  sendBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: C.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnActive: {
    backgroundColor: C.primary,
  },
});
