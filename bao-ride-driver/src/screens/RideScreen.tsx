// src/screens/RideScreen.tsx (DRIVER)
import React, { useEffect, useState } from "react";
import { View, Text, Button, Alert } from "react-native";
import { api } from "../api";
import { getSocket } from "../socket";

export default function RideScreen({
  rideId,
  initialRide,
  onEndRide,
}: {
  rideId: number;
  initialRide?: any | null;
  onEndRide: () => void;
}) {
  const [ride, setRide] = useState<any | null>(initialRide ?? null);

  // Only fetch from backend if we don't already have ride details
  useEffect(() => {
    if (initialRide) {
      return;
    }

    const load = async () => {
      try {
        const res = await api.get("/driver/rides/current");
        if (res.data.ride) {
          setRide(res.data.ride);
        }
      } catch (e) {
        console.log("Failed to load ride", e);
      }
    };
    load();
  }, [initialRide]);

  // Listen for ride status updates (completed / cancelled)
  useEffect(() => {
    const socket = getSocket();

    const handleUpdate = (payload: any) => {
      if (payload.rideId !== rideId) return;

      if (payload.status === "completed") {
        Alert.alert(
          "Ride completed",
          `Fare: ₱${payload.fare ?? ride?.fare ?? "—"}`
        );
        onEndRide();
      }

      if (payload.status === "cancelled") {
        Alert.alert("Ride cancelled", "Passenger cancelled this ride.");
        onEndRide();
      }
    };

    socket.on("ride:status:update", handleUpdate);
    return () => {
      socket.off("ride:status:update", handleUpdate);
    };
  }, [rideId, onEndRide, ride?.fare]);

  const acceptRide = async () => {
    try {
      await api.post(`/driver/rides/${rideId}/accept`);
      setRide((r: any) => (r ? { ...r, status: "assigned" } : r));
    } catch (e: any) {
      console.log("Accept failed", e.response?.data || e);
      Alert.alert("Error", "Failed to accept ride.");
    }
  };

  const startRide = async () => {
    try {
      await api.post(`/driver/rides/${rideId}/start`);
      setRide((r: any) => (r ? { ...r, status: "in_progress" } : r));
    } catch (e: any) {
      console.log("Start failed", e.response?.data || e);
      Alert.alert("Error", "Failed to start ride.");
    }
  };

  const completeRide = async () => {
    try {
      const res = await api.post(`/driver/rides/${rideId}/complete`);
      const fare = res.data?.fare;
      Alert.alert("Ride completed", `Fare: ₱${fare ?? "—"}`);
      onEndRide();
    } catch (e: any) {
      console.log("Complete failed", e.response?.data || e);
      Alert.alert("Error", "Failed to complete ride.");
    }
  };

  if (!ride) {
    return <Text style={{ padding: 20 }}>Loading ride...</Text>;
  }

  return (
    <View style={{ padding: 20 }}>
      <Text style={{ fontSize: 20, fontWeight: "bold", marginBottom: 10 }}>
        Ride #{rideId}
      </Text>
      <Text>Passenger: {ride.passenger_name}</Text>
      <Text>Pickup: {ride.pickup_address}</Text>
      <Text>Dropoff: {ride.dropoff_address}</Text>
      <Text>Status: {ride.status}</Text>

      <View style={{ marginVertical: 20 }}>
        <Button title="ACCEPT RIDE" onPress={acceptRide} />
        <Button title="START RIDE" onPress={startRide} />
        <Button title="COMPLETE RIDE" onPress={completeRide} />
      </View>
    </View>
  );
}
