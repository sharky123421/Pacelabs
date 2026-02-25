import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { useRunnerMode } from '../contexts/RunnerModeContext';
import { colors, typography, spacing, theme } from '../theme';
import {
  fetchCoachUserData,
  loadChatHistory,
  saveChatMessage,
  clearChatHistory,
  sendCoachMessage,
  isGroqConfigured,
  CONTEXT_MESSAGES_LIMIT,
} from '../services/coachChat';

const SUGGESTIONS_ADVANCED = [
  'How did my last run go?',
  'Am I ready to train hard today?',
  "What's my threshold pace?",
  'How is my fitness trending?',
  'Should I run tomorrow?',
  "What does my training plan say for this week?",
  'How do I improve my 5K time?',
  'Am I at risk of injury?',
];

const SUGGESTIONS_BEGINNER = [
  "I don't feel like running today",
  'How should I breathe while running?',
  'What should I wear today?',
  "My legs are sore \u2014 is that normal?",
  'How do I know if I\u2019m going too fast?',
  "I didn't finish my last session",
  'When will running get easier?',
  'What should I eat before a run?',
];

const WELCOME_MESSAGE = (name) =>
  `Hey ${name}, I've analyzed all your runs and I'm ready to help. What's on your mind?`;

const WELCOME_MESSAGE_BEGINNER = (name) =>
  `Hey ${name}! I'm here to help with anything about your running journey. No question is too simple \u2014 ask me anything!`;

function TypingIndicator() {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animate = (anim, delay) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0, duration: 300, useNativeDriver: true }),
        ])
      ).start();
    animate(dot1, 0);
    animate(dot2, 150);
    animate(dot3, 300);
  }, [dot1, dot2, dot3]);

  const opacity1 = dot1.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });
  const opacity2 = dot2.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });
  const opacity3 = dot3.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });

  return (
    <View style={styles.typingBubble}>
      <View style={styles.typingDots}>
        <Animated.View style={[styles.typingDot, { opacity: opacity1 }]} />
        <Animated.View style={[styles.typingDot, { opacity: opacity2 }]} />
        <Animated.View style={[styles.typingDot, { opacity: opacity3 }]} />
      </View>
    </View>
  );
}

function formatTime(date) {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function CoachChatScreen({ visible, onClose, initialMessage }) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { isBeginner, runnerMode } = useRunnerMode();
  const userId = user?.id;
  const SUGGESTIONS = isBeginner ? SUGGESTIONS_BEGINNER : SUGGESTIONS_ADVANCED;

  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [userData, setUserData] = useState(null);
  const [streamingContent, setStreamingContent] = useState('');
  const [error, setError] = useState(null);
  const [retryMessageId, setRetryMessageId] = useState(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  const showWelcome = messages.length === 0 && !loadingHistory;

  const loadData = useCallback(async () => {
    if (!userId) return;
    setLoadingHistory(true);
    setError(null);
    try {
      const [data, history] = await Promise.all([
        fetchCoachUserData(userId, { runnerMode }),
        loadChatHistory(userId, CONTEXT_MESSAGES_LIMIT),
      ]);
      setUserData(data);
      const asMessages = history.map((m, i) => ({
        id: `history-${i}-${m.role}`,
        role: m.role,
        content: m.content,
        createdAt: m.created_at || new Date().toISOString(),
      }));
      setMessages(asMessages);
    } catch (e) {
      setError(e.message || 'Failed to load');
    } finally {
      setLoadingHistory(false);
    }
  }, [userId]);

  useEffect(() => {
    if (visible && userId) loadData();
  }, [visible, userId, loadData]);

  useEffect(() => {
    if (initialMessage && visible && !loadingHistory && messages.length === 0) {
      setInputText(initialMessage);
    }
  }, [initialMessage, visible, loadingHistory, messages.length]);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, []);

  const sendMessage = useCallback(
    async (text) => {
      const trimmed = (text || inputText || '').trim();
      if (!trimmed || !userId || !userData || loading) return;

      setInputText('');
      setError(null);
      setRetryMessageId(null);

      const userMsg = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: trimmed,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      scrollToBottom();

      const assistantId = `assistant-${Date.now()}`;
      setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '', createdAt: new Date().toISOString(), streaming: true }]);
      setStreamingContent('');
      setLoading(true);
      scrollToBottom();

      try {
        const history = [...messages, userMsg]
          .filter((m) => m.role && m.content)
          .map((m) => ({ role: m.role, content: m.content }));
        if (history.length > CONTEXT_MESSAGES_LIMIT) history.splice(0, history.length - CONTEXT_MESSAGES_LIMIT);

        let fullReply = '';
        await sendCoachMessage({
          userMessage: trimmed,
          conversationHistory: history,
          userData,
          onChunk: (delta) => {
            fullReply += delta;
            setStreamingContent(fullReply);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: fullReply, streaming: true } : m
              )
            );
            scrollToBottom();
          },
          onDone: (finalText) => {
            fullReply = finalText;
            setStreamingContent('');
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: finalText, streaming: false } : m
              )
            );
          },
        });

        await saveChatMessage(userId, 'user', trimmed);
        await saveChatMessage(userId, 'assistant', fullReply);
      } catch (e) {
        setError(e.message || "Sorry, I'm having trouble connecting right now. Try again in a moment.");
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: '', streaming: false, error: true } : m
          )
        );
        setRetryMessageId(assistantId);
      } finally {
        setLoading(false);
        scrollToBottom();
      }
    },
    [userId, userData, messages, inputText, loading, scrollToBottom]
  );

  const handleClearHistory = useCallback(() => {
    if (!userId) return;
    setMessages([]);
    setError(null);
    setRetryMessageId(null);
    clearChatHistory(userId);
  }, [userId]);

  const handleSuggestion = useCallback(
    (text) => {
      sendMessage(text);
    },
    [sendMessage]
  );

  const handleRetry = useCallback(() => {
    const failed = messages.find((m) => m.id === retryMessageId);
    if (failed) {
      const userMsg = messages[messages.indexOf(failed) - 1];
      if (userMsg?.content) {
        setMessages((prev) => prev.filter((m) => m.id !== retryMessageId));
        setRetryMessageId(null);
        sendMessage(userMsg.content);
      }
    }
  }, [messages, retryMessageId, sendMessage]);

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[styles.container, { paddingTop: insets.top }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClearHistory} style={styles.headerBtn} hitSlop={12}>
            <Text style={styles.headerClear}>Clear</Text>
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Coach</Text>
            <Text style={styles.headerSubtitle}>Powered by AI · Knows your full running history</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.headerBtn} hitSlop={12}>
            <Text style={styles.headerClose}>✕</Text>
          </TouchableOpacity>
        </View>

        {!isGroqConfigured() && (
          <View style={styles.configBanner}>
            <Text style={styles.configBannerText}>
              Groq API key is missing. Add EXPO_PUBLIC_GROQ_API_KEY to your .env file and restart with:{' '}
              <Text style={styles.configBannerCode}>npm run start:go:lan -- --clear</Text>
            </Text>
          </View>
        )}
        {/* Messages */}
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: 16 }]}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={scrollToBottom}
          keyboardShouldPersistTaps="handled"
        >
          {loadingHistory ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color={colors.link} />
            </View>
          ) : (
            <>
              {showWelcome && (
                <View style={styles.welcomeRow}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>P</Text>
                  </View>
                  <View style={styles.coachBubble}>
                    <Text style={styles.coachLabel}>Coach</Text>
                    <Text style={styles.coachBubbleText}>
                      {isBeginner ? WELCOME_MESSAGE_BEGINNER(userData?.name || 'there') : WELCOME_MESSAGE(userData?.name || 'there')}
                    </Text>
                  </View>
                </View>
              )}
              {messages.map((msg) => (
                <View
                  key={msg.id}
                  style={[
                    styles.msgRow,
                    msg.role === 'user' ? styles.msgRowUser : styles.msgRowCoach,
                  ]}
                >
                  {msg.role === 'assistant' && (
                    <>
                      {msg.streaming && !msg.content ? (
                        <View style={styles.coachBubbleWrap}>
                          <Text style={styles.coachLabel}>Coach</Text>
                          <TypingIndicator />
                        </View>
                      ) : msg.error ? (
                        <View style={styles.errorBubble}>
                          <Text style={styles.errorText}>{error}</Text>
                          <TouchableOpacity onPress={handleRetry} style={styles.retryBtn}>
                            <Text style={styles.retryText}>Retry</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <View style={styles.coachBubbleWrap}>
                          <Text style={styles.coachLabel}>Coach</Text>
                          <View style={styles.coachBubble}>
                            <Text style={styles.coachBubbleText}>
                              {msg.content}
                              {msg.streaming && <Text style={styles.cursor}>▋</Text>}
                            </Text>
                          </View>
                          {!msg.streaming && <Text style={styles.timeText}>{formatTime(msg.createdAt)}</Text>}
                        </View>
                      )}
                    </>
                  )}
                  {msg.role === 'user' && (
                    <View style={styles.userBubbleWrap}>
                      <View style={styles.userBubble}>
                        <Text style={styles.userBubbleText}>{msg.content}</Text>
                      </View>
                      <Text style={[styles.timeText, styles.timeTextRight]}>{formatTime(msg.createdAt)}</Text>
                    </View>
                  )}
                </View>
              ))}
              {showWelcome && (
                <View style={styles.suggestionsWrap}>
                  <Text style={styles.suggestionsTitle}>Suggested questions</Text>
                  <View style={styles.suggestionsGrid}>
                    {SUGGESTIONS.map((s) => (
                      <TouchableOpacity
                        key={s}
                        style={styles.chip}
                        onPress={() => handleSuggestion(s)}
                        disabled={loading}
                      >
                        <Text style={styles.chipText}>{s}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
            </>
          )}
        </ScrollView>

        {/* Input bar */}
        <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <TextInput
            ref={inputRef}
            style={styles.input}
            placeholder="Ask your coach..."
            placeholderTextColor={colors.secondaryText}
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={2000}
            editable={!loading}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!inputText.trim() || loading) && styles.sendBtnDisabled]}
            onPress={() => sendMessage(inputText)}
            disabled={!inputText.trim() || loading}
          >
            <Text style={styles.sendIcon}>Send</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundSecondary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  headerBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerClear: {
    ...typography.secondary,
    fontSize: 15,
    color: colors.link,
    fontWeight: '600',
  },
  headerClose: {
    fontSize: 22,
    color: colors.primaryText,
    fontWeight: '600',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    ...typography.title,
    color: colors.primaryText,
  },
  headerSubtitle: {
    ...typography.caption,
    color: colors.secondaryText,
    marginTop: 2,
  },
  configBanner: {
    backgroundColor: colors.warning + '20',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  configBannerText: {
    ...typography.caption,
    color: colors.primaryText,
  },
  configBannerCode: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.screenPaddingHorizontal,
    paddingTop: 16,
    minHeight: '100%',
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 48,
  },
  welcomeRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 16,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  coachBubbleWrap: {
    maxWidth: '75%',
    alignItems: 'flex-start',
  },
  coachLabel: {
    ...typography.caption,
    color: colors.secondaryText,
    marginBottom: 4,
  },
  coachBubble: {
    backgroundColor: colors.card,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 18,
    borderTopLeftRadius: 4,
    ...theme.cardShadow,
  },
  coachBubbleText: {
    ...typography.body,
    color: colors.primaryText,
  },
  cursor: {
    color: colors.link,
  },
  typingBubble: {
    backgroundColor: colors.card,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 18,
    borderTopLeftRadius: 4,
    ...theme.cardShadow,
  },
  typingDots: {
    flexDirection: 'row',
    gap: 6,
  },
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.secondaryText,
  },
  userBubbleWrap: {
    maxWidth: '75%',
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
    marginLeft: '25%',
  },
  userBubble: {
    backgroundColor: colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 18,
    borderTopRightRadius: 4,
  },
  userBubbleText: {
    ...typography.body,
    color: '#FFFFFF',
  },
  msgRow: {
    marginBottom: 12,
  },
  msgRowUser: {
    alignItems: 'flex-end',
  },
  msgRowCoach: {
    alignItems: 'flex-start',
  },
  timeText: {
    ...typography.caption,
    color: colors.secondaryText,
    marginTop: 4,
  },
  timeTextRight: {
    textAlign: 'right',
  },
  errorBubble: {
    backgroundColor: colors.card,
    padding: 12,
    borderRadius: 18,
    borderTopLeftRadius: 4,
    maxWidth: '75%',
    ...theme.cardShadow,
  },
  errorText: {
    ...typography.body,
    color: colors.primaryText,
  },
  retryBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  retryText: {
    ...typography.secondary,
    color: colors.link,
    fontWeight: '600',
  },
  suggestionsWrap: {
    marginTop: 24,
  },
  suggestionsTitle: {
    ...typography.caption,
    color: colors.secondaryText,
    marginBottom: 12,
  },
  suggestionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  chip: {
    backgroundColor: colors.card,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    ...theme.cardShadow,
  },
  chipText: {
    ...typography.secondary,
    color: colors.link,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 12,
    backgroundColor: colors.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    paddingTop: 12,
    ...typography.body,
    color: colors.primaryText,
    marginRight: 10,
  },
  sendBtn: {
    minWidth: 44,
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 22,
    backgroundColor: colors.link,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
  sendIcon: {
    fontSize: 18,
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
