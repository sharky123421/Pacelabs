import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
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
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useRunnerMode } from '../contexts/RunnerModeContext';
import { colors, typography, spacing, theme } from '../theme';
import { PrimaryButton, SecondaryButton, Input } from '../components';
import {
  getAppleHealthConnection,
  saveAppleHealthConnection,
  disconnectAppleHealth,
  fullSync,
  requestPermissions,
} from '../services/appleHealth';
import { directUploadAndProcess } from '../services/appleHealthExport';
import * as DocumentPicker from 'expo-document-picker';
import { isExpoGo } from '../lib/expoGo';
import { openStravaOAuth } from '../services/stravaAuth';
import { supabase, getSupabaseFunctionsUrl } from '../lib/supabase';

const PADDING = spacing.screenPaddingHorizontal;

const GARMIN_CONNECTED = false;

export function ProfileScreen({ navigation }) {
  const { user, signOut, keepLoggedIn, setKeepLoggedIn } = useAuth();
  const { isBeginner, runnerMode, setRunnerMode } = useRunnerMode();
  const name = user?.user_metadata?.display_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Runner';
  const email = user?.email || '';
  const initials = name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();

  const [unitsKm, setUnitsKm] = useState(true);
  const [pacePerKm, setPacePerKm] = useState(true);
  const [weekStartsMonday, setWeekStartsMonday] = useState(true);
  const [manualLogVisible, setManualLogVisible] = useState(false);
  const [addShoeVisible, setAddShoeVisible] = useState(false);

  // Change password state
  const [changePasswordVisible, setChangePasswordVisible] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  // Edit profile state
  const [editProfileVisible, setEditProfileVisible] = useState(false);
  const [editName, setEditName] = useState(name);
  const [editLoading, setEditLoading] = useState(false);

  const [appleConnection, setAppleConnection] = useState(null);
  const [appleWellnessToday, setAppleWellnessToday] = useState(null);
  const [appleLoading, setAppleLoading] = useState(false);
  const [appleError, setAppleError] = useState(null);
  const [appleImportLoading, setAppleImportLoading] = useState(false);
  const [appleImportStatus, setAppleImportStatus] = useState(null);

  const [stravaConnection, setStravaConnection] = useState(null);
  const [stravaLoading, setStravaLoading] = useState(false);
  const [stravaSyncLoading, setStravaSyncLoading] = useState(false);
  const [stravaError, setStravaError] = useState(null);
  const lastStravaAutoSyncRef = useRef(0);
  const STRAVA_AUTO_SYNC_INTERVAL_MS = 2 * 60 * 1000;
  const [profileRefreshing, setProfileRefreshing] = useState(false);

  const [runStats, setRunStats] = useState({ totalRuns: 0, totalDistanceKm: 0, totalDurationSeconds: 0 });

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

  const loadStravaConnection = useCallback(async () => {
    if (!userId) return;
    setStravaError(null);
    try {
      const { data } = await supabase
        .from('strava_connections')
        .select('id, last_synced_at, is_active')
        .eq('user_id', userId)
        .eq('is_active', true)
        .maybeSingle();
      setStravaConnection(data ?? null);
    } catch (e) {
      setStravaError(e.message);
    }
  }, [userId]);

  const loadRunStats = useCallback(async () => {
    try {
      await supabase.auth.refreshSession();
      const { data, error } = await supabase.rpc('get_my_run_stats');
      if (!error && data != null) {
        const raw = Array.isArray(data) ? data[0] : data;
        const stats = raw ?? {};
        setRunStats({
          totalRuns: Number(stats.total_runs) || 0,
          totalDistanceKm: Number(stats.total_distance_km) || 0,
          totalDurationSeconds: Number(stats.total_duration_seconds) || 0,
        });
        return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id ?? userId;
      if (!uid) {
        setRunStats({ totalRuns: 0, totalDistanceKm: 0, totalDurationSeconds: 0 });
        return;
      }
      const { data: runs, error: qErr } = await supabase
        .from('runs')
        .select('id, distance_meters, duration_seconds')
        .eq('user_id', uid)
        .is('deleted_at', null);
      if (qErr) {
        setRunStats({ totalRuns: 0, totalDistanceKm: 0, totalDurationSeconds: 0 });
        return;
      }
      const list = runs ?? [];
      setRunStats({
        totalRuns: list.length,
        totalDistanceKm: list.reduce((s, r) => s + (Number(r.distance_meters) || 0), 0) / 1000,
        totalDurationSeconds: list.reduce((s, r) => s + (Number(r.duration_seconds) || 0), 0),
      });
    } catch (_) {
      setRunStats({ totalRuns: 0, totalDistanceKm: 0, totalDurationSeconds: 0 });
    }
  }, [userId]);

  useEffect(() => { loadAppleHealth(); }, [loadAppleHealth]);
  useEffect(() => { loadStravaConnection(); }, [loadStravaConnection]);
  useEffect(() => { loadRunStats(); }, [loadRunStats]);

  const handleChangePassword = async () => {
    setPasswordError('');
    if (!newPassword || newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }
    setPasswordLoading(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password: newPassword });
      if (err) {
        setPasswordError(err.message);
      } else {
        Alert.alert('Password updated', 'Your password has been changed successfully.');
        setChangePasswordVisible(false);
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch (e) {
      setPasswordError(e.message || 'Something went wrong');
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleEditProfile = async () => {
    if (!editName.trim()) {
      Alert.alert('Name required', 'Please enter your display name.');
      return;
    }
    setEditLoading(true);
    try {
      const { error: err } = await supabase.auth.updateUser({
        data: { display_name: editName.trim() },
      });
      if (err) {
        Alert.alert('Error', err.message);
      } else {
        Alert.alert('Profile updated', 'Your name has been updated.');
        setEditProfileVisible(false);
      }
    } catch (e) {
      Alert.alert('Error', e.message || 'Something went wrong');
    } finally {
      setEditLoading(false);
    }
  };

  const handleImportAppleHealthExport = async () => {
    if (!userId) return;
    setAppleError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/zip', 'application/xml', 'text/xml'],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      setAppleImportLoading(true);
      setAppleImportStatus('Uploading and processing...');
      const data = await directUploadAndProcess(
        asset.uri,
        asset.name || 'export.zip',
        (detail) => setAppleImportStatus(detail),
      );
      await loadAppleHealth();
      await loadRunStats();
      Alert.alert(
        'Import complete',
        `${data.wellnessRows} days of health data and ${data.runsInserted} runs imported.${data.connectionCreated ? ' Apple Health is now connected.' : ''}`
      );
    } catch (e) {
      setAppleError(e.message || 'Import failed');
    } finally {
      setAppleImportLoading(false);
      setAppleImportStatus(null);
    }
  };

  const handleConnectAppleHealth = async () => {
    if (!userId) return;
    if (isExpoGo) {
      handleImportAppleHealthExport();
      return;
    }
    setAppleLoading(true);
    setAppleError(null);
    try {
      const result = await requestPermissions();
      if (result.error) {
        if (result.error.includes('denied') || result.error.includes('Permission')) {
          Alert.alert(
            'Health access needed',
            'Pacelab needs permission to read HRV, sleep, and workouts to optimize your training. You can enable it in Settings \u2192 Health \u2192 Data Access.',
            [{ text: 'Cancel' }, { text: 'Open Settings', onPress: () => Linking.openSettings() }]
          );
        } else {
          setAppleError(result.error);
        }
        return;
      }
      if (result.simulator) {
        Alert.alert('Simulator', "Apple Health isn't available in the simulator. You're connected with sample data so you can try the app.", [{ text: 'OK' }]);
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
    Alert.alert('Disconnect Apple Health', 'Your historical wellness data will be kept. You can reconnect anytime.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect', style: 'destructive',
        onPress: async () => {
          if (!userId) return;
          try { await disconnectAppleHealth(userId); setAppleConnection(null); setAppleWellnessToday(null); } catch (e) { setAppleError(e.message); }
        },
      },
    ]);
  };

  const formatLastSynced = (lastSyncedAt) => {
    if (!lastSyncedAt) return 'Never';
    const min = Math.floor((Date.now() - new Date(lastSyncedAt).getTime()) / 60000);
    if (min < 1) return 'Just now';
    if (min < 60) return `${min} min ago`;
    return `${Math.floor(min / 60)} hr ago`;
  };

  const formatTotalTime = (totalSeconds) => {
    if (!totalSeconds || totalSeconds < 0) return '0h';
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    if (h >= 1) return m > 0 ? `${h}h ${m}m` : `${h}h`;
    return m > 0 ? `${m} min` : '0 min';
  };

  const handleConnectStrava = async () => {
    if (!userId) { setStravaError('You must be signed in to connect Strava.'); return; }
    setStravaLoading(true);
    setStravaError(null);
    try {
      await openStravaOAuth(userId);
      await loadStravaConnection();
    } catch (e) {
      setStravaError(e?.message || 'Connection failed');
    } finally {
      setStravaLoading(false);
    }
  };

  const triggerStravaSync = useCallback(
    async (silent = false) => {
      if (!userId || !stravaConnection?.is_active) return;
      if (!silent) setStravaSyncLoading(true);
      setStravaError(null);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        let token = session?.access_token;
        if (!token) {
          const { data: { session: refreshed } } = await supabase.auth.refreshSession();
          token = refreshed?.access_token;
        }
        if (!token) throw new Error('Not signed in');
        const functionsUrl = getSupabaseFunctionsUrl();
        if (!functionsUrl) throw new Error('Supabase URL not configured');
        const res = await fetch(`${functionsUrl}/strava-sync-manual`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ full_sync: true }),
        });
        const text = await res.text();
        let json = {};
        try { json = text ? JSON.parse(text) : {}; } catch (_) { }
        if (!res.ok) {
          const errMsg = json.error || text || `Sync failed (${res.status})`;
          if (res.status === 429 || /rate limit/i.test(errMsg)) throw new Error('Strava rate limit \u2013 try again in about 15 min.');
          throw new Error(errMsg);
        }
        const totalActivities = json.totalActivities ?? json.checked ?? 0;
        const runActivities = json.runActivities ?? json.checked ?? 0;
        const synced = json.synced ?? 0;
        if (!silent) Alert.alert('Sync complete', `${totalActivities} activities from Strava. ${runActivities} were runs. ${synced} new runs imported.`);
        await loadStravaConnection();
        await new Promise((r) => setTimeout(r, 1200));
        await loadRunStats();
      } catch (e) {
        if (!silent) {
          const msg = e?.message || 'Sync failed';
          setStravaError(msg);
          if (msg.includes('rate limit')) lastStravaAutoSyncRef.current = Date.now() + 14 * 60 * 1000;
        }
      } finally {
        if (!silent) setStravaSyncLoading(false);
      }
    },
    [userId, stravaConnection, loadStravaConnection, loadRunStats]
  );

  const handleSyncNowStrava = () => triggerStravaSync(false);

  useFocusEffect(
    useCallback(() => {
      if (!userId || !stravaConnection?.is_active) return;
      const now = Date.now();
      if (now - lastStravaAutoSyncRef.current < STRAVA_AUTO_SYNC_INTERVAL_MS) return;
      lastStravaAutoSyncRef.current = now;
      triggerStravaSync(true);
    }, [userId, stravaConnection?.is_active, triggerStravaSync])
  );

  useFocusEffect(useCallback(() => { loadRunStats(); }, [loadRunStats]));

  const handleDisconnectStrava = () => {
    Alert.alert('Disconnect Strava', 'Your imported runs will be kept. You can reconnect anytime.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect', style: 'destructive',
        onPress: async () => {
          if (!userId) return;
          try {
            await supabase.from('strava_connections').update({ is_active: false, access_token: '', refresh_token: '' }).eq('user_id', userId);
            setStravaConnection(null);
          } catch (e) { setStravaError(e.message); }
        },
      },
    ]);
  };

  const stravaConnected = !!stravaConnection?.is_active;
  const stravaSubtitle = stravaConnected ? `Last synced ${formatLastSynced(stravaConnection?.last_synced_at)}` : 'Import all your runs instantly';
  const appleConnected = !!appleConnection;
  const appleSubtitle = appleConnected ? `Connected \u00b7 Last synced ${formatLastSynced(appleConnection?.last_synced_at)}` : isExpoGo ? 'Import data from the Health app' : 'Sync from your Apple Watch';
  const applePreview = appleWellnessToday?.hrv_status ? `HRV ${appleWellnessToday.hrv_last_night ?? '--'}ms \u00b7 ${appleWellnessToday.hrv_status}` : null;

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
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={profileRefreshing}
            onRefresh={async () => { setProfileRefreshing(true); await Promise.all([loadRunStats(), loadStravaConnection(), loadAppleHealth()]); setProfileRefreshing(false); }}
          />
        }
      >
        {/* USER CARD */}
        <View style={[styles.card, styles.userCard]}>
          <View style={styles.userTop}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></View>
            <View style={styles.userInfo}>
              <Text style={styles.userName}>{name}</Text>
              <Text style={styles.userEmail}>{email}</Text>
              <Text style={styles.memberSince}>Pacelab member since {user?.created_at ? new Date(user.created_at).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : ''}</Text>
            </View>
          </View>
        </View>
        <View style={styles.statsBentoGrid}>
          <View style={[styles.bentoBox, styles.bentoBoxFeatured]}>
            <Text style={styles.bentoValue}>{runStats.totalRuns}</Text>
            <Text style={styles.bentoLabel}>Total Runs</Text>
          </View>
          <View style={styles.bentoColumnItem}>
            <View style={[styles.bentoBox, styles.bentoBoxSmall]}>
              <Text style={styles.bentoValueSmall}>{runStats.totalDistanceKm.toLocaleString(undefined, { maximumFractionDigits: 1 })} <Text style={styles.bentoUnit}>km</Text></Text>
              <Text style={styles.bentoLabel}>Distance</Text>
            </View>
            <View style={[styles.bentoBox, styles.bentoBoxSmall]}>
              <Text style={styles.bentoValueSmall}>{formatTotalTime(runStats.totalDurationSeconds)}</Text>
              <Text style={styles.bentoLabel}>Time</Text>
            </View>
          </View>
        </View>
        {runStats.totalRuns === 0 && stravaConnected ? (
          <View style={styles.statsHintBlock}>
            <Text style={styles.statsHint}>Pull down to refresh stats after sync.</Text>
            <TouchableOpacity
              style={styles.diagnosticButton}
              onPress={async () => {
                const next = await (async () => {
                  try {
                    const { data, error } = await supabase.rpc('get_my_run_diagnostic');
                    if (error) return `RPC error: ${error.message}`;
                    const raw = Array.isArray(data) ? data?.[0] : data;
                    const uid = raw?.auth_uid ?? 'null';
                    const count = raw?.run_count ?? '?';
                    let msg = `User ID: ${uid}\nRuns in database: ${count}`;
                    if (uid === 'null') msg += '\n\nThe app is not sending a valid session. Check .env: EXPO_PUBLIC_SUPABASE_ANON_KEY should be the anon key from Supabase Dashboard.';
                    else if (count === 0) msg += '\n\nNo runs for this user. Tap Sync now on the Strava row or wait for import.';
                    return msg;
                  } catch (e) { return `Error: ${e?.message || e}`; }
                })();
                Alert.alert('Diagnostics', next);
              }}
            >
              <Text style={styles.diagnosticButtonText}>Troubleshoot: why 0 runs?</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* RUNNER STATS */}
        {!isBeginner && (
          <>
            <Text style={styles.sectionTitle}>YOUR STATS</Text>
            <View style={styles.metricsBentoGrid}>
              <View style={styles.bentoGridRow}>
                <View style={[styles.bentoBox, styles.bentoBoxLarge, { flex: 1.2 }]}>
                  <Text style={styles.bentoValue}>{runStats.totalRuns}</Text>
                  <Text style={styles.bentoLabel}>Total Runs</Text>
                </View>
                <View style={[styles.bentoBox, styles.bentoBoxLarge, { flex: 1.8 }]}>
                  <Text style={styles.bentoValue}>{runStats.totalDistanceKm.toFixed(0)} <Text style={styles.bentoUnit}>km</Text></Text>
                  <Text style={styles.bentoLabel}>Distance</Text>
                </View>
              </View>
              <View style={styles.bentoGridRow}>
                <View style={[styles.bentoBox, styles.bentoBoxMedium]}>
                  <Text style={styles.bentoValueMedium}>{formatTotalTime(runStats.totalDurationSeconds)}</Text>
                  <Text style={styles.bentoLabel}>Time</Text>
                </View>
                <View style={[styles.bentoBox, styles.bentoBoxMedium]}>
                  <Text style={styles.bentoValueMedium}>{'\u2014'}</Text>
                  <Text style={styles.bentoLabel}>Weekly Avg</Text>
                </View>
              </View>
              <Pressable
                onPress={() => navigation.navigate('AnalyticsTab')}
                style={({ pressed }) => [
                  styles.linkRowBento,
                  { opacity: pressed ? 0.7 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }
                ]}
              >
                <Text style={styles.linkText}>View full analytics</Text>
                <Text style={styles.chevron}>{'\u203a'}</Text>
              </Pressable>
            </View>
          </>
        )}
        {isBeginner && (
          <>
            <Text style={styles.sectionTitle}>YOUR JOURNEY</Text>
            <View style={styles.card}>
              <View style={[styles.levelBadge, { backgroundColor: colors.beginnerGreenMedium }]}><Text style={[styles.levelBadgeText, { color: colors.beginnerGreen }]}>BEGINNER RUNNER</Text></View>
              <Text style={styles.beginnerProfileText}>You're building your running habit. Keep showing up!</Text>
              <Pressable
                onPress={() => navigation.navigate('AnalyticsTab')}
                style={({ pressed }) => [
                  styles.linkRowBento,
                  { opacity: pressed ? 0.7 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }
                ]}
              >
                <Text style={styles.linkText}>View progress</Text>
                <Text style={styles.chevron}>{'\u203a'}</Text>
              </Pressable>
            </View>
          </>
        )}

        {/* CONNECTIONS */}
        <Text style={styles.sectionTitle}>CONNECTIONS</Text>
        <View style={styles.card}>
          <ConnectionRow icon="S" iconColor={colors.stravaOrange} title="Strava" connected={stravaConnected} subtitle={stravaSubtitle} connectLabel="Connect Strava" last={false} onConnect={handleConnectStrava} onDisconnect={handleDisconnectStrava} onSync={stravaConnected ? handleSyncNowStrava : undefined} loading={stravaLoading} syncLoading={stravaSyncLoading} error={stravaError} />
          <ConnectionRow icon="G" iconColor="#000" title="Garmin Connect" connected={GARMIN_CONNECTED} subtitle={GARMIN_CONNECTED ? 'Syncing Body Battery / HRV / Sleep' : 'Sync readiness and wellness data'} connectLabel="Connect Garmin" last={false} />
          <ConnectionRow icon="AH" iconColor="#000" title="Apple Health" connected={appleConnected} subtitle={appleSubtitle} connectLabel={isExpoGo ? 'Import data' : 'Connect Apple Health'} last onConnect={handleConnectAppleHealth} onDisconnect={handleDisconnectAppleHealth} onSync={appleConnected && isExpoGo ? handleImportAppleHealthExport : undefined} loading={appleLoading} syncLoading={false} preview={applePreview} error={appleError} />
        </View>

        {/* IMPORT DATA */}
        <Text style={styles.sectionTitle}>IMPORT DATA</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.importRow} onPress={handleImportAppleHealthExport}>
            <View style={styles.importTextBlock}>
              <Text style={styles.importTitle}>Import Apple Health data</Text>
              <Text style={styles.importSubtitle}>Select zip or xml file to upload and process</Text>
            </View>
            <Text style={styles.chevron}>{'\u203a'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.importRow} onPress={() => navigation.getParent()?.getParent()?.navigate('OnboardingGPXImport')}>
            <View style={styles.importTextBlock}>
              <Text style={styles.importTitle}>Import GPX Files</Text>
              <Text style={styles.importSubtitle}>Import runs from Garmin or any device</Text>
            </View>
            <Text style={styles.chevron}>{'\u203a'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.importRow, { borderBottomWidth: 0 }]} onPress={() => setManualLogVisible(true)}>
            <View style={styles.importTextBlock}>
              <Text style={styles.importTitle}>Log a Run Manually</Text>
              <Text style={styles.importSubtitle}>Add a run without GPS data</Text>
            </View>
            <Text style={styles.chevron}>{'\u203a'}</Text>
          </TouchableOpacity>
        </View>

        {/* SHOES */}
        <Text style={styles.sectionTitle}>SHOES</Text>
        <View style={styles.card}>
          <Text style={styles.emptyShoeText}>Track shoe mileage to know when to replace them</Text>
          <TouchableOpacity style={styles.addShoeRow} onPress={() => setAddShoeVisible(true)}>
            <Text style={styles.addShoeText}>+ Add shoe</Text>
          </TouchableOpacity>
        </View>

        {/* PREFERENCES */}
        <Text style={styles.sectionTitle}>PREFERENCES</Text>
        <View style={styles.card}>
          <Row label="Keep me logged in" right={<Switch value={keepLoggedIn} onValueChange={setKeepLoggedIn} trackColor={{ false: colors.divider, true: colors.accent }} />} />
          <Row label="Distance units" right={<Text style={styles.rowValue}>{unitsKm ? 'Kilometers' : 'Miles'}</Text>} onPress={() => setUnitsKm(!unitsKm)} />
          <Row label="Pace format" right={<Text style={styles.rowValue}>{pacePerKm ? 'min/km' : 'min/mi'}</Text>} onPress={() => setPacePerKm(!pacePerKm)} />
          <Row label="Week starts on" right={<Text style={styles.rowValue}>{weekStartsMonday ? 'Monday' : 'Sunday'}</Text>} onPress={() => setWeekStartsMonday(!weekStartsMonday)} />
          <Row label="Heart rate zones" right={<Text style={styles.chevron}>{'\u203a'}</Text>} onPress={() => Alert.alert('Heart Rate Zones', 'HR zone customization coming in a future update. Zones are currently auto-calculated from your run data.')} />
        </View>

        {/* TRAINING */}
        <Text style={styles.sectionTitle}>TRAINING</Text>
        <View style={styles.card}>
          <View style={styles.experienceModeRow}>
            <View style={styles.experienceModeText}>
              <Text style={styles.prefRowText}>Experience Mode</Text>
              <Text style={styles.experienceModeHint}>
                {isBeginner ? 'Simplified interface for new runners' : 'Full analytics and advanced coaching'}
              </Text>
            </View>
            <View style={styles.experienceModePills}>
              <TouchableOpacity
                style={[styles.modePill, isBeginner && styles.modePillActive]}
                onPress={() => {
                  if (!isBeginner) {
                    Alert.alert(
                      'Switch to Beginner?',
                      'Switching to Beginner mode simplifies the interface. All your data is kept \u2014 you can switch back anytime.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Switch', onPress: () => setRunnerMode('beginner') },
                      ]
                    );
                  }
                }}
              >
                <Text style={[styles.modePillText, isBeginner && styles.modePillTextActive]}>Beginner</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modePill, !isBeginner && styles.modePillActive]}
                onPress={() => {
                  if (isBeginner) {
                    Alert.alert(
                      'Switch to Advanced?',
                      'Advanced mode shows detailed performance metrics and uses complex training plans. Recommended after 3+ months of running.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Switch', onPress: () => setRunnerMode('advanced') },
                      ]
                    );
                  }
                }}
              >
                <Text style={[styles.modePillText, !isBeginner && styles.modePillTextActive]}>Advanced</Text>
              </TouchableOpacity>
            </View>
          </View>
          <TouchableOpacity style={styles.prefRow} onPress={() => navigation.getParent()?.navigate('PlanTab')}><Text style={styles.prefRowText}>Training plan settings</Text><Text style={styles.chevron}>{'\u203a'}</Text></TouchableOpacity>
          <TouchableOpacity style={styles.prefRow} onPress={() => Alert.alert('Notifications', 'Notification preferences coming in a future update.')}><Text style={styles.prefRowText}>Notifications</Text><Text style={styles.chevron}>{'\u203a'}</Text></TouchableOpacity>
        </View>

        {/* ACCOUNT */}
        <Text style={styles.sectionTitle}>ACCOUNT</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.prefRow} onPress={() => { setEditName(name); setEditProfileVisible(true); }}><Text style={styles.prefRowText}>Edit Profile</Text><Text style={styles.chevron}>{'\u203a'}</Text></TouchableOpacity>
          <TouchableOpacity style={styles.prefRow} onPress={() => { setPasswordError(''); setNewPassword(''); setConfirmPassword(''); setChangePasswordVisible(true); }}><Text style={styles.prefRowText}>Change Password</Text><Text style={styles.chevron}>{'\u203a'}</Text></TouchableOpacity>
          <TouchableOpacity style={styles.prefRow} onPress={() => Linking.openURL('https://pacelab.app/privacy')}><Text style={styles.prefRowText}>Privacy Policy</Text><Text style={styles.chevron}>{'\u203a'}</Text></TouchableOpacity>
          <TouchableOpacity style={styles.prefRow} onPress={() => Linking.openURL('https://pacelab.app/terms')}><Text style={styles.prefRowText}>Terms of Service</Text><Text style={styles.chevron}>{'\u203a'}</Text></TouchableOpacity>
          <TouchableOpacity style={styles.prefRow} onPress={() => Linking.openURL('mailto:support@pacelab.app')}><Text style={styles.prefRowText}>Help & Support</Text><Text style={styles.chevron}>{'\u203a'}</Text></TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>

        <Text style={styles.versionText}>Pacelab v1.0.0</Text>
      </ScrollView>

      {/* Change Password Modal */}
      <Modal visible={changePasswordVisible} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setChangePasswordVisible(false)}>
          <Pressable style={styles.modalBox} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Change Password</Text>
            <Input
              label="New password"
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="Min 6 characters"
              secureTextEntry
            />
            <Input
              label="Confirm password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Repeat new password"
              secureTextEntry
            />
            {passwordError ? <Text style={styles.modalError}>{passwordError}</Text> : null}
            <PrimaryButton title="Update Password" onPress={handleChangePassword} loading={passwordLoading} style={styles.modalBtn} />
            <TouchableOpacity onPress={() => setChangePasswordVisible(false)} style={styles.modalCancel}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Edit Profile Modal */}
      <Modal visible={editProfileVisible} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setEditProfileVisible(false)}>
          <Pressable style={styles.modalBox} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Edit Profile</Text>
            <Input
              label="Display name"
              value={editName}
              onChangeText={setEditName}
              placeholder="Your name"
              autoCapitalize="words"
            />
            <PrimaryButton title="Save" onPress={handleEditProfile} loading={editLoading} style={styles.modalBtn} />
            <TouchableOpacity onPress={() => setEditProfileVisible(false)} style={styles.modalCancel}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Manual log modal */}
      <Modal visible={manualLogVisible} transparent animationType="slide">
        <Pressable style={styles.modalOverlayBottom} onPress={() => setManualLogVisible(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Log a run manually</Text>
            <TextInput style={styles.textInput} placeholder="Date" placeholderTextColor={colors.tertiaryText} />
            <TextInput style={styles.textInput} placeholder="Distance (km)" placeholderTextColor={colors.tertiaryText} keyboardType="decimal-pad" />
            <TextInput style={styles.textInput} placeholder="Duration (e.g. 45:30)" placeholderTextColor={colors.tertiaryText} />
            <TextInput style={styles.textInput} placeholder="Avg HR" placeholderTextColor={colors.tertiaryText} keyboardType="number-pad" />
            <TextInput style={styles.textInput} placeholder="Notes" placeholderTextColor={colors.tertiaryText} multiline />
            <PrimaryButton title="Save run" onPress={() => { setManualLogVisible(false); Alert.alert('Run logged', 'Manual run logging will be fully implemented in a future update.'); }} style={styles.modalBtn} />
            <SecondaryButton title="Cancel" onPress={() => setManualLogVisible(false)} />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Add shoe modal */}
      <Modal visible={addShoeVisible} transparent animationType="slide">
        <Pressable style={styles.modalOverlayBottom} onPress={() => setAddShoeVisible(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Add shoe</Text>
            <TextInput style={styles.textInput} placeholder="Brand" placeholderTextColor={colors.tertiaryText} />
            <TextInput style={styles.textInput} placeholder="Model" placeholderTextColor={colors.tertiaryText} />
            <TextInput style={styles.textInput} placeholder="Nickname" placeholderTextColor={colors.tertiaryText} />
            <TextInput style={styles.textInput} placeholder="Starting distance (km)" placeholderTextColor={colors.tertiaryText} keyboardType="decimal-pad" />
            <TextInput style={styles.textInput} placeholder="Retirement distance (default 700 km)" placeholderTextColor={colors.tertiaryText} keyboardType="number-pad" />
            <PrimaryButton title="Add shoe" onPress={() => { setAddShoeVisible(false); Alert.alert('Shoe added', 'Shoe tracking will be available in a future update.'); }} style={styles.modalBtn} />
            <SecondaryButton title="Cancel" onPress={() => setAddShoeVisible(false)} />
          </Pressable>
        </Pressable>
      </Modal>

      {
        appleImportLoading && (
          <View style={styles.importOverlay}>
            <View style={styles.importOverlayCard}>
              <ActivityIndicator size="large" color={colors.accent} />
              <Text style={styles.importOverlayText}>{appleImportStatus || 'Processing...'}</Text>
            </View>
          </View>
        )
      }
    </SafeAreaView >
  );
}

function ConnectionRow({ icon, iconColor, title, connected, subtitle, connectLabel, last, onConnect, onDisconnect, onSync, loading, syncLoading, preview, error }) {
  return (
    <View style={[styles.connectionRow, last && styles.connectionRowLast]}>
      <View style={[styles.connectionIcon]}><Text style={[styles.connectionIconText, { color: iconColor || colors.accent }]}>{icon}</Text></View>
      <View style={styles.connectionText}>
        <Text style={styles.connectionTitle}>{title}</Text>
        <View style={styles.connectionStatus}>
          <View style={[styles.statusDot, { backgroundColor: connected ? colors.success : colors.tertiaryText }]} />
          <Text style={styles.connectionSubtitle}>{connected ? 'Connected' : 'Not connected'}</Text>
        </View>
        {connected && <Text style={styles.syncTime}>{subtitle}</Text>}
        {connected && preview && <Text style={styles.syncTime}>{preview}</Text>}
        {!connected && <Text style={styles.connectionHint}>{subtitle}</Text>}
        {error && <Text style={styles.connectionError}>{error}</Text>}
      </View>
      {connected ? (
        <View style={styles.connectionActions}>
          {onSync && (
            <TouchableOpacity onPress={onSync} disabled={syncLoading} style={styles.syncNowBtn}>
              <Text style={styles.syncNowText}>{syncLoading ? 'Syncing...' : 'Sync now'}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={onDisconnect} disabled={loading}>
            <Text style={styles.disconnectText}>Disconnect</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity onPress={onConnect ? () => onConnect() : undefined} disabled={loading}>
          <Text style={styles.connectBtnText}>{loading ? 'Connecting...' : connectLabel}</Text>
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
  headerTitle: { ...typography.largeTitle, color: colors.primaryText, letterSpacing: -0.5 },
  scroll: { paddingHorizontal: PADDING, paddingBottom: 100 },
  sectionTitle: { ...typography.overline, color: colors.tertiaryText, marginBottom: 10, marginTop: 8 },
  card: { backgroundColor: colors.card, borderRadius: theme.radius.card, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: colors.glassBorder, ...theme.cardShadow },
  userCard: {},
  userTop: { flexDirection: 'row', marginBottom: 20 },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.backgroundSecondary, alignItems: 'center', justifyContent: 'center', marginRight: 16, borderWidth: 1.5, borderColor: colors.glassBorder },
  avatarText: { ...typography.title, fontSize: 22, color: colors.primaryText, letterSpacing: -0.5 },
  userInfo: { flex: 1 },
  userName: { ...typography.title, color: colors.primaryText, letterSpacing: -0.3 },
  userEmail: { ...typography.caption, color: colors.tertiaryText, marginTop: 4 },
  memberSince: { ...typography.caption, color: colors.tertiaryText, marginTop: 2 },
  statsRow: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider, paddingTop: 16 },
  statBlock: { flex: 1, alignItems: 'center' },
  statsHint: { ...typography.caption, color: colors.secondaryText, textAlign: 'center', marginTop: 8 },
  statsHintBlock: { marginTop: 8 },
  diagnosticButton: { marginTop: 12, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: colors.backgroundSecondary, borderRadius: 10, alignSelf: 'center', borderWidth: 1, borderColor: colors.glassBorder },
  diagnosticButtonText: { ...typography.secondary, color: colors.link, fontWeight: '600' },
  statValue: { ...typography.title, color: colors.primaryText, letterSpacing: -0.3 },
  statLabel: { ...typography.caption, color: colors.tertiaryText, marginTop: 4 },
  levelBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginBottom: 16 },
  levelBadgeText: { ...typography.overline },

  // Bento Grid styles replacing metricsGrid
  statsBentoGrid: { flexDirection: 'row', gap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider, paddingTop: 16 },
  metricsBentoGrid: { marginBottom: 16 },
  bentoGridRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  bentoBox: { backgroundColor: colors.backgroundSecondary, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.glassBorder, justifyContent: 'center' },
  bentoBoxFeatured: { flex: 1, paddingVertical: 24, alignItems: 'center' },
  bentoColumnItem: { flex: 1, gap: 12 },
  bentoBoxLarge: { paddingVertical: 20 },
  bentoBoxMedium: { flex: 1, paddingVertical: 16 },
  bentoBoxSmall: { flex: 1, paddingVertical: 12 },
  bentoValue: { ...typography.largeTitle, color: colors.primaryText, marginBottom: 4 },
  bentoValueMedium: { ...typography.title, color: colors.primaryText, marginBottom: 4 },
  bentoValueSmall: { ...typography.headline, color: colors.primaryText, marginBottom: 2 },
  bentoUnit: { ...typography.body, color: colors.tertiaryText },
  bentoLabel: { ...typography.caption, color: colors.tertiaryText },

  linkRowBento: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 4 },
  linkText: { ...typography.secondary, color: colors.link },
  chevron: { ...typography.body, color: colors.tertiaryText, marginLeft: 4 },
  connectionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.glassBorder },
  connectionRowLast: { borderBottomWidth: 0 },
  connectionIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 14, borderWidth: 1, borderColor: colors.glassBorder, backgroundColor: colors.backgroundSecondary },
  connectionIconText: { fontSize: 14, fontWeight: '700' },
  connectionText: { flex: 1 },
  connectionTitle: { ...typography.body, fontWeight: '600', color: colors.primaryText },
  connectionStatus: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  statusDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  connectionSubtitle: { ...typography.caption, color: colors.secondaryText },
  syncTime: { ...typography.caption, color: colors.tertiaryText, marginTop: 2 },
  connectionHint: { ...typography.caption, color: colors.tertiaryText, marginTop: 2 },
  connectionActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  syncNowBtn: {},
  syncNowText: { ...typography.secondary, color: colors.link },
  disconnectText: { ...typography.caption, color: colors.destructive },
  connectBtnText: { ...typography.secondary, color: colors.link, fontWeight: '600' },
  connectionError: { ...typography.caption, color: colors.destructive, marginTop: 4 },
  importRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  importTextBlock: { flex: 1 },
  importTitle: { ...typography.body, color: colors.primaryText, fontWeight: '500' },
  importSubtitle: { ...typography.caption, color: colors.tertiaryText, marginTop: 2 },
  shoeCard: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  shoeName: { ...typography.body, fontWeight: '600', color: colors.primaryText },
  shoeMeta: { ...typography.caption, color: colors.tertiaryText, marginTop: 2 },
  shoeDist: { ...typography.caption, color: colors.primaryText, marginTop: 4 },
  shoeProgressTrack: { height: 4, backgroundColor: colors.backgroundSecondary, borderRadius: 2, marginTop: 6, overflow: 'hidden' },
  shoeProgressFill: { height: '100%', borderRadius: 2 },
  shoeStatus: { ...typography.caption, marginTop: 6, color: colors.tertiaryText },
  emptyShoeText: { ...typography.body, color: colors.secondaryText, marginBottom: 8 },
  addShoeRow: { paddingVertical: 14 },
  addShoeText: { ...typography.body, color: colors.link },
  prRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  prLabel: { width: 100, ...typography.body, color: colors.primaryText },
  prTime: { flex: 1, ...typography.headline, color: colors.primaryText },
  prDate: { ...typography.caption, color: colors.tertiaryText },
  prefRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  prefRowText: { ...typography.body, color: colors.primaryText },
  rowValue: { ...typography.secondary, color: colors.secondaryText },
  signOutBtn: { alignSelf: 'center', paddingVertical: 20 },
  signOutText: { ...typography.body, color: colors.destructive },
  versionText: { ...typography.caption, color: colors.tertiaryText, textAlign: 'center', marginBottom: 20 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalOverlayBottom: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'flex-end' },
  modalBox: { width: '100%', maxWidth: 360, backgroundColor: colors.cardElevated, borderRadius: theme.radius.modal, padding: 24, borderWidth: 1, borderColor: colors.glassBorder, ...theme.cardShadowElevated },
  modalSheet: { backgroundColor: colors.cardElevated, borderTopLeftRadius: theme.radius.modal, borderTopRightRadius: theme.radius.modal, padding: 24, maxHeight: '90%', borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.glassBorder },
  modalHandle: { width: 40, height: 4, backgroundColor: colors.divider, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  modalTitle: { ...typography.title, color: colors.primaryText, marginBottom: 20 },
  modalError: { ...typography.caption, color: colors.destructive, marginBottom: 12 },
  modalBtn: { marginBottom: 12 },
  modalCancel: { alignSelf: 'center', paddingVertical: 8 },
  modalCancelText: { ...typography.secondary, color: colors.tertiaryText },
  textInput: { backgroundColor: colors.backgroundSecondary, borderRadius: theme.radius.input, paddingHorizontal: 14, paddingVertical: 14, ...typography.body, color: colors.primaryText, marginBottom: 12, borderWidth: 1, borderColor: colors.glassBorder },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  toggleLabel: { ...typography.body, color: colors.primaryText },
  importOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', zIndex: 999 },
  importOverlayCard: { backgroundColor: colors.cardElevated, borderRadius: theme.radius.card, padding: 32, alignItems: 'center', minWidth: 200, borderWidth: 1, borderColor: colors.glassBorder, ...theme.cardShadowElevated },
  importOverlayText: { ...typography.body, color: colors.primaryText, marginTop: 16, textAlign: 'center' },
  experienceModeRow: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  experienceModeText: { marginBottom: 12 },
  experienceModeHint: { ...typography.caption, color: colors.tertiaryText, marginTop: 4 },
  experienceModePills: { flexDirection: 'row', gap: 8 },
  modePill: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, backgroundColor: colors.backgroundSecondary, borderWidth: 1, borderColor: colors.glassBorder },
  modePillActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  modePillText: { ...typography.secondary, fontWeight: '600', color: colors.secondaryText },
  modePillTextActive: { color: colors.background },
  beginnerProfileText: { ...typography.body, color: colors.secondaryText, marginBottom: 12 },
});
