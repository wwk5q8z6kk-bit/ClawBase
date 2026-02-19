import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TextInput,
  Pressable,
  Platform,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import Colors from '@/constants/colors';
import { useApp } from '@/lib/AppContext';
import type { ChatMessage } from '@/lib/types';

const C = Colors.dark;

function MessageBubble({ message, showAvatar }: { message: ChatMessage; showAvatar: boolean }) {
  const isUser = message.role === 'user';

  return (
    <View
      style={[
        styles.bubbleWrap,
        isUser ? styles.bubbleWrapUser : styles.bubbleWrapAssistant,
      ]}
    >
      {!isUser && showAvatar && (
        <LinearGradient
          colors={C.gradient.lobster}
          style={styles.assistantAvatar}
        >
          <Ionicons name="sparkles" size={12} color="#fff" />
        </LinearGradient>
      )}
      {!isUser && !showAvatar && <View style={{ width: 28 }} />}
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
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animate = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: 1, duration: 400, useNativeDriver: Platform.OS !== 'web' }),
          Animated.timing(dot, { toValue: 0.3, duration: 400, useNativeDriver: Platform.OS !== 'web' }),
        ]),
      );
    const a1 = animate(dot1, 0);
    const a2 = animate(dot2, 200);
    const a3 = animate(dot3, 400);
    a1.start(); a2.start(); a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, [dot1, dot2, dot3]);

  return (
    <View style={[styles.bubbleWrap, styles.bubbleWrapAssistant]}>
      <LinearGradient colors={C.gradient.lobster} style={styles.assistantAvatar}>
        <Ionicons name="sparkles" size={12} color="#fff" />
      </LinearGradient>
      <View style={[styles.bubble, styles.bubbleAssistant, styles.typingBubble]}>
        <View style={styles.typingDots}>
          {[dot1, dot2, dot3].map((dot, i) => (
            <Animated.View
              key={i}
              style={[styles.typingDot, { opacity: dot }]}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

function SuggestionChip({ text, onPress }: { text: string; onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.suggestionChip, pressed && { opacity: 0.7 }]}
      onPress={onPress}
    >
      <Text style={styles.suggestionText}>{text}</Text>
    </Pressable>
  );
}

export default function ChatDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getMessages, sendMessage, conversations, activeConnection } = useApp();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const conversation = conversations.find((c) => c.id === id);
  const connected = !!activeConnection;

  const loadMessages = useCallback(async () => {
    if (!id) return;
    const msgs = await getMessages(id);
    setMessages(msgs);
  }, [id, getMessages]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  const handleSend = useCallback(async (text?: string) => {
    const content = (text || inputText).trim();
    if (!content || isSending || !id) return;
    setInputText('');
    setIsSending(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const userMsg: ChatMessage = {
      id: 'temp-' + Date.now(),
      conversationId: id,
      role: 'user',
      content,
      timestamp: Date.now(),
      status: 'sent',
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      await sendMessage(id, content);
      const updated = await getMessages(id);
      setMessages(updated);
    } catch {
      console.error('Failed to send');
    } finally {
      setIsSending(false);
      inputRef.current?.focus();
    }
  }, [inputText, isSending, id, sendMessage, getMessages]);

  const suggestions = messages.length === 0
    ? ['Summarize my inbox', 'What tasks are pending?', 'System health check']
    : [];

  const shouldShowAvatar = (index: number) => {
    if (messages[index].role === 'user') return false;
    if (index === 0) return true;
    return messages[index - 1].role !== 'assistant';
  };

  const webTopPad = Platform.OS === 'web' ? 67 : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopPad }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="chevron-back" size={26} color={C.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {conversation?.title || 'Chat'}
          </Text>
          <View style={styles.headerStatus}>
            <View style={[styles.headerDot, { backgroundColor: connected ? C.success : C.textTertiary }]} />
            <Text style={[styles.headerStatusText, { color: connected ? C.success : C.textTertiary }]}>
              {connected ? 'Online' : 'Offline'}
            </Text>
          </View>
        </View>
        <Pressable
          onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
          style={styles.moreBtn}
        >
          <Ionicons name="ellipsis-horizontal" size={22} color={C.textSecondary} />
        </Pressable>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={0}>
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <MessageBubble message={item} showAvatar={shouldShowAvatar(index)} />
          )}
          contentContainerStyle={[
            styles.messageList,
            messages.length === 0 && styles.emptyMessages,
          ]}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          ListFooterComponent={isSending ? <TypingIndicator /> : null}
          ListEmptyComponent={
            <View style={styles.welcomeState}>
              <LinearGradient
                colors={C.gradient.lobster}
                style={styles.welcomeIcon}
              >
                <Ionicons name="sparkles" size={28} color="#fff" />
              </LinearGradient>
              <Text style={styles.welcomeTitle}>Start a conversation</Text>
              <Text style={styles.welcomeSubtitle}>
                Ask your agent anything{'\n'}it's ready to help
              </Text>
            </View>
          }
        />

        {suggestions.length > 0 && (
          <View style={styles.suggestionsRow}>
            {suggestions.map((s) => (
              <SuggestionChip key={s} text={s} onPress={() => handleSend(s)} />
            ))}
          </View>
        )}

        <View
          style={[
            styles.inputContainer,
            { paddingBottom: Platform.OS === 'web' ? 34 : insets.bottom + 8 },
          ]}
        >
          <View style={styles.inputWrap}>
            <Pressable
              style={styles.attachBtn}
              onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
            >
              <Ionicons name="add-circle-outline" size={24} color={C.textSecondary} />
            </Pressable>
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
              style={styles.voiceBtn}
              onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
            >
              <Ionicons name="mic-outline" size={22} color={C.textSecondary} />
            </Pressable>
            <Pressable
              onPress={() => handleSend()}
              style={({ pressed }) => [
                styles.sendBtn,
                !!inputText.trim() && styles.sendBtnActive,
                pressed && { opacity: 0.7 },
              ]}
              disabled={!inputText.trim() || isSending}
            >
              <Ionicons
                name="arrow-up"
                size={18}
                color={inputText.trim() ? '#fff' : C.textTertiary}
              />
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
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLight,
    gap: 4,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
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
  },
  headerStatusText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
  },
  moreBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageList: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 6,
  },
  emptyMessages: {
    flex: 1,
    justifyContent: 'center',
  },
  bubbleWrap: {
    flexDirection: 'row',
    marginBottom: 2,
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
    color: 'rgba(255,255,255,0.55)',
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
    gap: 5,
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
    lineHeight: 20,
  },
  suggestionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 14,
    paddingBottom: 8,
    gap: 8,
  },
  suggestionChip: {
    backgroundColor: C.card,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: C.border,
  },
  suggestionText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: C.primary,
  },
  inputContainer: {
    paddingHorizontal: 10,
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
    paddingLeft: 4,
    paddingRight: 4,
    paddingVertical: 4,
    gap: 2,
  },
  attachBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textInput: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: C.text,
    maxHeight: 100,
    paddingVertical: 6,
  },
  voiceBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnActive: {
    backgroundColor: C.primary,
  },
});
