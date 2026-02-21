import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  Pressable,
  TextInput,
  Switch,
  Linking,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { colors, typography, spacing, theme } from '../theme';
import { PrimaryButton, SecondaryButton } from '../components';
import {
  getAppleHealthConnection,
  saveAppleHealthConnection,
  disconnectAppleHealth,
  fullSync,
  requestPermissions,
} from '../services/appleHealth';
import { supabase } from '../lib/supabase';

const PADDING = spacing.screenPaddingHorizontal;
const SECTION_TITLE = { ...typography.caption, color: colors.secondaryText, letterSpacing: 1, marginBottom: 12 };

const STRAVA_CONNECTED = true;
const GARMIN_CONNECTED = false;

const SHOES = [
  { id: '1', name: 'Nike Vaporfly 3', brand: 'Nike', model: 'Vaporfly 3', distance: 487, target: 700, status: 'good' },
  { id: '2', name: 'Saucony Endorphin Speed', brand: 'Saucony', model: 'Endorphin Speed', distance: 620, target: 700, status: 'replace' },
];

const PRS = [
  { label: '5K', time: '21:34', date: '3 Dec 2025' },
  { label: '10K', time: '44:12', date: '8 Feb 2026' },
  { label: 'Half Marathon', time: '1:38:22', date: '15 Dec 2025' },
  { label: 'Marathon', time: '3:24:08', date: '20 Oct 2025' },
];

export function ProfileScreen({ navigation }) {
  const { user, signOut } = useAuth();
  const name = user?.user_metadata?.display_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Runner';
  const email = user?.email || '';
  const initials = name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();

  const [unitsKm, setUnitsKm] = useState(true);
  const [pacePerKm, setPacePerKm] = useState(true);
  const [weekStartsMonday, setWeekStartsMonday] = useState(true);
  const [manualLogVisible, setManualLogVisible] = useState(false);
  const [addShoeVisible, setAddShoeVisible] = useState(false);

  const [appleConnection, setAppleConnection] = useState(null);
  const [appleWellnessToday, setAppleWellnessToday] = useState(null);
  const [appleLoading, setAppleLoading] = useState(false);
  const [appleError, setAppleError] = useState(null);

  const userId = user?.id;

  const loadAppleHealth = useCallback(async () => {
    if (!userId) return;
    setAppleError(null);
    try {
      const conn = await getAppleHealthConnection(userId);
      setAppleConnection(conn || null);
      if (conn) {
        const today = new Date().toISOString().slice(0, 10);
        const { data } = await supabase
          .from('apple_wellness')
          .select('*')
          .eq('user_id', userId)
          .eq('date', today)
          .maybeSingle();
        setAppleWellnessToday(data || null);
      } else {
        setAppleWellnessToday(null);
      }
    } catch (e) {
      setAppleError(e.message);
    }
  }, [userId]);

  useEffect(() => {
    loadAppleHealth();
  }, [loadAppleHealth]);

  const handleConnectAppleHealth = async () => {
    if (!userId) return;
    setAppleLoading(true);
    setAppleError(null);
    try {
      const result = await requestPermissions();
      if (result.error) {
        if (result.error.includes('denied') || result.error.includes('Permission')) {
          Alert.alert(
            'Health access needed',
            'Pacelab needs permission to read HRV, sleep, and workouts to optimize your training. You can enable it in Settings → Health → Data Access.',
            [{ text: 'Cancel' }, { text: 'Open Settings', onPress: () => Linking.openSettings() }]
          );
        } else {
          setAppleError(result.error);
        }
        return;
      }
      await saveAppleHealthConnection(userId, result.granted || []);
      await fullSync(userId);
      await loadAppleHealth();
    } catch (e) {
      setAppleError(e.message || 'Connection failed');
    } finally {
      setAppleLoading(false);
    }
  };

  const handleDisconnectAppleHealth = () => {
    Alert.alert(
      'Disconnect Apple Health',
      'Your historical wellness data will be kept. You can reconnect anytime.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            if (!userId) return;
            try {
              await disconnectAppleHealth(userId);
              setAppleConnection(null);
              setAppleWellnessToday(null);
            } catch (e) {
              setAppleError(e.message);
            }
          },
        },
      ]
    );
  };

  const formatLastSynced = (lastSyncedAt) => {
    if (!lastSyncedAt) return 'Never';
    const min = Math.floor((Date.now() - new Date(lastSyncedAt).getTime()) / 60000);
    if (min < 1) return 'Just now';
    if (min < 60) return `${min} min ago`;
    const h = Math.floor(min / 60);
    return `${h} hr ago`;
  };

  const appleConnected = !!appleConnection;
  const appleSubtitle = appleConnected
    ? `Connected · Last synced ${formatLastSynced(appleConnection?.last_synced_at)}`
    : 'Sync from your Apple Watch';
  const applePreview = appleWellnessToday?.hrv_status
    ? `HRV ${appleWellnessToday.hrv_last_night ?? '—'}ms · ${appleWellnessToday.hrv_status}`
    : null;

  const handleSignOut = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => signOut().then(() => navigation.getParent()?.getParent()?.reset({ index: 0, routes: [{ name: 'Welcome' }] })) },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
        <TouchableOpacity onPress={() => {}} style={styles.settingsBtn}>
          <Text style={styles.settingsIcon}>⚙</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* SECTION 1 — USER CARD */}
        <View style={[styles.card, styles.userCard]}>
          <View style={styles.userTop}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></View>
            <View style={styles.userInfo}>
              <Text style={styles.userName}>{name}</Text>
              <Text style={styles.userEmail}>{email}</Text>
              <Text style={styles.memberSince}>Pacelab member since Jan 2026</Text>
            </View>
          </View>
          <View style={styles.statsRow}>
            <View style={styles.statBlock}><Text style={styles.statValue}>247</Text><Text style={styles.statLabel}>Total Runs</Text></View>
            <View style={styles.statBlock}><Text style={styles.statValue}>1,847 km</Text><Text style={styles.statLabel}>Distance</Text></View>
            <View style={styles.statBlock}><Text style={styles.statValue}>186h</Text><Text style={styles.statLabel}>Time</Text></View>
          </View>
        </View>

        {/* SECTION 2 — RUNNER PROFILE SUMMARY */}
        <Text style={SECTION_TITLE}>YOUR PROFILE</Text>
        <View style={styles.card}>
          <View style={styles.levelBadge}><Text style={styles.levelBadgeText}>INTERMEDIATE RUNNER</Text></View>
          <View style={styles.metricsGrid}>
            <View style={styles.metricBox}><Text style={styles.metricValue}>52.4</Text><Text style={styles.metricLabel}>VO2 Max</Text></View>
            <View style={styles.metricBox}><Text style={styles.metricValue}>4:52 /km</Text><Text style={styles.metricLabel}>Threshold</Text></View>
            <View style={styles.metricBox}><Text style={styles.metricValue}>5:45–6:20</Text><Text style={styles.metricLabel}>Easy Zone</Text></View>
            <View style={styles.metricBox}><Text style={styles.metricValue}>~54 km</Text><Text style={styles.metricLabel}>Weekly Base</Text></View>
          </View>
          <TouchableOpacity onPress={() => navigation.navigate('AnalyticsTab')} style={styles.linkRow}>
            <Text style={styles.linkText}>View full analytics</Text>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        </View>

        {/* SECTION 3 — CONNECTED SERVICES */}
        <Text style={SECTION_TITLE}>CONNECTIONS</Text>
        <View style={styles.card}>
          <ConnectionRow icon="S" iconColor={colors.stravaOrange} title="Strava" connected={STRAVA_CONNECTED} subtitle={STRAVA_CONNECTED ? '247 runs imported · Last synced: 2 min ago' : 'Import all your runs instantly'} connectLabel="Connect Strava" last={false} />
          <ConnectionRow icon="G" iconColor="#000" title="Garmin Connect" connected={GARMIN_CONNECTED} subtitle={GARMIN_CONNECTED ? 'Syncing Body Battery · HRV · Sleep' : 'Sync readiness and wellness data'} connectLabel="Connect Garmin" last={false} />
          <ConnectionRow
            icon="⌚"
            iconColor="#000"
            title="Apple Health"
            connected={appleConnected}
            subtitle={appleSubtitle}
            connectLabel="Connect Apple Health"
            last
            onConnect={handleConnectAppleHealth}
            onDisconnect={handleDisconnectAppleHealth}
            loading={appleLoading}
            preview={applePreview}
            error={appleError}
          />
        </View>

        {/* SECTION 4 — IMPORT */}
        <Text style={SECTION_TITLE}>IMPORT DATA</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.importRow} onPress={() => navigation.getParent()?.getParent()?.navigate('OnboardingGPXImport')}>
            <Text style={styles.importIcon}>📄</Text>
            <View style={styles.importTextBlock}>
              <Text style={styles.importTitle}>Import GPX Files</Text>
              <Text style={styles.importSubtitle}>Import runs from Garmin or any device</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.importRow} onPress={() => setManualLogVisible(true)}>
            <Text style={styles.importIcon}>+</Text>
            <View style={styles.importTextBlock}>
              <Text style={styles.importTitle}>Log a Run Manually</Text>
              <Text style={styles.importSubtitle}>Add a run without GPS data</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        </View>

        {/* SECTION 5 — SHOES */}
        <Text style={SECTION_TITLE}>SHOES</Text>
        <View style={styles.card}>
          {SHOES.map((s) => (
            <View key={s.id} style={styles.shoeCard}>
              <Text style={styles.shoeName}>{s.name}</Text>
              <Text style={styles.shoeMeta}>{s.brand} · {s.model}</Text>
              <Text style={styles.shoeDist}>{s.distance} km logged</Text>
              <View style={styles.shoeProgressTrack}><View style={[styles.shoeProgressFill, { width: `${Math.min(100, (s.distance / s.target) * 100)}%`, backgroundColor: s.status === 'good' ? colors.success : s.status === 'replace' ? colors.warning : colors.secondaryText }]} /></View>
              <Text style={[styles.shoeStatus, s.status === 'good' && { color: colors.success }, s.status === 'replace' && { color: colors.warning }]}>{s.status === 'good' ? 'Good condition' : s.status === 'replace' ? 'Replace soon' : 'Retired'}</Text>
            </View>
          ))}
          <TouchableOpacity style={styles.addShoeRow} onPress={() => setAddShoeVisible(true)}>
            <Text style={styles.addShoeText}>+ Add shoe</Text>
          </TouchableOpacity>
        </View>

        {/* SECTION 6 — PERSONAL BESTS */}
        <Text style={SECTION_TITLE}>PERSONAL BESTS</Text>
        <View style={styles.card}>
          {PRS.map((pr) => (
            <TouchableOpacity key={pr.label} style={styles.prRow} onPress={() => navigation.navigate('RunsTab', { screen: 'RunDetail', params: { runId: pr.label } })}>
              <Text style={styles.prLabel}>{pr.label}</Text>
              <Text style={styles.prTime}>{pr.time}</Text>
              <Text style={styles.prDate}>{pr.date}</Text>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* SECTION 7 — PREFERENCES */}
        <Text style={SECTION_TITLE}>PREFERENCES</Text>
        <View style={styles.card}>
          <Row label="Distance units" right={<Switch value={unitsKm} onValueChange={setUnitsKm} trackColor={{ false: colors.divider, true: colors.accent }} />} />
          <Row label="Pace format" right={<Switch value={pacePerKm} onValueChange={setPacePerKm} trackColor={{ false: colors.divider, true: colors.accent }} />} />
          <Row label="Week starts on" right={<Text style={styles.rowValue}>{weekStartsMonday ? 'Monday' : 'Sunday'}</Text>} onPress={() => setWeekStartsMonday(!weekStartsMonday)} />
          <Row label="Heart rate zones" right={<Text style={styles.chevron}>›</Text>} onPress={() => {}} />
        </View>

        {/* SECTION 8 — TRAINING */}
        <Text style={SECTION_TITLE}>TRAINING</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.prefRow} onPress={() => {}}><Text style={styles.prefRowText}>Training plan settings</Text><Text style={styles.chevron}>›</Text></TouchableOpacity>
          <TouchableOpacity style={styles.prefRow} onPress={() => {}}><Text style={styles.prefRowText}>Notifications</Text><Text style={styles.chevron}>›</Text></TouchableOpacity>
        </View>

        {/* SECTION 9 — ACCOUNT */}
        <Text style={SECTION_TITLE}>ACCOUNT</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.prefRow} onPress={() => {}}><Text style={styles.prefRowText}>Edit Profile</Text><Text style={styles.chevron}>›</Text></TouchableOpacity>
          <TouchableOpacity style={styles.prefRow} onPress={() => {}}><Text style={styles.prefRowText}>Change Password</Text><Text style={styles.chevron}>›</Text></TouchableOpacity>
          <TouchableOpacity style={styles.prefRow} onPress={() => {}}><Text style={styles.prefRowText}>Privacy Policy</Text><Text style={styles.chevron}>›</Text></TouchableOpacity>
          <TouchableOpacity style={styles.prefRow} onPress={() => {}}><Text style={styles.prefRowText}>Terms of Service</Text><Text style={styles.chevron}>›</Text></TouchableOpacity>
          <TouchableOpacity style={styles.prefRow} onPress={() => {}}><Text style={styles.prefRowText}>Help & Support</Text><Text style={styles.chevron}>›</Text></TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Manual log modal */}
      <Modal visible={manualLogVisible} transparent animationType="slide">
        <Pressable style={styles.modalOverlay} onPress={() => setManualLogVisible(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Log a run manually</Text>
            <TextInput style={styles.input} placeholder="Date" placeholderTextColor={colors.secondaryText} />
            <TextInput style={styles.input} placeholder="Distance (km)" placeholderTextColor={colors.secondaryText} keyboardType="decimal-pad" />
            <TextInput style={styles.input} placeholder="Duration (e.g. 45:30)" placeholderTextColor={colors.secondaryText} />
            <TextInput style={styles.input} placeholder="Avg HR" placeholderTextColor={colors.secondaryText} keyboardType="number-pad" />
            <Text style={styles.sliderLabel}>Perceived effort (1–10)</Text>
            <View style={styles.sliderPlaceholder} />
            <TextInput style={styles.input} placeholder="Notes" placeholderTextColor={colors.secondaryText} multiline />
            <PrimaryButton title="Save run" onPress={() => setManualLogVisible(false)} style={styles.modalBtn} />
            <SecondaryButton title="Cancel" onPress={() => setManualLogVisible(false)} />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Add shoe modal */}
      <Modal visible={addShoeVisible} transparent animationType="slide">
        <Pressable style={styles.modalOverlay} onPress={() => setAddShoeVisible(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Add shoe</Text>
            <TextInput style={styles.input} placeholder="Brand" placeholderTextColor={colors.secondaryText} />
            <TextInput style={styles.input} placeholder="Model" placeholderTextColor={colors.secondaryText} />
            <TextInput style={styles.input} placeholder="Nickname" placeholderTextColor={colors.secondaryText} />
            <TextInput style={styles.input} placeholder="Starting distance (km)" placeholderTextColor={colors.secondaryText} keyboardType="decimal-pad" />
            <TextInput style={styles.input} placeholder="Retirement distance (default 700 km)" placeholderTextColor={colors.secondaryText} keyboardType="number-pad" />
            <View style={styles.toggleRow}><Text style={styles.toggleLabel}>Set as active shoe</Text><Switch value={true} onValueChange={() => {}} trackColor={{ false: colors.divider, true: colors.accent }} /></View>
            <PrimaryButton title="Add shoe" onPress={() => setAddShoeVisible(false)} style={styles.modalBtn} />
            <SecondaryButton title="Cancel" onPress={() => setAddShoeVisible(false)} />
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function ConnectionRow({ icon, iconColor, title, connected, subtitle, connectLabel, last, onConnect, onDisconnect, loading, preview, error }) {
  return (
    <View style={[styles.connectionRow, last && styles.connectionRowLast]}>
      <View style={[styles.connectionIcon, { backgroundColor: (iconColor || colors.accent) + '25' }]}><Text style={[styles.connectionIconText, { color: iconColor || colors.accent }]}>{icon}</Text></View>
      <View style={styles.connectionText}>
        <Text style={styles.connectionTitle}>{title}</Text>
        <View style={styles.connectionStatus}>
          <View style={[styles.statusDot, { backgroundColor: connected ? colors.success : colors.secondaryText }]} />
          <Text style={styles.connectionSubtitle}>{connected ? 'Connected' : 'Not connected'}</Text>
        </View>
        {connected && <Text style={styles.syncTime}>{subtitle}</Text>}
        {connected && preview && <Text style={styles.syncTime}>{preview}</Text>}
        {!connected && <Text style={styles.connectionHint}>{subtitle}</Text>}
        {error && <Text style={styles.connectionError}>{error}</Text>}
      </View>
      {connected ? (
        <TouchableOpacity onPress={onDisconnect} disabled={loading}>
          <Text style={styles.disconnectText}>Disconnect</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity onPress={onConnect ? () => onConnect() : undefined} disabled={loading}>
          <Text style={styles.connectBtnText}>{loading ? 'Connecting…' : connectLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function Row({ label, right, onPress }) {
  const Wrapper = onPress ? TouchableOpacity : View;
  return (
    <Wrapper style={styles.prefRow} onPress={onPress}>
      <Text style={styles.prefRowText}>{label}</Text>
      {right}
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: PADDING, paddingVertical: 12 },
  headerTitle: { ...typography.largeTitle, fontWeight: '700', color: colors.primaryText },
  settingsBtn: { padding: 8 },
  settingsIcon: { fontSize: 22 },
  scroll: { paddingHorizontal: PADDING, paddingBottom: 100 },
  card: { backgroundColor: colors.card, borderRadius: theme.radius.card, padding: 20, marginBottom: 16, ...theme.cardShadow },
  userCard: {},
  userTop: { flexDirection: 'row', marginBottom: 20 },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginRight: 16 },
  avatarText: { ...typography.title, fontSize: 24, color: '#FFFFFF' },
  userInfo: { flex: 1 },
  userName: { ...typography.title, fontSize: 22, color: colors.primaryText },
  userEmail: { ...typography.caption, color: colors.secondaryText, marginTop: 4 },
  memberSince: { ...typography.caption, color: colors.secondaryText, marginTop: 4 },
  statsRow: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider, paddingTop: 16 },
  statBlock: { flex: 1, alignItems: 'center' },
  statValue: { ...typography.title, color: colors.primaryText },
  statLabel: { ...typography.caption, color: colors.secondaryText, marginTop: 4 },
  levelBadge: { alignSelf: 'flex-start', backgroundColor: colors.accent + '20', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginBottom: 16 },
  levelBadgeText: { ...typography.caption, fontWeight: '700', color: colors.accent, letterSpacing: 0.5 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 },
  metricBox: { width: '48%', backgroundColor: colors.backgroundSecondary, padding: 12, borderRadius: 10 },
  metricValue: { ...typography.title, color: colors.primaryText },
  metricLabel: { ...typography.caption, color: colors.secondaryText, marginTop: 4 },
  linkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  linkText: { ...typography.secondary, color: colors.accent },
  chevron: { ...typography.body, color: colors.secondaryText, marginLeft: 4 },
  connectionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  connectionRowLast: { borderBottomWidth: 0 },
  connectionIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  connectionIconText: { fontSize: 18, fontWeight: '700' },
  connectionText: { flex: 1 },
  connectionTitle: { ...typography.body, fontWeight: '600', color: colors.primaryText },
  connectionStatus: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  statusDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  connectionSubtitle: { ...typography.caption, color: colors.secondaryText },
  syncTime: { ...typography.caption, color: colors.secondaryText, marginTop: 2 },
  connectionHint: { ...typography.caption, color: colors.secondaryText, marginTop: 2 },
  disconnectText: { ...typography.caption, color: colors.destructive },
  connectBtnText: { ...typography.secondary, color: colors.accent },
  connectionError: { ...typography.caption, color: colors.destructive, marginTop: 4 },
  importRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  importIcon: { fontSize: 20, marginRight: 12, width: 28, textAlign: 'center' },
  importTextBlock: { flex: 1 },
  importTitle: { ...typography.body, color: colors.primaryText },
  importSubtitle: { ...typography.caption, color: colors.secondaryText, marginTop: 2 },
  shoeCard: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  shoeName: { ...typography.body, fontWeight: '600', color: colors.primaryText },
  shoeMeta: { ...typography.caption, color: colors.secondaryText, marginTop: 2 },
  shoeDist: { ...typography.caption, color: colors.primaryText, marginTop: 4 },
  shoeProgressTrack: { height: 6, backgroundColor: colors.backgroundSecondary, borderRadius: 3, marginTop: 6, overflow: 'hidden' },
  shoeProgressFill: { height: '100%', borderRadius: 3 },
  shoeStatus: { ...typography.caption, marginTop: 6 },
  addShoeRow: { paddingVertical: 14 },
  addShoeText: { ...typography.body, color: colors.accent },
  prRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  prLabel: { width: 100, ...typography.body, color: colors.primaryText },
  prTime: { flex: 1, ...typography.body, fontWeight: '600', color: colors.primaryText },
  prDate: { ...typography.caption, color: colors.secondaryText },
  prefRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  prefRowText: { ...typography.body, color: colors.primaryText },
  rowValue: { ...typography.secondary, color: colors.secondaryText },
  signOutBtn: { alignSelf: 'center', paddingVertical: 20 },
  signOutText: { ...typography.body, color: colors.destructive },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, maxHeight: '90%' },
  modalTitle: { ...typography.title, color: colors.primaryText, marginBottom: 20 },
  input: { backgroundColor: colors.backgroundSecondary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, ...typography.body, color: colors.primaryText, marginBottom: 12 },
  sliderLabel: { ...typography.caption, color: colors.secondaryText, marginBottom: 8 },
  sliderPlaceholder: { height: 32, backgroundColor: colors.backgroundSecondary, borderRadius: 8, marginBottom: 12 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  toggleLabel: { ...typography.body, color: colors.primaryText },
  modalBtn: { marginBottom: 12 },
});
