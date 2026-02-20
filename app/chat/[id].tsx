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
  Modal,
  Alert,
  Linking,
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

function getDateLabel(timestamp: number): string {
  const d = new Date(timestamp);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = today.getTime() - msgDay.getTime();
  const dayMs = 86400000;
  if (diff < dayMs && diff >= 0) return 'Today';
  if (diff < dayMs * 2 && diff >= dayMs) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function isSameDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

function DateSeparator({ label }: { label: string }) {
  return (
    <View style={styles.dateSeparator}>
      <View style={styles.dateLine} />
      <Text style={styles.dateLabel}>{label}</Text>
      <View style={styles.dateLine} />
    </View>
  );
}

function renderFormattedText(content: string, isUser: boolean): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const codeBlockRegex = /```[\s\S]*?```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const renderInlineText = (text: string, key: string): React.ReactNode[] => {
    const inlineNodes: React.ReactNode[] = [];
    const inlineRegex = /(\*\*(.+?)\*\*)|(https?:\/\/[^\s)\]]+)/g;
    let inlineLastIndex = 0;
    let inlineMatch: RegExpExecArray | null;
    let inlineKey = 0;

    while ((inlineMatch = inlineRegex.exec(text)) !== null) {
      if (inlineMatch.index > inlineLastIndex) {
        inlineNodes.push(
          <Text key={`${key}-t${inlineKey++}`}>{text.slice(inlineLastIndex, inlineMatch.index)}</Text>
        );
      }
      if (inlineMatch[1]) {
        inlineNodes.push(
          <Text key={`${key}-b${inlineKey++}`} style={{ fontFamily: 'Inter_700Bold' }}>{inlineMatch[2]}</Text>
        );
      } else if (inlineMatch[3]) {
        const url = inlineMatch[3];
        inlineNodes.push(
          <Text
            key={`${key}-l${inlineKey++}`}
            style={{ color: C.coral, textDecorationLine: 'underline' }}
            onPress={() => Linking.openURL(url)}
          >{url}</Text>
        );
      }
      inlineLastIndex = inlineMatch.index + inlineMatch[0].length;
    }
    if (inlineLastIndex < text.length) {
      inlineNodes.push(<Text key={`${key}-tail`}>{text.slice(inlineLastIndex)}</Text>);
    }
    if (inlineNodes.length === 0) {
      inlineNodes.push(<Text key={`${key}-empty`}>{text}</Text>);
    }
    return inlineNodes;
  };

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const textBefore = content.slice(lastIndex, match.index);
      parts.push(
        <Text
          key={`text-${lastIndex}`}
          style={[styles.bubbleText, isUser ? styles.bubbleTextUser : styles.bubbleTextAssistant]}
        >
          {renderInlineText(textBefore, `inline-${lastIndex}`)}
        </Text>
      );
    }
    const codeContent = match[0].replace(/^```\w*\n?/, '').replace(/\n?```$/, '');
    parts.push(
      <View
        key={`code-${match.index}`}
        style={{
          backgroundColor: isUser ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.3)',
          padding: 10,
          borderRadius: 8,
          marginVertical: 4,
        }}
      >
        <Text style={{
          fontSize: 9,
          color: C.textTertiary,
          position: 'absolute',
          top: 4,
          right: 6,
        }}>code</Text>
        <Text style={{
          fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
          fontSize: 12,
          color: isUser ? '#FFFFFF' : C.text,
          lineHeight: 18,
        }}>{codeContent}</Text>
      </View>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    const remaining = content.slice(lastIndex);
    parts.push(
      <Text
        key={`text-${lastIndex}`}
        style={[styles.bubbleText, isUser ? styles.bubbleTextUser : styles.bubbleTextAssistant]}
      >
        {renderInlineText(remaining, `inline-${lastIndex}`)}
      </Text>
    );
  }

  if (parts.length === 0) {
    parts.push(
      <Text
        key="full"
        style={[styles.bubbleText, isUser ? styles.bubbleTextUser : styles.bubbleTextAssistant]}
      >
        {content}
      </Text>
    );
  }

  return parts;
}

const MessageBubble = React.memo(function MessageBubble({
  message,
  showAvatar,
  tightTop,
  onLongPress,
  copiedId,
}: {
  message: ChatMessage;
  showAvatar: boolean;
  tightTop: boolean;
  onLongPress: (id: string) => void;
  copiedId: string | null;
}) {
  const isUser = message.role === 'user';

  return (
    <View style={tightTop ? { marginTop: -2 } : undefined}>
      <Pressable
        onLongPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onLongPress(message.id);
        }}
        delayLongPress={400}
        style={({ pressed }) => [pressed && { opacity: 0.85 }]}
      >
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
            {renderFormattedText(message.content, isUser)}
            <View style={styles.bubbleFooter}>
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
              {isUser && message.status === 'sent' && (
                <Ionicons name="checkmark-done" size={14} color="rgba(255,255,255,0.5)" style={{ marginLeft: 4 }} />
              )}
              {isUser && message.status === 'sending' && (
                <Ionicons name="checkmark" size={14} color="rgba(255,255,255,0.35)" style={{ marginLeft: 4 }} />
              )}
            </View>
          </View>
        </View>
      </Pressable>
      {copiedId === message.id && (
        <View style={[styles.copiedBadge, isUser ? { alignSelf: 'flex-end' } : { alignSelf: 'flex-start', marginLeft: 36 }]}>
          <Ionicons name="checkmark-circle" size={12} color={C.success} />
          <Text style={styles.copiedText}>Copied!</Text>
        </View>
      )}
    </View>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.message.id === nextProps.message.id &&
    prevProps.message.content === nextProps.message.content &&
    prevProps.message.status === nextProps.message.status &&
    prevProps.showAvatar === nextProps.showAvatar &&
    prevProps.tightTop === nextProps.tightTop &&
    prevProps.copiedId === nextProps.copiedId &&
    prevProps.onLongPress === nextProps.onLongPress
  );
});

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

function MessageActionSheet({
  message,
  onClose,
  onCopy,
  onReply,
}: {
  message: ChatMessage | null;
  onClose: () => void;
  onCopy: () => void;
  onReply: (text: string) => void;
}) {
  if (!message) return null;
  const isUser = message.role === 'user';

  const actions = [
    { icon: 'copy-outline', label: 'Copy Text', onPress: onCopy, color: C.accent },
    { icon: 'arrow-undo-outline', label: 'Reply', onPress: () => { onReply(message.content); onClose(); }, color: C.secondary },
    { icon: 'bookmark-outline', label: 'Bookmark', onPress: () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); onClose(); }, color: C.amber },
    { icon: 'share-outline', label: 'Share', onPress: () => { onClose(); }, color: C.coral },
  ];

  return (
    <Modal visible={!!message} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.actionOverlay} onPress={onClose}>
        <View style={styles.actionSheet}>
          <View style={styles.actionPreview}>
            <Text style={styles.actionPreviewLabel}>{isUser ? 'You' : 'Agent'}</Text>
            <Text style={styles.actionPreviewText} numberOfLines={3}>{message.content}</Text>
          </View>
          <View style={styles.actionDivider} />
          {actions.map((action, i) => (
            <Pressable
              key={i}
              style={({ pressed }) => [styles.actionItem, pressed && { backgroundColor: C.cardElevated }]}
              onPress={action.onPress}
            >
              <View style={[styles.actionIcon, { backgroundColor: action.color + '15' }]}>
                <Ionicons name={action.icon as any} size={18} color={action.color} />
              </View>
              <Text style={styles.actionLabel}>{action.label}</Text>
            </Pressable>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}

function AnimatedMessageWrapper({ children, shouldAnimate }: { children: React.ReactNode; shouldAnimate: boolean }) {
  const translateY = useRef(new Animated.Value(shouldAnimate ? 20 : 0)).current;
  const opacity = useRef(new Animated.Value(shouldAnimate ? 0 : 1)).current;

  useEffect(() => {
    if (shouldAnimate) {
      Animated.parallel([
        Animated.timing(translateY, { toValue: 0, duration: 300, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: Platform.OS !== 'web' }),
      ]).start();
    }
  }, [opacity, shouldAnimate, translateY]);

  if (!shouldAnimate) return <>{children}</>;

  return (
    <Animated.View style={{ transform: [{ translateY }], opacity }}>
      {children}
    </Animated.View>
  );
}

function StreamingBubble({ text }: { text: string }) {
  const cursorOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(cursorOpacity, { toValue: 0.3, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(cursorOpacity, { toValue: 1, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [cursorOpacity]);

  return (
    <View style={[styles.bubbleWrap, styles.bubbleWrapAssistant]}>
      <LinearGradient colors={C.gradient.lobster} style={styles.assistantAvatar}>
        <Ionicons name="sparkles" size={12} color="#fff" />
      </LinearGradient>
      <View style={[styles.bubble, styles.bubbleAssistant]}>
        <Text style={[styles.bubbleText, styles.bubbleTextAssistant]}>
          {text}
          <Animated.Text style={{ color: C.coral, opacity: cursorOpacity }}>{'▊'}</Animated.Text>
        </Text>
      </View>
    </View>
  );
}

export default function ChatDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getMessages, sendMessage, conversations, activeConnection, gateway, gatewayStatus, streamingText, isStreaming } = useApp();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [infoVisible, setInfoVisible] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [actionMenuMsg, setActionMenuMsg] = useState<ChatMessage | null>(null);
  const inputRef = useRef<TextInput>(null);
  const flatListRef = useRef<FlatList>(null);
  const prevMessageCountRef = useRef(0);

  const conversation = conversations.find((c) => c.id === id);

  const loadMessages = useCallback(async () => {
    if (!id) return;
    const msgs = await getMessages(id);
    setMessages(msgs);
  }, [id, getMessages]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    if (!id) return;
    const unsub = gateway.on('message_complete', async (event) => {
      const fullText = event.data?.text || '';
      if (fullText) {
        const { messageStorage, conversationStorage } = await import('@/lib/storage');
        await messageStorage.add({
          conversationId: id,
          role: 'assistant',
          content: fullText,
          timestamp: Date.now(),
          status: 'sent',
        });
        await conversationStorage.update(id, {
          lastMessage: fullText.slice(0, 100),
          lastMessageTime: Date.now(),
        });
        const updated = await getMessages(id);
        setMessages(updated);
        setIsSending(false);
      }
    });
    return unsub;
  }, [id, gateway, getMessages]);

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

  const handleClearConversation = useCallback(() => {
    const doClear = () => {
      setMessages([]);
      setMenuVisible(false);
    };
    if (Platform.OS === 'web') {
      doClear();
    } else {
      Alert.alert(
        'Clear Conversation',
        'Are you sure you want to clear all messages?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Clear', style: 'destructive', onPress: doClear },
        ],
      );
    }
  }, []);

  const openActionMenu = useCallback((messageId: string) => {
    const msg = messages.find((m) => m.id === messageId);
    if (msg) {
      setActionMenuMsg(msg);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  }, [messages]);

  const handleCopyAction = useCallback(() => {
    if (!actionMenuMsg) return;
    if (Platform.OS === 'web') {
      try { navigator.clipboard.writeText(actionMenuMsg.content); } catch { }
    }
    setCopiedId(actionMenuMsg.id);
    setTimeout(() => setCopiedId(null), 1500);
    setActionMenuMsg(null);
  }, [actionMenuMsg]);

  const suggestions = messages.length === 0
    ? ['Summarize my inbox', 'What tasks are pending?', 'System health check', "What's my schedule today?", 'Run a system health check', 'Summarize recent activity']
    : [];

  const shouldShowAvatar = (index: number) => {
    if (messages[index].role === 'user') return false;
    if (index === 0) return true;
    return messages[index - 1].role !== 'assistant';
  };

  const isTightTop = (index: number) => {
    if (index === 0) return false;
    const prev = messages[index - 1];
    const curr = messages[index];
    return prev.role === curr.role && isSameDay(prev.timestamp, curr.timestamp);
  };

  const shouldShowDateSeparator = (index: number) => {
    if (index === 0) return true;
    return !isSameDay(messages[index - 1].timestamp, messages[index].timestamp);
  };

  const newMessageStartIndex = prevMessageCountRef.current;

  useEffect(() => {
    prevMessageCountRef.current = messages.length;
  }, [messages.length]);

  const webTopPad = Platform.OS === 'web' ? 67 : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopPad }]}>
      <LinearGradient colors={C.gradient.ocean} style={styles.header}>
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
            <View style={[styles.headerDot, { backgroundColor: gatewayStatus === 'connected' ? C.success : gatewayStatus === 'connecting' || gatewayStatus === 'authenticating' ? C.amber : C.textTertiary }]} />
            <Text style={[styles.headerStatusText, { color: gatewayStatus === 'connected' ? C.success : gatewayStatus === 'connecting' || gatewayStatus === 'authenticating' ? C.amber : C.textTertiary }]}>
              {gatewayStatus === 'connected' ? 'Connected' : gatewayStatus === 'connecting' ? 'Connecting...' : gatewayStatus === 'authenticating' ? 'Authenticating...' : 'Offline'}
            </Text>
          </View>
        </View>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setMenuVisible(true);
          }}
          style={styles.moreBtn}
        >
          <Ionicons name="ellipsis-horizontal" size={22} color={C.textSecondary} />
        </Pressable>
      </LinearGradient>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={0}>
        <LinearGradient
          colors={[C.background, 'rgba(14,21,48,0.3)', C.background]}
          style={{ flex: 1 }}
        >
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={({ item, index }) => (
              <AnimatedMessageWrapper shouldAnimate={index >= newMessageStartIndex && newMessageStartIndex > 0}>
                <View>
                  {shouldShowDateSeparator(index) && (
                    <DateSeparator label={getDateLabel(item.timestamp)} />
                  )}
                  <MessageBubble
                    message={item}
                    showAvatar={shouldShowAvatar(index)}
                    tightTop={isTightTop(index)}
                    onLongPress={openActionMenu}
                    copiedId={copiedId}
                  />
                </View>
              </AnimatedMessageWrapper>
            )}
            contentContainerStyle={[
              styles.messageList,
              messages.length === 0 && styles.emptyMessages,
            ]}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            ListFooterComponent={
              isStreaming && streamingText ? (
                <StreamingBubble text={streamingText} />
              ) : isSending ? (
                <TypingIndicator />
              ) : null
            }
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
                  Ask your agent anything{'\n'}it&apos;s ready to help
                </Text>
                {activeConnection && (
                  <View style={styles.welcomeGateway}>
                    <View style={styles.welcomeGatewayDot} />
                    <Text style={styles.welcomeGatewayText}>
                      Connected to {activeConnection.name}
                    </Text>
                  </View>
                )}
              </View>
            }
          />
        </LinearGradient>

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

      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setMenuVisible(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHandle} />
            <Pressable
              style={({ pressed }) => [styles.modalOption, pressed && { backgroundColor: C.cardElevated }]}
              onPress={handleClearConversation}
            >
              <Ionicons name="trash-outline" size={20} color={C.error} />
              <Text style={[styles.modalOptionText, { color: C.error }]}>Clear Conversation</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.modalOption, pressed && { backgroundColor: C.cardElevated }]}
              onPress={() => {
                setMenuVisible(false);
                setInfoVisible(true);
              }}
            >
              <Ionicons name="information-circle-outline" size={20} color={C.text} />
              <Text style={styles.modalOptionText}>Conversation Info</Text>
            </Pressable>
            <View style={styles.modalDivider} />
            <Pressable
              style={({ pressed }) => [styles.modalOption, pressed && { backgroundColor: C.cardElevated }]}
              onPress={() => setMenuVisible(false)}
            >
              <Ionicons name="close-outline" size={20} color={C.textSecondary} />
              <Text style={[styles.modalOptionText, { color: C.textSecondary }]}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <MessageActionSheet
        message={actionMenuMsg}
        onClose={() => setActionMenuMsg(null)}
        onCopy={handleCopyAction}
        onReply={(text) => {
          setInputText(`Re: ${text.slice(0, 50)}... `);
          inputRef.current?.focus();
        }}
      />

      <Modal
        visible={infoVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setInfoVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setInfoVisible(false)}>
          <Pressable style={styles.infoSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHandle} />
            <Text style={styles.infoTitle}>Conversation Info</Text>
            <View style={styles.infoRow}>
              <Ionicons name="chatbubble-outline" size={16} color={C.textSecondary} />
              <Text style={styles.infoLabel}>Title</Text>
              <Text style={styles.infoValue} numberOfLines={1}>{conversation?.title || 'Chat'}</Text>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="layers-outline" size={16} color={C.textSecondary} />
              <Text style={styles.infoLabel}>Messages</Text>
              <Text style={styles.infoValue}>{messages.length}</Text>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="time-outline" size={16} color={C.textSecondary} />
              <Text style={styles.infoLabel}>Created</Text>
              <Text style={styles.infoValue}>
                {conversation?.lastMessageTime
                  ? new Date(conversation.lastMessageTime).toLocaleDateString(undefined, {
                    month: 'short', day: 'numeric', year: 'numeric',
                  })
                  : 'Unknown'}
              </Text>
            </View>
            <Pressable
              style={({ pressed }) => [styles.infoDoneBtn, pressed && { opacity: 0.7 }]}
              onPress={() => setInfoVisible(false)}
            >
              <Text style={styles.infoDoneText}>Done</Text>
            </Pressable>
          </Pressable>
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
  dateSeparator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 12,
    gap: 10,
  },
  dateLine: {
    flex: 1,
    height: 1,
    backgroundColor: C.borderLight,
  },
  dateLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: C.textTertiary,
    letterSpacing: 0.5,
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
  bubbleFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    justifyContent: 'flex-end',
  },
  bubbleTime: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
  },
  bubbleTimeUser: {
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'right' as const,
  },
  bubbleTimeAssistant: {
    color: C.textTertiary,
  },
  copiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: C.successMuted,
    marginTop: 2,
    marginBottom: 2,
  },
  copiedText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    color: C.success,
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
  welcomeGateway: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    backgroundColor: C.successMuted,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  welcomeGatewayDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.success,
  },
  welcomeGatewayText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: C.success,
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
    ...(C.shadow.card),
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
  modalOverlay: {
    flex: 1,
    backgroundColor: C.overlay,
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 34,
    paddingTop: 8,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.textTertiary,
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  modalOptionText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 16,
    color: C.text,
  },
  modalDivider: {
    height: 1,
    backgroundColor: C.borderLight,
    marginHorizontal: 24,
    marginVertical: 4,
  },
  infoSheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 34,
    paddingTop: 8,
    paddingHorizontal: 24,
  },
  infoTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    color: C.text,
    marginBottom: 16,
    textAlign: 'center',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLight,
  },
  infoLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: C.textSecondary,
    flex: 1,
  },
  infoValue: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: C.text,
    maxWidth: '50%',
  },
  infoDoneBtn: {
    marginTop: 20,
    backgroundColor: C.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  infoDoneText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: '#fff',
  },
  actionOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  actionSheet: { backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 8, paddingBottom: 34 },
  actionPreview: { paddingHorizontal: 20, paddingVertical: 12 },
  actionPreviewLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: C.textTertiary, marginBottom: 4 },
  actionPreviewText: { fontFamily: 'Inter_400Regular', fontSize: 14, color: C.text, lineHeight: 20 },
  actionDivider: { height: 1, backgroundColor: C.borderLight, marginHorizontal: 16 },
  actionItem: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, paddingHorizontal: 20, paddingVertical: 14 },
  actionIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center' as const, justifyContent: 'center' as const },
  actionLabel: { fontFamily: 'Inter_500Medium', fontSize: 15, color: C.text },
});
