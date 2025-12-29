// src/AppNavigator.tsx (DRIVER)
import React, { useState } from "react";
import { useAuth } from "./AuthContext";
import LoginScreen from "./screens/LoginScreen";
import HomeScreen from "./screens/HomeScreen";
import RideScreen from "./screens/RideScreen";
import HistoryScreen from "./screens/HistoryScreen"; // ✅ NEW

type Screen = "home" | "ride" | "history";

export default function AppNavigator() {
  const { user } = useAuth();

  const [screen, setScreen] = useState<Screen>("home");
  const [activeRideId, setActiveRideId] = useState<number | null>(null);
  const [activeRide, setActiveRide] = useState<any | null>(null);

  if (!user) {
    return (
      <LoginScreen
        onLoginRideCheck={(rideId) => {
          setActiveRideId(rideId);
          setActiveRide(null);
          setScreen("ride");
        }}
      />
    );
  }

  if (screen === "ride" && activeRideId) {
    return (
      <RideScreen
        rideId={activeRideId}
        initialRide={activeRide}
        onEndRide={() => {
          setActiveRideId(null);
          setActiveRide(null);
          setScreen("home");
        }}
        onBack={() => {
          setActiveRideId(null);
          setActiveRide(null);
          setScreen("home");
        }}
      />
    );
  }

  if (screen === "history") {
    return (
      <HistoryScreen
        onBack={() => {
          setScreen("home");
        }}
      />
    );
  }

  // default: home
  return (
    <HomeScreen
      onOpenRide={(ride) => {
        setActiveRideId(ride.id);
        setActiveRide(ride);
        setScreen("ride");
      }}
      onOpenHistory={() => {
        setScreen("history");
      }}
    />
  );
}
