import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { AuthProvider } from './src/contexts/AuthContext';
import { RunnerModeProvider } from './src/contexts/RunnerModeContext';
import { RootNavigator } from './src/navigation';

export default function App() {
  return (
    <AuthProvider>
      <RunnerModeProvider>
        <StatusBar style="dark" />
        <RootNavigator />
      </RunnerModeProvider>
    </AuthProvider>
  );
}
