// src/screens/HomeScreen.tsx (DRIVER)
import React, { useEffect, useState } from "react";
import { View, Text, Button } from "react-native";
import { useAuth } from "../AuthContext";
import { api } from "../api";
import { getSocket } from "../socket";

export default function HomeScreen({
  onRideAssigned,
}: {
  onRideAssigned: (id: number) => void;
}) {
  const { user, logout } = useAuth();
  const [status, setStatus] = useState<"online" | "offline" | "on_trip">(
    "offline"
  );
  const [msg, setMsg] = useState("");

  // Load driver profile (to get current status)
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const res = await api.get("/driver/profile");
        setStatus(res.data.driver?.status || "offline");
      } catch (e) {
        console.log("Failed to load driver profile", e);
      }
    };
    loadProfile();
  }, []);

  // WebSocket: listen for incoming rides + check if there's already one
  useEffect(() => {
    const socket = getSocket();

    const handleIncoming = (ride: any) => {
      // This WS event is already filtered per-driver on the backend
      setMsg(
        `Incoming ride from ${
          ride.passenger_name || ride.passenger_id || "passenger"
        }`
      );
      onRideAssigned(ride.id);
    };

    socket.on("ride:incoming", handleIncoming);

    // Also check current ride from REST (in case app was closed then reopened)
    const checkCurrent = async () => {
      try {
        const res = await api.get("/driver/rides/current");
        if (res.data.ride?.id) {
          onRideAssigned(res.data.ride.id);
        }
      } catch (e) {
        console.log("Failed to check current ride", e);
      }
    };
    checkCurrent();

    return () => {
      socket.off("ride:incoming", handleIncoming);
    };
  }, [onRideAssigned]);

  const setDriverStatus = async (newStatus: "online" | "offline") => {
    try {
      const res = await api.post("/driver/status", { status: newStatus });
      setStatus(res.data.status);
      setMsg(`Status updated to ${res.data.status}`);
    } catch (e: any) {
      console.log("Failed to update driver status", e.response?.data || e);
      setMsg("Failed to update status");
    }
  };

  return (
    <View style={{ padding: 20 }}>
      <Text style={{ fontSize: 22, fontWeight: "bold" }}>
        Hello, {user?.name}
      </Text>
      <Text style={{ marginVertical: 10 }}>Status: {status}</Text>

      <Button title="GO ONLINE" onPress={() => setDriverStatus("online")} />
      <Button title="GO OFFLINE" onPress={() => setDriverStatus("offline")} />

      {msg ? <Text style={{ marginTop: 20 }}>{msg}</Text> : null}

      <View style={{ marginTop: 40 }}>
        <Button title="LOGOUT" onPress={logout} color="red" />
      </View>
    </View>
  );
}
