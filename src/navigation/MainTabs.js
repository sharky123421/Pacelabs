import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  TodayScreen,
  RunsScreen,
  RunDetailScreen,
  AnalyticsScreen,
  PlanScreen,
  SessionDetailScreen,
  PlanBuilderWelcomeScreen,
  PlanBuilderChatScreen,
  PlanBuilderGenerationScreen,
  ProfileScreen,
} from '../screens';
import { BeginnerTodayScreen } from '../screens/BeginnerTodayScreen';
import { BeginnerAnalyticsScreen } from '../screens/BeginnerAnalyticsScreen';
import { useRunnerMode } from '../contexts/RunnerModeContext';
import { colors, typography, theme } from '../theme';

const Tab = createMaterialTopTabNavigator();
const RunsStack = createNativeStackNavigator();
const PlanStack = createNativeStackNavigator();

const stackScreenOptions = {
  headerStyle: { backgroundColor: colors.background },
  headerTitleStyle: { ...typography.title, color: colors.primaryText },
  headerShadowVisible: false,
  headerBackTitleVisible: false,
  contentStyle: { backgroundColor: colors.background },
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
              <Text style={{ color: colors.link, ...typography.body }}>Share</Text>
            </TouchableOpacity>
          ),
        })}
      />
    </RunsStack.Navigator>
  );
}

function PlanStackScreen() {
  return (
    <PlanStack.Navigator screenOptions={stackScreenOptions}>
      <PlanStack.Screen name="PlanList" component={PlanScreen} options={{ headerShown: false }} />
      <PlanStack.Screen name="SessionDetail" component={SessionDetailScreen} options={{ title: 'Session' }} />
      <PlanStack.Screen name="PlanBuilderWelcome" component={PlanBuilderWelcomeScreen} options={{ headerShown: false }} />
      <PlanStack.Screen name="PlanBuilderChat" component={PlanBuilderChatScreen} options={{ headerShown: false }} />
      <PlanStack.Screen name="PlanBuilderGeneration" component={PlanBuilderGenerationScreen} options={{ headerShown: false, gestureEnabled: false }} />
    </PlanStack.Navigator>
  );
}

const TAB_ITEMS_ADVANCED = [
  { name: 'TodayTab', label: 'Today' },
  { name: 'RunsTab', label: 'Runs' },
  { name: 'AnalyticsTab', label: 'Analytics' },
  { name: 'PlanTab', label: 'Plan' },
  { name: 'ProfileTab', label: 'Profile' },
];

const TAB_ITEMS_BEGINNER = [
  { name: 'TodayTab', label: 'Today' },
  { name: 'RunsTab', label: 'Sessions' },
  { name: 'AnalyticsTab', label: 'Progress' },
  { name: 'PlanTab', label: 'Plan' },
  { name: 'ProfileTab', label: 'Profile' },
];

function CustomTabBar({ state, descriptors, navigation }) {
  const insets = useSafeAreaInsets();
  const { isBeginner } = useRunnerMode();
  const tabItems = isBeginner ? TAB_ITEMS_BEGINNER : TAB_ITEMS_ADVANCED;

  return (
    <View style={[tabBarStyles.container, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {state.routes.map((route, index) => {
        const label = tabItems.find((t) => t.name === route.name)?.label || route.name;
        const isFocused = state.index === index;

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

        return (
          <TouchableOpacity
            key={route.key}
            onPress={onPress}
            style={tabBarStyles.tab}
            activeOpacity={0.7}
          >
            <View style={[tabBarStyles.indicator, isFocused && tabBarStyles.indicatorActive]} />
            <Text style={[tabBarStyles.label, isFocused && tabBarStyles.labelActive]}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
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

export function MainTabs() {
  return (
    <Tab.Navigator
      tabBarPosition="bottom"
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        swipeEnabled: true,
        lazy: true,
        animationEnabled: true,
      }}
    >
      <Tab.Screen name="TodayTab" component={TodayTabScreen} />
      <Tab.Screen name="RunsTab" component={RunsStackScreen} />
      <Tab.Screen name="AnalyticsTab" component={AnalyticsTabScreen} />
      <Tab.Screen name="PlanTab" component={PlanStackScreen} />
      <Tab.Screen name="ProfileTab" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

const tabBarStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: colors.tabBar,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.tabBarBorder,
    paddingTop: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
  },
  indicator: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'transparent',
    marginBottom: 4,
  },
  indicatorActive: {
    backgroundColor: colors.accent,
  },
  label: {
    ...typography.caption,
    color: colors.tertiaryText,
    fontWeight: '500',
  },
  labelActive: {
    color: colors.accent,
    fontWeight: '600',
  },
});
