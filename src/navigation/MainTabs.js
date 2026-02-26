import React, { Suspense } from 'react';
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet, View, Pressable, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TodayScreen } from '../screens/TodayScreen';
import { BeginnerTodayScreen } from '../screens/BeginnerTodayScreen';
import { RunsScreen } from '../screens/RunsScreen';
import { RunDetailScreen } from '../screens/RunDetailScreen';
import { AnalyticsScreen } from '../screens/AnalyticsScreen';
import { BeginnerAnalyticsScreen } from '../screens/BeginnerAnalyticsScreen';
import { PlanScreen } from '../screens/PlanScreen';
import { SessionDetailScreen } from '../screens/SessionDetailScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { useRunnerMode } from '../contexts/RunnerModeContext';
import { colors, typography, theme } from '../theme';

const PlanBuilderWelcomeScreen = React.lazy(() => import('../screens/plan/PlanBuilderWelcomeScreen').then(m => ({ default: m.PlanBuilderWelcomeScreen })));
const PlanBuilderChatScreen = React.lazy(() => import('../screens/plan/PlanBuilderChatScreen').then(m => ({ default: m.PlanBuilderChatScreen })));
const PlanBuilderGenerationScreen = React.lazy(() => import('../screens/plan/PlanBuilderGenerationScreen').then(m => ({ default: m.PlanBuilderGenerationScreen })));

const Tab = createBottomTabNavigator();
const RunsStack = createNativeStackNavigator();
const PlanStack = createNativeStackNavigator();

const TAB_BAR_ACTIVE = '#0A84FF';
const TAB_BAR_INACTIVE = '#8E8E93';
const TAB_BAR_BORDER = '#E5E5EA';
const TAB_BAR_HEIGHT = 49;

const stackScreenOptions = {
  headerStyle: { backgroundColor: colors.surfaceBase },
  headerTitleStyle: { ...typography.title, color: colors.primaryText },
  headerShadowVisible: false,
  headerBackTitleVisible: false,
  contentStyle: { backgroundColor: colors.surfaceBase },
};

function RunsStackScreen() {
  return (
    <RunsStack.Navigator screenOptions={stackScreenOptions}>
      <RunsStack.Screen name="RunsList" component={RunsScreen} options={{ headerShown: false }} />
      <RunsStack.Screen
        name="RunDetail"
        component={RunDetailScreen}
        options={() => ({
          title: 'Run',
          headerRight: () => (
            <TouchableOpacity onPress={() => { const { Share } = require('react-native'); Share.share({ message: 'Check out my run on Pacelab!' }).catch(() => {}); }} style={{ padding: 8 }}>
              <Text style={{ color: colors.linkNeon, ...typography.body }}>Share</Text>
            </TouchableOpacity>
          ),
        })}
      />
    </RunsStack.Navigator>
  );
}

function PlanStackScreen() {
  return (
    <Suspense fallback={<ActivityIndicator style={{ flex: 1 }} />}>
      <PlanStack.Navigator screenOptions={stackScreenOptions}>
        <PlanStack.Screen name="PlanList" component={PlanScreen} options={{ headerShown: false }} />
        <PlanStack.Screen name="SessionDetail" component={SessionDetailScreen} options={{ title: 'Session' }} />
        <PlanStack.Screen name="PlanBuilderWelcome" component={PlanBuilderWelcomeScreen} options={{ headerShown: false }} />
        <PlanStack.Screen name="PlanBuilderChat" component={PlanBuilderChatScreen} options={{ headerShown: false }} />
        <PlanStack.Screen name="PlanBuilderGeneration" component={PlanBuilderGenerationScreen} options={{ headerShown: false, gestureEnabled: false }} />
      </PlanStack.Navigator>
    </Suspense>
  );
}

function TodayTabScreen(props) {
  const { isBeginner } = useRunnerMode();
  return isBeginner ? <BeginnerTodayScreen {...props} /> : <TodayScreen {...props} />;
}

function AnalyticsTabScreen(props) {
  const { isBeginner } = useRunnerMode();
  return isBeginner ? <BeginnerAnalyticsScreen {...props} /> : <AnalyticsScreen {...props} />;
}

const tabIcons = {
  TodayTab: { inactive: 'home-outline', active: 'home' },
  RunsTab: { inactive: 'fitness-outline', active: 'fitness' },
  AnalyticsTab: { inactive: 'stats-chart-outline', active: 'stats-chart' },
  PlanTab: { inactive: 'calendar-outline', active: 'calendar' },
  ProfileTab: { inactive: 'person-outline', active: 'person' },
};

function FloatingGlassTabBar({ state, navigation, descriptors }) {
  const insets = useSafeAreaInsets();
  const color = (focused) => (focused ? TAB_BAR_ACTIVE : TAB_BAR_INACTIVE);

  return (
    <View style={[floatingStyles.wrapper, { paddingBottom: insets.bottom }]} pointerEvents="box-none">
      <View style={floatingStyles.pill}>
        {Platform.OS === 'ios' ? (
          <BlurView intensity={72} tint="light" style={StyleSheet.absoluteFill} />
        ) : null}
        <View style={[floatingStyles.pillFill, Platform.OS === 'android' && floatingStyles.pillFillAndroid]} />
        <View style={floatingStyles.tabsRow}>
          {state.routes.map((route, index) => {
            const isFocused = state.index === index;
            const desc = descriptors[route.key];
            const options = desc.options;
            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            };
            const labelOpt = options.tabBarLabel;
            const labelEl =
              typeof labelOpt === 'function'
                ? labelOpt({ focused: isFocused, color: color(isFocused) })
                : labelOpt;
            const iconEl = options.tabBarIcon?.({ focused: isFocused, color: color(isFocused), size: 24 });

            return (
              <Pressable
                key={route.key}
                onPress={onPress}
                style={floatingStyles.tab}
                accessibilityRole="button"
                accessibilityState={isFocused ? { selected: true } : {}}
              >
                <View style={floatingStyles.iconWrap}>{iconEl}</View>
                {labelEl}
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const floatingStyles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  pill: {
    borderRadius: theme.radius.sheet,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: 'rgba(0,0,0,0.06)',
    minHeight: TAB_BAR_HEIGHT,
    ...theme.glassShadowSoft,
  },
  pillFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.4)',
    borderRadius: theme.radius.sheet,
  },
  pillFillAndroid: {
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrap: {
    marginTop: 4,
    marginBottom: 2,
  },
});

export function MainTabs() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = TAB_BAR_HEIGHT + insets.bottom + 8 + 8;

  return (
    <Tab.Navigator
      tabBar={(props) => <FloatingGlassTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: tabBarHeight,
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarActiveTintColor: TAB_BAR_ACTIVE,
        tabBarInactiveTintColor: TAB_BAR_INACTIVE,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '500',
          marginTop: 2,
          marginBottom: 2,
        },
        tabBarIconStyle: {
          marginTop: 4,
        },
        tabBarAllowFontScaling: false,
      }}
    >
      <Tab.Screen
        name="TodayTab"
        component={TodayTabScreen}
        options={{
          tabBarLabel: ({ focused, color }) => (
            <Text style={[styles.tabLabel, { color }, focused && styles.tabLabelActive]}>Today</Text>
          ),
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons name={tabIcons.TodayTab[focused ? 'active' : 'inactive']} size={size ?? 24} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="RunsTab"
        component={RunsStackScreen}
        options={{
          tabBarLabel: ({ focused, color }) => (
            <Text style={[styles.tabLabel, { color }, focused && styles.tabLabelActive]}>Runs</Text>
          ),
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons name={tabIcons.RunsTab[focused ? 'active' : 'inactive']} size={size ?? 24} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="AnalyticsTab"
        component={AnalyticsTabScreen}
        options={{
          tabBarLabel: ({ focused, color }) => (
            <Text style={[styles.tabLabel, { color }, focused && styles.tabLabelActive]}>Analytics</Text>
          ),
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons name={tabIcons.AnalyticsTab[focused ? 'active' : 'inactive']} size={size ?? 24} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="PlanTab"
        component={PlanStackScreen}
        options={{
          tabBarLabel: ({ focused, color }) => (
            <Text style={[styles.tabLabel, { color }, focused && styles.tabLabelActive]}>Plan</Text>
          ),
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons name={tabIcons.PlanTab[focused ? 'active' : 'inactive']} size={size ?? 24} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileScreen}
        options={{
          tabBarLabel: ({ focused, color }) => (
            <Text style={[styles.tabLabel, { color }, focused && styles.tabLabelActive]}>Profile</Text>
          ),
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons name={tabIcons.ProfileTab[focused ? 'active' : 'inactive']} size={size ?? 24} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabLabel: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 2,
    marginBottom: 2,
  },
  tabLabelActive: {
    fontWeight: '700',
  },
});
