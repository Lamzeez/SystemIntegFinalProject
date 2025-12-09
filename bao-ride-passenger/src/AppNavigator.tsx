// src/AppNavigator.tsx (PASSENGER)
import React, { useState } from "react";
import { useAuth } from "./AuthContext";
import LoginScreen from "./screens/LoginScreen";
import HomeScreen from "./screens/HomeScreen";
import RideScreen from "./screens/RideScreen";
import RegisterScreen from "./screens/RegisterScreen";

export default function AppNavigator() {
  const { user } = useAuth();

  // Track current active ride
  const [activeRideId, setActiveRideId] = useState<number | null>(null);
  const [activeRide, setActiveRide] = useState<any | null>(null);

  // Track whether we are on the Register screen (when logged out)
  const [showRegister, setShowRegister] = useState(false);

  // --------------------
  // NOT LOGGED IN
  // --------------------
  if (!user) {
    // Show Register screen when user chose "Register"
    if (showRegister) {
      return (
        <RegisterScreen
          onSwitchToLogin={() => setShowRegister(false)}
        />
      );
    }

    // Default: show Login screen
    return (
      <LoginScreen
        onLoginRideCheck={(rideId) => {
          // If backend returns an active ride on login
          setActiveRideId(rideId);
          setActiveRide(null);
        }}
        onNavigateToRegister={() => setShowRegister(true)}
      />
    );
  }

  // --------------------
  // LOGGED IN + HAS ACTIVE RIDE
  // --------------------
  if (activeRideId) {
    return (
      <RideScreen
        rideId={activeRideId}
        initialRide={activeRide} // optional, used to avoid refetch right away
        onEndRide={() => {
          setActiveRideId(null);
          setActiveRide(null);
        }}
      />
    );
  }

  // --------------------
  // LOGGED IN + NO ACTIVE RIDE → HOME
  // --------------------
  return (
    <HomeScreen
      onRideCreated={(ride: any) => {
        // When a ride is requested from HomeScreen
        setActiveRideId(ride.id);
        setActiveRide(ride);
      }}
      onActiveRideDetected={(ride: any) => {
        // When HomeScreen detects that a ride already exists
        setActiveRideId(ride.id);
        setActiveRide(ride);
      }}
    />
  );
}
