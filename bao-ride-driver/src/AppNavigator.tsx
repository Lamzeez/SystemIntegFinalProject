// src/AppNavigator.tsx (DRIVER)
import React, { useState } from "react";
import { useAuth } from "./AuthContext";
import LoginScreen from "./screens/LoginScreen";
import HomeScreen from "./screens/HomeScreen";
import RideScreen from "./screens/RideScreen";

export default function AppNavigator() {
  const { user } = useAuth();
  const [activeRideId, setActiveRideId] = useState<number | null>(null);
  const [activeRide, setActiveRide] = useState<any | null>(null);

  if (!user) {
    return (
      <LoginScreen
        onLoginRideCheck={(rideId) => {
          // When logging in we only know the id; RideScreen will fetch details
          setActiveRideId(rideId);
          setActiveRide(null);
        }}
      />
    );
  }

  if (activeRideId) {
    return (
      <RideScreen
        rideId={activeRideId}
        initialRide={activeRide}
        onEndRide={() => {
          setActiveRideId(null);
          setActiveRide(null);
        }}
        onBack={() => {
          // Just go back to HomeScreen; keep other rides:
          setActiveRideId(null);
          setActiveRide(null);
        }}
      />
    );
  }


  return (
    <HomeScreen
      onOpenRide={(ride) => {
        setActiveRideId(ride.id);
        setActiveRide(ride); // if you keep initialRide in RideScreen
      }}
    />
  );
}
