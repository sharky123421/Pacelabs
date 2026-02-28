import React, { Suspense } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ErrorBoundary } from '../components';
import { useAuth } from '../contexts/AuthContext';
import { colors, typography } from '../theme';

// Eager: initial screens + auth screens (so Log In / Sign Up always load)
import { WelcomeScreen } from '../screens/WelcomeScreen';
import { MainTabs } from './MainTabs';
import { SignUpScreen } from '../screens/SignUpScreen';
import { LogInScreen } from '../screens/LogInScreen';

// Lazy load helper: never pass undefined to React.lazy (avoids "promise resolves to undefined" crash)
function lazyScreen(importFn, exportName) {
  return React.lazy(() =>
    importFn().then((m) => ({
      default: m[exportName] ?? function MissingScreen() {
        return (
          <View style={loadingStyles.container}>
            <Text style={loadingStyles.text}>Screen failed to load</Text>
          </View>
        );
      },
    }))
  );
}

// Lazy: onboarding screens (only needed during first setup)
const OnboardingPathScreen = lazyScreen(() => import('../screens/onboarding/OnboardingPathScreen'), 'OnboardingPathScreen');
const OnboardingStravaOAuthScreen = lazyScreen(() => import('../screens/onboarding/OnboardingStravaOAuthScreen'), 'OnboardingStravaOAuthScreen');
const OnboardingImportProgressScreen = lazyScreen(() => import('../screens/onboarding/OnboardingImportProgressScreen'), 'OnboardingImportProgressScreen');
const OnboardingQuestionnaireScreen = lazyScreen(() => import('../screens/onboarding/OnboardingQuestionnaireScreen'), 'OnboardingQuestionnaireScreen');
const OnboardingGPXImportScreen = lazyScreen(() => import('../screens/onboarding/OnboardingGPXImportScreen'), 'OnboardingGPXImportScreen');
const OnboardingAIAnalysisScreen = lazyScreen(() => import('../screens/onboarding/OnboardingAIAnalysisScreen'), 'OnboardingAIAnalysisScreen');
const OnboardingProfileRevealScreen = lazyScreen(() => import('../screens/onboarding/OnboardingProfileRevealScreen'), 'OnboardingProfileRevealScreen');
const OnboardingGoalSettingScreen = lazyScreen(() => import('../screens/onboarding/OnboardingGoalSettingScreen'), 'OnboardingGoalSettingScreen');
const OnboardingPlanGenerationScreen = lazyScreen(() => import('../screens/onboarding/OnboardingPlanGenerationScreen'), 'OnboardingPlanGenerationScreen');
const BeginnerPostRunScreen = lazyScreen(() => import('../screens/BeginnerPostRunScreen'), 'BeginnerPostRunScreen');

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
        <Suspense fallback={<LoadingScreen />}>
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
        </Suspense>
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
