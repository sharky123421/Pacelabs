import React from 'react';
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
} from '../screens';
import { MainTabs } from './MainTabs';
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

export function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Welcome"
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
      </Stack.Navigator>
    </NavigationContainer>
  );
}
