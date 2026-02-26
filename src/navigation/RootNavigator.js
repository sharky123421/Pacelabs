import React, { Suspense } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ErrorBoundary } from '../components';
import { useAuth } from '../contexts/AuthContext';
import { colors, typography } from '../theme';

// Eager: only the two possible initial screens
import { WelcomeScreen } from '../screens/WelcomeScreen';
import { MainTabs } from './MainTabs';

// Lazy: auth screens (not needed if already logged in)
const SignUpScreen = React.lazy(() => import('../screens/SignUpScreen').then(m => ({ default: m.SignUpScreen })));
const LogInScreen = React.lazy(() => import('../screens/LogInScreen').then(m => ({ default: m.LogInScreen })));

// Lazy: onboarding screens (only needed during first setup)
const OnboardingPathScreen = React.lazy(() => import('../screens/onboarding/OnboardingPathScreen').then(m => ({ default: m.OnboardingPathScreen })));
const OnboardingStravaOAuthScreen = React.lazy(() => import('../screens/onboarding/OnboardingStravaOAuthScreen').then(m => ({ default: m.OnboardingStravaOAuthScreen })));
const OnboardingImportProgressScreen = React.lazy(() => import('../screens/onboarding/OnboardingImportProgressScreen').then(m => ({ default: m.OnboardingImportProgressScreen })));
const OnboardingQuestionnaireScreen = React.lazy(() => import('../screens/onboarding/OnboardingQuestionnaireScreen').then(m => ({ default: m.OnboardingQuestionnaireScreen })));
const OnboardingGPXImportScreen = React.lazy(() => import('../screens/onboarding/OnboardingGPXImportScreen').then(m => ({ default: m.OnboardingGPXImportScreen })));
const OnboardingAIAnalysisScreen = React.lazy(() => import('../screens/onboarding/OnboardingAIAnalysisScreen').then(m => ({ default: m.OnboardingAIAnalysisScreen })));
const OnboardingProfileRevealScreen = React.lazy(() => import('../screens/onboarding/OnboardingProfileRevealScreen').then(m => ({ default: m.OnboardingProfileRevealScreen })));
const OnboardingGoalSettingScreen = React.lazy(() => import('../screens/onboarding/OnboardingGoalSettingScreen').then(m => ({ default: m.OnboardingGoalSettingScreen })));
const OnboardingPlanGenerationScreen = React.lazy(() => import('../screens/onboarding/OnboardingPlanGenerationScreen').then(m => ({ default: m.OnboardingPlanGenerationScreen })));
const BeginnerPostRunScreen = React.lazy(() => import('../screens/BeginnerPostRunScreen').then(m => ({ default: m.BeginnerPostRunScreen })));

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
