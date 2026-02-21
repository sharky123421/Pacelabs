import React from 'react';
import { TouchableOpacity, Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { TodayScreen, RunsScreen, RunDetailScreen, AnalyticsScreen, PlanScreen, SessionDetailScreen, ProfileScreen } from '../screens';
import { colors, typography } from '../theme';

const Tab = createBottomTabNavigator();
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
        options={({ navigation }) => ({
          title: 'Run',
          headerRight: () => (
            <TouchableOpacity onPress={() => {}} style={{ padding: 8 }}>
              <Text style={{ color: colors.accent, ...typography.body }}>Share</Text>
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
    </PlanStack.Navigator>
  );
}

export function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.secondaryText,
        tabBarStyle: { backgroundColor: colors.tabBar },
      }}
    >
      <Tab.Screen name="TodayTab" component={TodayScreen} options={{ title: 'Today', tabBarLabel: 'Today' }} />
      <Tab.Screen name="RunsTab" component={RunsStackScreen} options={{ title: 'Runs', tabBarLabel: 'Runs' }} />
      <Tab.Screen name="AnalyticsTab" component={AnalyticsScreen} options={{ title: 'Analytics', tabBarLabel: 'Analytics' }} />
      <Tab.Screen name="PlanTab" component={PlanStackScreen} options={{ title: 'Plan', tabBarLabel: 'Plan' }} />
      <Tab.Screen name="ProfileTab" component={ProfileScreen} options={{ title: 'Profile', tabBarLabel: 'Profile' }} />
    </Tab.Navigator>
  );
}
