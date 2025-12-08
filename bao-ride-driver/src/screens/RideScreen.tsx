// src/screens/RideScreen.tsx
import React, { useEffect, useState } from "react";
import { View, Text, Button } from "react-native";
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

  useEffect(() => {
    const load = async () => {
      const res = await api.get("/driver/rides/current");
      setRide(res.data.ride);
    };
    load();
  }, []);

  useEffect(() => {
    const socket = getSocket();

    const handleUpdate = (payload: any) => {
      if (payload.rideId === rideId && payload.status === "completed") {
        alert("Ride completed! Fare: ₱" + payload.fare);
        onEndRide();
      }
    };

    socket.on("ride:status:update", handleUpdate);

    return () => {
      socket.off("ride:status:update", handleUpdate);
    };
  }, [rideId, onEndRide]);

  const socket = getSocket();

  const acceptRide = () => socket.emit("ride:accept", { rideId });
  const startRide = () => socket.emit("ride:start", { rideId });
  const completeRide = () => socket.emit("ride:complete", { rideId });

  if (!ride) return <Text>Loading ride...</Text>;

  return (
    <View style={{ padding: 20 }}>
      <Text style={{ fontSize: 20, fontWeight: "bold" }}>Ride #{rideId}</Text>
      <Text>Passenger: {ride.passenger_name}</Text>

      <View style={{ marginVertical: 20 }}>
        <Button title="Accept Ride" onPress={acceptRide} />
        <Button title="Start Ride" onPress={startRide} />
        <Button title="Complete Ride" onPress={completeRide} />
      </View>
    </View>
  );
}
