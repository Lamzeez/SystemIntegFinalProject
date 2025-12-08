// src/AppNavigator.tsx
import React from "react";
import { useAuth } from "./AuthContext";
import LoginScreen from "./screens/LoginScreen";
import HomeScreen from "./screens/HomeScreen";
import RideScreen from "./screens/RideScreen";
import { useState } from "react";

export default function AppNavigator() {
  const { user } = useAuth();
  const [activeRideId, setActiveRideId] = useState<number | null>(null);

  if (!user) return <LoginScreen onLoginRideCheck={(rideId) => setActiveRideId(rideId)} />;

  if (activeRideId) {
    return <RideScreen rideId={activeRideId} onEndRide={() => setActiveRideId(null)} />;
  }

  return <HomeScreen onRideAssigned={(id) => setActiveRideId(id)} />;
}
