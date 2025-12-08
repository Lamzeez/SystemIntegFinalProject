// @suggested_answers/passenger_app_App.tsx.txt
// This file replaces bao-ride-passenger/App.tsx

// Make sure this is at the very top
import 'react-native-gesture-handler';

import React from 'react';
import { AuthProvider } from './src/AuthContext';
import AppNavigator from './src/AppNavigator';

export default function App() {
  return (
    <AuthProvider>
      <AppNavigator />
    </AuthProvider>
  );
}
