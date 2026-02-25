import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
  WelcomeScreen,
  SignUpScreen,
  LogInScreen,
  OnboardingPathScreen,
  OnboardingStravaOAuthScreen,
  OnboardingImportProgressScreen,
  OnboardingQuestionnaireScreen,
  OnboardingGPXImportScreen,
  OnboardingAIAnalysisScreen,
  OnboardingProfileRevealScreen,
  OnboardingGoalSettingScreen,
  OnboardingPlanGenerationScreen,
  BeginnerPostRunScreen,
} from '../screens';
import { MainTabs } from './MainTabs';
import { ErrorBoundary } from '../components';
import { useAuth } from '../contexts/AuthContext';
import { colors, typography } from '../theme';

const Stack = createNativeStackNavigator();

const screenOptions = {
  headerStyle: { backgroundColor: colors.background },
  headerTitleStyle: { ...typography.title, color: colors.primaryText },
  headerShadowVisible: false,
  headerBackTitleVisible: false,
  contentStyle: { backgroundColor: colors.background },
  animation: 'default',
};

function LoadingScreen() {
  return (
    <View style={loadingStyles.container}>
      <ActivityIndicator size="large" color={colors.accent} />
      <Text style={loadingStyles.text}>Loading...</Text>
    </View>
  );
}

export function RootNavigator() {
  const { session, loading } = useAuth();
  const initialRoute = session ? 'Main' : 'Welcome';

  if (loading) {
    return (
      <ErrorBoundary>
        <LoadingScreen />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName={initialRoute}
          screenOptions={screenOptions}
        >
        <Stack.Screen
          name="Welcome"
          component={WelcomeScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="SignUp"
          component={SignUpScreen}
          options={{ title: 'Create Account', headerLargeTitle: true }}
        />
        <Stack.Screen
          name="LogIn"
          component={LogInScreen}
          options={{ title: 'Log In', headerLargeTitle: true }}
        />
        <Stack.Screen
          name="OnboardingPath"
          component={OnboardingPathScreen}
          options={{ title: 'Get Started', headerShown: false }}
        />
        <Stack.Screen
          name="OnboardingStravaOAuth"
          component={OnboardingStravaOAuthScreen}
          options={{ title: 'Connect Strava', headerLargeTitle: true }}
        />
        <Stack.Screen
          name="OnboardingImportProgress"
          component={OnboardingImportProgressScreen}
          options={{ headerShown: false, gestureEnabled: false }}
        />
        <Stack.Screen
          name="OnboardingQuestionnaire"
          component={OnboardingQuestionnaireScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="OnboardingGPXImport"
          component={OnboardingGPXImportScreen}
          options={{ title: 'Import Garmin runs', headerLargeTitle: true }}
        />
        <Stack.Screen
          name="OnboardingAIAnalysis"
          component={OnboardingAIAnalysisScreen}
          options={{ headerShown: false, gestureEnabled: false }}
        />
        <Stack.Screen
          name="OnboardingProfileReveal"
          component={OnboardingProfileRevealScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="OnboardingGoalSetting"
          component={OnboardingGoalSettingScreen}
          options={{ title: 'Set your goal', headerLargeTitle: true }}
        />
        <Stack.Screen
          name="OnboardingPlanGeneration"
          component={OnboardingPlanGenerationScreen}
          options={{ headerShown: false, gestureEnabled: false }}
        />
        <Stack.Screen
          name="Main"
          component={MainTabs}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="BeginnerPostRun"
          component={BeginnerPostRunScreen}
          options={{ headerShown: false, gestureEnabled: false }}
        />
        </Stack.Navigator>
      </NavigationContainer>
    </ErrorBoundary>
  );
}

const loadingStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  text: {
    ...typography.body,
    color: colors.secondaryText,
  },
});
