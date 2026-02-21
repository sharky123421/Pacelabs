import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Modal,
  Pressable,
  Dimensions,
} from 'react-native';
import { colors, typography, spacing, theme } from '../theme';
import { PrimaryButton, SecondaryButton } from '../components';

const PADDING = spacing.screenPaddingHorizontal;
const SECTION_TITLE = { ...typography.caption, color: colors.secondaryText, letterSpacing: 1, marginBottom: 8 };
const HAS_PLAN = true;
const SHOW_BANNER = false; // Set true for "Plan updated" banner

const SESSION_COLORS = {
  easy: colors.sessionEasy,
  tempo: colors.sessionTempo,
  intervals: colors.sessionIntervals,
  long: colors.sessionLong,
  race: colors.sessionRace,
  rest: colors.sessionRest,
};

const THIS_WEEK = [
  { id: '1', day: 'MON', date: 'Feb 17', type: 'easy', label: 'EASY RUN', distance: '8 km', target: '5:50–6:10 /km · Zone 2', status: 'completed', actual: '8.2 km' },
  { id: '2', day: 'TUE', date: 'Feb 18', type: 'rest', label: 'REST', distance: '—', target: '—', status: 'completed' },
  { id: '3', day: 'WED', date: 'Feb 19', type: 'tempo', label: 'TEMPO RUN', distance: '10 km', target: '4:48–4:55 /km · Zone 3–4', status: 'completed', actual: '10.1 km' },
  { id: '4', day: 'THU', date: 'Feb 20', type: 'easy', label: 'EASY RUN', distance: '6 km', target: '5:45–6:15 /km · Zone 2', status: 'completed', actual: '6 km' },
  { id: '5', day: 'FRI', date: 'Feb 21', type: 'rest', label: 'REST', distance: '—', target: '—', status: 'today' },
  { id: '6', day: 'SAT', date: 'Feb 22', type: 'long', label: 'LONG RUN', distance: '21 km', target: '5:20–5:40 /km · Zone 2', status: 'future' },
  { id: '7', day: 'SUN', date: 'Feb 23', type: 'easy', label: 'EASY RUN', distance: '8 km', target: '5:50–6:10 /km · Zone 2', status: 'future' },
];

const UPCOMING = [
  { day: 'Mon 24', type: 'easy', distance: '8 km', target: '5:50 /km' },
  { day: 'Tue 25', type: 'rest', distance: '—', target: '—' },
  { day: 'Wed 26', type: 'tempo', distance: '10 km', target: '4:48 /km' },
  { day: 'Thu 27', type: 'easy', distance: '6 km', target: '5:45 /km' },
  { day: 'Fri 28', type: 'rest', distance: '—', target: '—' },
  { day: 'Sat 1', type: 'long', distance: '22 km', target: '5:25 /km' },
  { day: 'Sun 2', type: 'easy', distance: '8 km', target: '5:50 /km' },
];

const CALENDAR_DAYS = []; // Generate 42 days for current month view
for (let i = 1; i <= 28; i++) {
  const d = i % 7;
  const hasSession = [2, 5, 7, 9, 12, 14, 16, 19, 21, 23, 26, 28].includes(i);
  const type = hasSession ? (i % 3 === 0 ? 'long' : i % 3 === 1 ? 'easy' : 'tempo') : 'rest';
  const completed = i < 21;
  const missed = i === 10;
  CALENDAR_DAYS.push({ day: i, type, hasSession, completed, missed, isToday: i === 21 });
}

export function PlanScreen({ navigation }) {
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'calendar'
  const [selectedDay, setSelectedDay] = useState(null);
  const weekProgress = 34 / 58;

  if (!HAS_PLAN) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Training Plan</Text>
        </View>
        <View style={styles.noPlanCard}>
          <Text style={styles.noPlanTitle}>No training plan yet</Text>
          <Text style={styles.noPlanSubtitle}>Create a personalized plan based on your running history and goals</Text>
          <PrimaryButton title="Create my plan" onPress={() => {}} style={styles.noPlanBtn} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Training Plan</Text>
        <TouchableOpacity onPress={() => {}} style={styles.editBtn}>
          <Text style={styles.editIcon}>✎</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {SHOW_BANNER && (
          <TouchableOpacity style={styles.banner}>
            <Text style={styles.bannerText}>Plan updated · Your Thursday session was adjusted based on your recovery data · Tap to see changes</Text>
          </TouchableOpacity>
        )}

        {/* SECTION 1 — PLAN OVERVIEW */}
        <View style={[styles.card, styles.overviewCard]}>
          <View style={styles.overviewTop}>
            <View style={styles.overviewLeft}>
              <Text style={styles.planName}>Marathon Plan — Berlin 2026</Text>
              <View style={styles.phaseBadge}><Text style={styles.phaseBadgeText}>BUILD PHASE</Text></View>
              <Text style={styles.weekLabel}>Week 8 of 16</Text>
            </View>
            <View style={styles.overviewRight}>
              <Text style={styles.daysUntil}>187 days</Text>
              <Text style={styles.daysLabel}>until race</Text>
              <View style={styles.circleProgress}><Text style={styles.circleProgressText}>50%</Text></View>
            </View>
          </View>
          <View style={styles.progressBarTrack}>
            <View style={[styles.progressBarFill, { width: '50%' }]} />
          </View>
          <Text style={styles.progressCaption}>Week 8 of 16 · 50% complete</Text>
        </View>

        {/* SECTION 2 — LOAD CHART */}
        <View style={styles.section}>
          <Text style={SECTION_TITLE}>TRAINING LOAD PLAN</Text>
          <View style={[styles.card, styles.chartCard]}>
            <View style={styles.loadChartPlaceholder}><Text style={styles.chartPlaceholderText}>Weekly volume by phase (Base / Build / Peak / Taper)</Text></View>
          </View>
        </View>

        {/* List | Calendar toggle */}
        <View style={styles.toggleRow}>
          <TouchableOpacity style={[styles.toggleBtn, viewMode === 'list' && styles.toggleBtnActive]} onPress={() => setViewMode('list')}>
            <Text style={[styles.toggleBtnText, viewMode === 'list' && styles.toggleBtnTextActive]}>List</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.toggleBtn, viewMode === 'calendar' && styles.toggleBtnActive]} onPress={() => setViewMode('calendar')}>
            <Text style={[styles.toggleBtnText, viewMode === 'calendar' && styles.toggleBtnTextActive]}>Calendar</Text>
          </TouchableOpacity>
        </View>

        {viewMode === 'list' && (
          <>
            {/* SECTION 3 — THIS WEEK */}
            <View style={styles.section}>
              <Text style={SECTION_TITLE}>THIS WEEK</Text>
              <Text style={styles.subtitle}>Week of Feb 17–23</Text>
              <View style={styles.weekStatsRow}>
                <Text style={styles.weekStat}>Planned: 58km</Text>
                <Text style={styles.weekStat}>Completed: 34km</Text>
                <Text style={styles.weekStat}>Remaining: 24km</Text>
              </View>
              <View style={styles.weekProgressBar}><View style={[styles.weekProgressFill, { width: `${weekProgress * 100}%` }]} /></View>
              {THIS_WEEK.map((s) => (
                <TouchableOpacity key={s.id} style={[styles.sessionCard, { borderLeftColor: SESSION_COLORS[s.type] || colors.divider }]} onPress={() => navigation.navigate('SessionDetail', { session: s })}>
                  <View style={styles.sessionCardLeft}>
                    <Text style={styles.sessionDay}>{s.day}</Text>
                    <Text style={styles.sessionDate}>{s.date}</Text>
                    <View style={[styles.sessionTypeBadge, { backgroundColor: (SESSION_COLORS[s.type] || colors.divider) + '25' }]}><Text style={[styles.sessionTypeText, { color: SESSION_COLORS[s.type] || colors.primaryText }]}>{s.label}</Text></View>
                    <Text style={styles.sessionDistance}>{s.distance}</Text>
                    <Text style={styles.sessionTarget}>{s.target}</Text>
                  </View>
                  <View style={styles.sessionCardRight}>
                    {s.status === 'completed' && <Text style={styles.statusIcon}>✓</Text>}
                    {s.status === 'completed' && s.actual && <Text style={styles.actualText}>{s.actual}</Text>}
                    {s.status === 'today' && <View style={styles.todayBadge}><Text style={styles.todayBadgeText}>Today</Text></View>}
                    {s.status === 'missed' && <Text style={styles.missedIcon}>✗</Text>}
                    {s.status === 'future' && <Text style={styles.chevron}>›</Text>}
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            {/* SECTION 4 — UPCOMING */}
            <View style={styles.section}>
              <Text style={SECTION_TITLE}>COMING UP</Text>
              {UPCOMING.map((s, i) => (
                <View key={i} style={styles.upcomingRow}>
                  <Text style={styles.upcomingDay}>{s.day}</Text>
                  <View style={[styles.upcomingBadge, { backgroundColor: (SESSION_COLORS[s.type === 'rest' ? 'rest' : s.type] || colors.divider) + '20' }]}><Text style={styles.upcomingBadgeText}>{s.type === 'rest' ? 'Rest' : s.type.toUpperCase()}</Text></View>
                  <Text style={styles.upcomingDist}>{s.distance}</Text>
                  <Text style={styles.upcomingTarget}>{s.target}</Text>
                </View>
              ))}
              <TouchableOpacity><Text style={styles.linkText}>View full calendar →</Text></TouchableOpacity>
            </View>
          </>
        )}

        {viewMode === 'calendar' && (
          <View style={styles.section}>
            <Text style={SECTION_TITLE}>FEBRUARY 2026</Text>
            <View style={styles.calendarGrid}>
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (<Text key={i} style={styles.calendarHeaderCell}>{d}</Text>))}
              {CALENDAR_DAYS.map((d) => (
                <TouchableOpacity key={d.day} style={[styles.calendarCell, d.isToday && styles.calendarCellToday]} onPress={() => setSelectedDay(d)}>
                  <Text style={[styles.calendarCellDay, d.isToday && styles.calendarCellDayToday]}>{d.day}</Text>
                  {d.hasSession && <View style={[styles.calendarDot, { backgroundColor: SESSION_COLORS[d.type] }, d.completed && styles.calendarDotDone]} />}
                  {d.missed && <Text style={styles.calendarX}>✗</Text>}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Day popup when tapping calendar cell */}
      <Modal visible={!!selectedDay} transparent animationType="slide">
        <Pressable style={styles.modalOverlay} onPress={() => setSelectedDay(null)}>
          <Pressable style={styles.dayPopup} onPress={(e) => e.stopPropagation()}>
            {selectedDay && (
              <>
                <Text style={styles.dayPopupTitle}>Feb {selectedDay.day}</Text>
                <Text style={styles.dayPopupSubtitle}>{selectedDay.hasSession ? (selectedDay.type === 'rest' ? 'Rest day' : `${selectedDay.type} run`) : 'No session'}</Text>
                <SecondaryButton title="Close" onPress={() => setSelectedDay(null)} />
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: PADDING, paddingVertical: 12 },
  headerTitle: { ...typography.largeTitle, fontWeight: '700', color: colors.primaryText },
  editBtn: { padding: 8 },
  editIcon: { fontSize: 20, color: colors.accent },
  scroll: { paddingHorizontal: PADDING, paddingBottom: 100 },
  banner: { backgroundColor: colors.accent + '20', padding: 14, borderRadius: 10, marginBottom: 16 },
  bannerText: { ...typography.secondary, color: colors.primaryText },
  card: { backgroundColor: colors.card, borderRadius: theme.radius.card, padding: 20, ...theme.cardShadow },
  overviewCard: { marginBottom: 20 },
  overviewTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  overviewLeft: {},
  planName: { ...typography.title, color: colors.primaryText, marginBottom: 8 },
  phaseBadge: { alignSelf: 'flex-start', backgroundColor: colors.accent + '25', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginBottom: 8 },
  phaseBadgeText: { ...typography.caption, fontWeight: '700', color: colors.accent },
  weekLabel: { ...typography.secondary, color: colors.secondaryText },
  overviewRight: { alignItems: 'flex-end' },
  daysUntil: { ...typography.title, fontSize: 24, color: colors.primaryText },
  daysLabel: { ...typography.caption, color: colors.secondaryText },
  circleProgress: { width: 44, height: 44, borderRadius: 22, borderWidth: 3, borderColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  circleProgressText: { ...typography.caption, fontWeight: '700', color: colors.accent },
  progressBarTrack: { height: 4, backgroundColor: colors.backgroundSecondary, borderRadius: 2, marginBottom: 8 },
  progressBarFill: { height: '100%', backgroundColor: colors.accent, borderRadius: 2 },
  progressCaption: { ...typography.caption, color: colors.secondaryText },
  section: { marginBottom: 24 },
  chartCard: {},
  loadChartPlaceholder: { height: 140, backgroundColor: colors.backgroundSecondary, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  chartPlaceholderText: { ...typography.caption, color: colors.secondaryText },
  toggleRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  toggleBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, backgroundColor: colors.backgroundSecondary },
  toggleBtnActive: { backgroundColor: colors.accent },
  toggleBtnText: { ...typography.secondary, color: colors.primaryText },
  toggleBtnTextActive: { ...typography.secondary, color: '#FFFFFF' },
  subtitle: { ...typography.caption, color: colors.secondaryText, marginBottom: 12 },
  weekStatsRow: { flexDirection: 'row', gap: 16, marginBottom: 8 },
  weekStat: { ...typography.secondary, color: colors.primaryText },
  weekProgressBar: { height: 4, backgroundColor: colors.backgroundSecondary, borderRadius: 2, marginBottom: 16 },
  weekProgressFill: { height: '100%', backgroundColor: colors.success, borderRadius: 2 },
  sessionCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.card, borderRadius: theme.radius.card, padding: 16, marginBottom: 12, borderLeftWidth: 4, ...theme.cardShadow },
  sessionCardLeft: { flex: 1 },
  sessionDay: { ...typography.caption, fontWeight: '700', color: colors.primaryText },
  sessionDate: { ...typography.caption, color: colors.secondaryText, marginBottom: 4 },
  sessionTypeBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, marginBottom: 4 },
  sessionTypeText: { ...typography.caption, fontWeight: '600' },
  sessionDistance: { ...typography.body, color: colors.primaryText },
  sessionTarget: { ...typography.caption, color: colors.secondaryText, marginTop: 2 },
  sessionCardRight: { alignItems: 'flex-end' },
  statusIcon: { fontSize: 20, color: colors.success },
  actualText: { ...typography.caption, color: colors.secondaryText },
  todayBadge: { backgroundColor: colors.accent + '25', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  todayBadgeText: { ...typography.caption, fontWeight: '600', color: colors.accent },
  missedIcon: { fontSize: 20, color: colors.destructive },
  chevron: { fontSize: 24, color: colors.secondaryText },
  upcomingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  upcomingDay: { width: 56, ...typography.secondary, color: colors.primaryText },
  upcomingBadge: { width: 72, paddingVertical: 2, borderRadius: 4 },
  upcomingBadgeText: { ...typography.caption, fontSize: 11, color: colors.primaryText },
  upcomingDist: { width: 48, ...typography.caption, color: colors.secondaryText },
  upcomingTarget: { flex: 1, ...typography.caption, color: colors.secondaryText },
  linkText: { ...typography.secondary, color: colors.accent, marginTop: 12 },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calendarHeaderCell: { width: `${100/7}%`, textAlign: 'center', ...typography.caption, color: colors.secondaryText, marginBottom: 8 },
  calendarCell: { width: `${100/7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', padding: 4 },
  calendarCellToday: { backgroundColor: colors.accent + '15', borderRadius: 20 },
  calendarCellDay: { ...typography.caption, color: colors.primaryText },
  calendarCellDayToday: { fontWeight: '700', color: colors.accent },
  calendarDot: { width: 6, height: 6, borderRadius: 3, marginTop: 2 },
  calendarDotDone: { opacity: 0.7 },
  calendarX: { ...typography.caption, color: colors.destructive, marginTop: 2 },
  noPlanCard: { flex: 1, margin: PADDING, backgroundColor: colors.card, borderRadius: theme.radius.card, padding: 32, alignItems: 'center', justifyContent: 'center', ...theme.cardShadow },
  noPlanTitle: { ...typography.title, color: colors.primaryText, marginBottom: 8 },
  noPlanSubtitle: { ...typography.body, color: colors.secondaryText, textAlign: 'center', marginBottom: 24 },
  noPlanBtn: { minWidth: 200 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  dayPopup: { backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
  dayPopupTitle: { ...typography.title, color: colors.primaryText },
  dayPopupSubtitle: { ...typography.body, color: colors.secondaryText, marginTop: 4, marginBottom: 20 },
});
