// src/AppNavigator.tsx
import React, { useState } from "react";
import { useAuth } from "./AuthContext";
import LoginScreen from "./screens/LoginScreen";
import HomeScreen from "./screens/HomeScreen";
import RideScreen from "./screens/RideScreen";

export default function AppNavigator() {
  const { user } = useAuth();
  const [activeRideId, setActiveRideId] = useState<number | null>(null);

  // Not logged in → show login
  if (!user) {
    return (
      <LoginScreen
        onLoginRideCheck={(rideId) => setActiveRideId(rideId)}
      />
    );
  }

  // Logged in and has active ride → show ride screen
  if (activeRideId) {
    return (
      <RideScreen
        rideId={activeRideId}
        onEndRide={() => setActiveRideId(null)}
      />
    );
  }

  // Logged in but no active ride → home
  return (
    <HomeScreen
      onRideCreated={(id) => setActiveRideId(id)}
      onActiveRideDetected={(id) => setActiveRideId(id)}
    />
  );
}
