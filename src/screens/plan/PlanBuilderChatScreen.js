import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, typography, spacing, theme } from '../../theme';
import { PrimaryButton } from '../../components';
import {
  getPlanBuilderOpening,
  sendPlanBuilderReply,
  isPlanBuilderConfigured,
} from '../../services/planBuilder';

const PLAN_PURPLE = colors.coachPurple;
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function PlanBuilderChatScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const userData = route.params?.userData || null;
  const coachingAnalysis = route.params?.coachingAnalysis || null;

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [inputText, setInputText] = useState('');
  const [chips, setChips] = useState([]);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDays, setSelectedDays] = useState([]);
  const [phase, setPhase] = useState('question');
  const [userAnswers, setUserAnswers] = useState({});
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);
  const [raceDateValue, setRaceDateValue] = useState('');

  const scrollToBottom = useCallback(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!userData) {
      setLoading(false);
      setError('Missing user data');
      return;
    }
    (async () => {
      setError(null);
      try {
        const opening = await getPlanBuilderOpening(userData, coachingAnalysis);
        if (cancelled) return;
        const chips = opening.chips || [];
        if (opening.zonesAndPhilosophy) {
          setMessages([
            { id: 'opening', role: 'assistant', content: opening.message },
            {
              id: 'zones-philosophy',
              role: 'assistant',
              content: opening.zonesAndPhilosophy,
              chips,
            },
          ]);
        } else {
          setMessages([
            {
              id: 'opening',
              role: 'assistant',
              content: opening.message,
              chips,
            },
          ]);
        }
        setChips(chips);
        setPhase(opening.phase || 'question');
      } catch (e) {
        if (!cancelled) {
          setError(e.message || 'Failed to load');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userData, coachingAnalysis]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, chips, scrollToBottom]);

  const sendReply = useCallback(
    async (text) => {
      const trimmed = (text || '').trim();
      if (!trimmed || !userData || sending) return;

      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      const userMsg = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: trimmed,
      };
      setMessages((prev) => [...prev, userMsg]);
      setChips([]);
      setShowDatePicker(false);
      setInputText('');
      setSending(true);
      setError(null);

      try {
        const next = await sendPlanBuilderReply(
          [...history, { role: 'user', content: trimmed }],
          trimmed,
          userData,
          coachingAnalysis,
        );
        setMessages((prev) => [
          ...prev,
          {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: next.message,
            chips: next.chips || [],
            showDatePicker: next.showDatePicker,
            userAnswers: next.userAnswers,
          },
        ]);
        setChips(next.chips || []);
        setShowDatePicker(!!next.showDatePicker);
        if (next.phase === 'summary' && next.userAnswers) {
          setPhase('summary');
          setUserAnswers(next.userAnswers);
        }
      } catch (e) {
        setError(e.message || 'Something went wrong');
      } finally {
        setSending(false);
      }
    },
    [userData, coachingAnalysis, messages, sending]
  );

  const handleChip = useCallback(
    (chip) => {
      sendReply(chip);
    },
    [sendReply]
  );

  const handleDayToggle = useCallback((day) => {
    setSelectedDays((prev) => {
      const next = prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day];
      return next;
    });
  }, []);

  const handleDaysConfirm = useCallback(() => {
    if (selectedDays.length === 0) return;
    sendReply(selectedDays.join(', '));
    setSelectedDays([]);
  }, [selectedDays, sendReply]);

  const handleGenerate = useCallback(() => {
    navigation.replace('PlanBuilderGeneration', {
      userData,
      userAnswers: phase === 'summary' ? userAnswers : {},
    });
  }, [navigation, userData, phase, userAnswers]);

  const lastMessage = messages[messages.length - 1];
  const isSummary = phase === 'summary' && lastMessage?.role === 'assistant';
  const showDaySelector =
    chips.length > 0 &&
    chips.some((c) => DAYS.some((d) => c.toLowerCase().startsWith(d.toLowerCase())));

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={PLAN_PURPLE} />
          <Text style={styles.loadingText}>Preparing your coach...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn} hitSlop={12}>
          <Text style={styles.headerBack}>‹</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>AI Coach</Text>
          <Text style={styles.headerSubtitle}>Powered by Groq</Text>
        </View>
        <View style={styles.headerBtn} />
      </View>

      {!isPlanBuilderConfigured() && (
        <View style={styles.configBanner}>
          <Text style={styles.configBannerText}>
            Groq API key missing. Add EXPO_PUBLIC_GROQ_API_KEY to .env and restart Expo with --clear
          </Text>
        </View>
      )}

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 24 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {messages.map((msg) => (
          <View
            key={msg.id}
            style={[styles.msgRow, msg.role === 'user' ? styles.msgRowUser : styles.msgRowCoach]}
          >
            {msg.role === 'assistant' && (
              <View style={styles.planBubbleWrap}>
                <View style={[styles.avatar, { backgroundColor: PLAN_PURPLE }]}>
                  <Text style={styles.avatarText}>P</Text>
                </View>
                <View style={styles.planBubble}>
                  <Text style={styles.planLabel}>AI Coach</Text>
                  <Text style={styles.bubbleText}>{msg.content}</Text>
                </View>
              </View>
            )}
            {msg.role === 'user' && (
              <View style={styles.userBubbleWrap}>
                <View style={styles.userBubble}>
                  <Text style={styles.userBubbleText}>{msg.content}</Text>
                </View>
              </View>
            )}
          </View>
        ))}

        {error ? (
          <View style={styles.errorBubble}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {showDaySelector && chips.some((c) => DAYS.some((d) => c.toLowerCase().includes(d.toLowerCase()))) ? (
          <View style={styles.daySelectorCard}>
            <Text style={styles.daySelectorTitle}>Which days work best?</Text>
            <View style={styles.dayRow}>
              {DAYS.map((day) => (
                <TouchableOpacity
                  key={day}
                  style={[styles.dayPill, selectedDays.includes(day) && styles.dayPillSelected]}
                  onPress={() => handleDayToggle(day)}
                >
                  <Text style={[styles.dayPillText, selectedDays.includes(day) && styles.dayPillTextSelected]}>
                    {day}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={[styles.dayConfirmBtn, selectedDays.length === 0 && styles.dayConfirmDisabled]}
              onPress={handleDaysConfirm}
              disabled={selectedDays.length === 0}
            >
              <Text style={styles.dayConfirmText}>Confirm</Text>
            </TouchableOpacity>
          </View>
        ) : showDatePicker ? (
          <View style={styles.datePickerCard}>
            <Text style={styles.datePickerLabel}>Race date</Text>
            <TextInput
              style={styles.dateInput}
              placeholder="YYYY-MM-DD (e.g. 2026-04-06)"
              placeholderTextColor={colors.secondaryText}
              value={raceDateValue}
              onChangeText={setRaceDateValue}
            />
            <TouchableOpacity
              style={styles.dateConfirmBtn}
              onPress={() => {
                if (raceDateValue.trim()) sendReply(raceDateValue.trim());
                setRaceDateValue('');
              }}
            >
              <Text style={styles.dateConfirmText}>Confirm date</Text>
            </TouchableOpacity>
          </View>
        ) : chips.length > 0 && !showDaySelector && !isSummary ? (
          <View style={styles.chipsWrap}>
            {chips.map((c) => (
              <TouchableOpacity
                key={c}
                style={styles.chip}
                onPress={() => handleChip(c)}
                disabled={sending}
              >
                <Text style={styles.chipText}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {isSummary && (
          <View style={styles.summaryCard}>
            <PrimaryButton
              title="Generate my plan →"
              onPress={handleGenerate}
              style={styles.generateBtn}
            />
          </View>
        )}
      </ScrollView>

      {!isSummary && (
        <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <TextInput
            style={styles.input}
            placeholder="Type your answer..."
            placeholderTextColor={colors.secondaryText}
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={500}
            editable={!sending}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!inputText.trim() || sending) && styles.sendBtnDisabled]}
            onPress={() => sendReply(inputText)}
            disabled={!inputText.trim() || sending}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Text style={styles.sendIcon}>Send</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundSecondary,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    ...typography.body,
    color: colors.secondaryText,
    marginTop: 12,
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
  headerBack: {
    fontSize: 28,
    color: colors.accent,
    fontWeight: '300',
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
  },
  configBannerText: {
    ...typography.caption,
    color: colors.primaryText,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    minHeight: '100%',
  },
  msgRow: { marginBottom: 12 },
  msgRowUser: { alignItems: 'flex-end' },
  msgRowCoach: { alignItems: 'flex-start' },
  planBubbleWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    maxWidth: '90%',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  planBubble: {
    backgroundColor: colors.card,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 18,
    borderTopLeftRadius: 4,
    ...theme.cardShadow,
  },
  planLabel: {
    ...typography.caption,
    color: colors.secondaryText,
    marginBottom: 4,
  },
  bubbleText: {
    ...typography.body,
    color: colors.primaryText,
  },
  userBubbleWrap: { maxWidth: '80%', alignSelf: 'flex-end' },
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
  errorBubble: {
    backgroundColor: colors.destructive + '20',
    padding: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  errorText: {
    ...typography.body,
    color: colors.destructive,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
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
    color: colors.accent,
  },
  daySelectorCard: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
  },
  daySelectorTitle: {
    ...typography.caption,
    color: colors.secondaryText,
    marginBottom: 12,
  },
  dayRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  dayPill: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: colors.card,
    ...theme.cardShadow,
  },
  dayPillSelected: {
    backgroundColor: colors.accent,
  },
  dayPillText: {
    ...typography.secondary,
    color: colors.primaryText,
  },
  dayPillTextSelected: {
    color: '#FFFFFF',
  },
  dayConfirmBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: colors.accent,
    borderRadius: 12,
  },
  dayConfirmDisabled: { opacity: 0.5 },
  dayConfirmText: {
    ...typography.secondary,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  datePickerCard: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
  },
  datePickerLabel: {
    ...typography.caption,
    color: colors.secondaryText,
    marginBottom: 8,
  },
  dateInput: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 12,
    ...typography.body,
    color: colors.primaryText,
    marginBottom: 12,
  },
  dateConfirmBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: colors.accent,
    borderRadius: 12,
  },
  dateConfirmText: {
    ...typography.secondary,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  summaryCard: {
    marginTop: 24,
    padding: 20,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: theme.radius.card,
  },
  generateBtn: { minWidth: 200 },
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
    maxHeight: 100,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    ...typography.body,
    color: colors.primaryText,
    marginRight: 10,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.link,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.5 },
  sendIcon: {
    fontSize: 18,
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
