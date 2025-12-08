// @suggested_answers/passenger_AppNavigator_SIMPLIFIED.tsx.txt
// This file replaces bao-ride-passenger/src/AppNavigator.tsx

import React, { useState } from 'react';
import { useAuth } from './AuthContext';
import LoginScreen from './screens/LoginScreen';
import RegisterScreen from './screens/RegisterScreen';
import HomeScreen from './screens/HomeScreen';

// This component is now simpler. It will only render AFTER the
// AuthContext has finished loading and provided a value.
export default function AppNavigator() {
  const { user } = useAuth(); // We no longer need isLoading here
  const [showRegister, setShowRegister] = useState(false);

  // If there is a logged-in user, show the main HomeScreen
  if (user) {
    return <HomeScreen />;
  }

  // If there is no user, show either Login or Register screen
  if (showRegister) {
    return <RegisterScreen onSwitchToLogin={() => setShowRegister(false)} />;
  } else {
    return <LoginScreen onSwitchToRegister={() => setShowRegister(true)} />;
  }
}
