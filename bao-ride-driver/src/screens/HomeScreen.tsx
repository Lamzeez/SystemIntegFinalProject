// src/screens/HomeScreen.tsx
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
  const [status, setStatus] = useState("offline");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const socket = getSocket();

    const handleIncoming = (ride: any) => {
      console.log("Ride incoming:", ride);
      setMsg("New ride assigned!");
      onRideAssigned(ride.id);
    };

    socket.on("ride:incoming", handleIncoming);

    // ✅ cleanup – returns void
    return () => {
      socket.off("ride:incoming", handleIncoming);
    };
  }, [onRideAssigned]);

  const setDriverStatus = async (state: "online" | "offline") => {
    try {
      await api.post("/driver/status", { status: state });
      setStatus(state);
    } catch {
      setMsg("Failed to update status.");
    }
  };

  return (
    <View style={{ padding: 20 }}>
      <Text style={{ fontSize: 22, fontWeight: "bold" }}>
        Hello, {user?.name}
      </Text>

      <Text style={{ marginVertical: 10 }}>Status: {status}</Text>

      <Button title="Go Online" onPress={() => setDriverStatus("online")} />
      <Button title="Go Offline" onPress={() => setDriverStatus("offline")} />

      {msg ? <Text style={{ marginTop: 20 }}>{msg}</Text> : null}

      <View style={{ marginTop: 40 }}>
        <Button title="Logout" onPress={logout} color="red" />
      </View>
    </View>
  );
}
