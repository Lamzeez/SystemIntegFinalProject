// src/screens/HomeScreen.tsx
import React, { useEffect, useState } from "react";
import { View, Text, TextInput, Button } from "react-native";
import { useAuth } from "../AuthContext";
import { api } from "../api";
import { getSocket } from "../socket";
import axios from "axios";


export default function HomeScreen({
  onRideCreated,
  onActiveRideDetected,
}: {
  onRideCreated: (id: number) => void;
  onActiveRideDetected: (id: number) => void;
}) {
  const { user, logout } = useAuth();
  const [pickup, setPickup] = useState("");
  const [destination, setDestination] = useState("");
  const [msg, setMsg] = useState("");

  // On mount, see if there's already an active ride
  useEffect(() => {
    const loadCurrentRide = async () => {
      try {
        const res = await api.get("/passenger/rides/current");
        if (res.data.ride?.id) {
          onActiveRideDetected(res.data.ride.id);
        }
      } catch (e) {
        console.log("Failed to check current ride", e);
      }
    };

    loadCurrentRide();
  }, [onActiveRideDetected]);

  // Listen for status updates (e.g., driver assigned, in_progress, etc.)
  useEffect(() => {
    const socket = getSocket();

    const handleStatusUpdate = (payload: any) => {
      // Adjust this logic to match your backend payload
      if (payload.passengerId === user?.id && payload.status === "assigned") {
        // if your backend sends ride info here, you could update UI
        setMsg("Driver has been assigned!");
      }
    };

    socket.on("ride:status:update", handleStatusUpdate);

    return () => {
      socket.off("ride:status:update", handleStatusUpdate);
    };
  }, [user?.id]);

  const requestRide = async () => {
  if (!pickup || !destination) {
    setMsg("Please enter pickup and destination.");
    return;
  }

  try {
    const res = await api.post("/rides/request", {
      // TEMP: hard-coded coordinates for demo
      pickup_lat: 14.5995,
      pickup_lng: 120.9842,
      dropoff_lat: 14.6091,
      dropoff_lng: 121.0223,
      pickup_address: pickup,
      dropoff_address: destination,
    });

    const newRideId = res.data.ride?.id;
    if (newRideId) {
      setMsg("Ride requested! Searching for a driver...");
      onRideCreated(newRideId);
    } else {
      setMsg("Ride requested, but no ride ID returned.");
    }
  } catch (err: any) {
    if (axios.isAxiosError(err)) {
      console.log(
        "Ride request failed:",
        err.response?.status,
        err.response?.data
      );
      setMsg(
        err.response?.data?.error ||
          `Request failed (${err.response?.status || "no response"})`
      );
    } else {
      console.log("Unexpected error requesting ride", err);
      setMsg("Unexpected error requesting ride.");
    }
  }
};



  return (
    <View style={{ padding: 20 }}>
      <Text style={{ fontSize: 22, fontWeight: "bold", marginBottom: 10 }}>
        Hello, {user?.name}
      </Text>

      <Text style={{ marginBottom: 5 }}>Pickup location</Text>
      <TextInput
        style={{ borderWidth: 1, padding: 8, marginBottom: 10 }}
        value={pickup}
        onChangeText={setPickup}
      />

      <Text style={{ marginBottom: 5 }}>Destination</Text>
      <TextInput
        style={{ borderWidth: 1, padding: 8, marginBottom: 10 }}
        value={destination}
        onChangeText={setDestination}
      />

      {msg ? <Text style={{ marginVertical: 10 }}>{msg}</Text> : null}

      <Button title="Request Ride" onPress={requestRide} />

      <View style={{ marginTop: 40 }}>
        <Button title="Logout" onPress={logout} color="red" />
      </View>
    </View>
  );
}
