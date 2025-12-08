// passenger src/AppNavigator.tsx
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
      />
    );
  }

  return (
    <HomeScreen
      onRideCreated={(ride: any) => {
        setActiveRideId(ride.id);
        setActiveRide(ride);
      }}
      onActiveRideDetected={(ride: any) => {
        setActiveRideId(ride.id);
        setActiveRide(ride);
      }}
    />
  );
}
