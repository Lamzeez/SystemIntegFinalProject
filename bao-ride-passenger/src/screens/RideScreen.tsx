// src/screens/RideScreen.tsx (PASSENGER VERSION)
import React, { useEffect, useState } from "react";
import { View, Text, Button, Alert } from "react-native";
import { api } from "../api";
import { getSocket } from "../socket";

export default function RideScreen({
  rideId,
  onEndRide,
}: {
  rideId: number;
  onEndRide: () => void;
}) {
  const [ride, setRide] = useState<any>(null);
  const [statusText, setStatusText] = useState<string>("");

  // Load current ride once
  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get("/passenger/rides/current");
        if (res.data.ride) {
          setRide(res.data.ride);
          setStatusText(res.data.ride.status);
        }
      } catch (e) {
        console.log("Failed to load ride", e);
      }
    };
    load();
  }, []);

  // Listen to status updates
  useEffect(() => {
    const socket = getSocket();

    const handleUpdate = (payload: any) => {
        if (payload.rideId !== rideId) return;

        if (payload.status === "completed") {
            alert("Ride completed! Fare: ₱" + payload.fare);
            onEndRide();
        }

        if (payload.status === "cancelled") {
            alert("Passenger cancelled this ride.");
            onEndRide();
        }
    };


    socket.on("ride:status:update", handleUpdate);
    return () => {
      socket.off("ride:status:update", handleUpdate);
    };
  }, [rideId, onEndRide]);

  const cancelRide = async () => {
    try {
      await api.post(`/rides/${rideId}/cancel`);
      // The socket event will handle UI transition via handleUpdate
    } catch (e: any) {
      console.log("Cancel failed", e.response?.data || e);
      Alert.alert("Error", "Failed to cancel ride.");
    }
  };

  if (!ride) {
    return <Text style={{ padding: 20 }}>Loading ride...</Text>;
  }

  const showCancel =
    statusText === "requested" || statusText === "assigned";

  return (
    <View style={{ padding: 20 }}>
      <Text style={{ fontSize: 20, fontWeight: "bold", marginBottom: 8 }}>
        Ride #{rideId}
      </Text>
      <Text>Driver: {ride.driver_name || "Finding driver..."}</Text>
      <Text>Status: {statusText || ride.status}</Text>

      {showCancel && (
        <View style={{ marginTop: 20 }}>
          <Button title="Cancel Ride" onPress={cancelRide} />
        </View>
      )}
    </View>
  );
}
