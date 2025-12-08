// src/screens/RideScreen.tsx (PASSENGER VERSION)
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
  const [statusText, setStatusText] = useState(
    initialRide?.status || "requested"
  );

  // Fetch only if we don't have an initial ride
  useEffect(() => {
    if (initialRide) return;

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
  }, [initialRide]);

  // ---------------------------------------------------
  // ✅ Real-time WebSocket Listener for ride status changes
  // ---------------------------------------------------
  useEffect(() => {
    const socket = getSocket();

    const handleUpdate = (payload: any) => {
      console.log("PASSENGER RECEIVED ride:status:update", payload);

      if (payload.rideId !== rideId) return;

      // Update ride state
      setRide((prev: any) => ({
        ...prev,
        status: payload.status,
        fare: payload.fare ?? prev?.fare,
        distance_km: payload.distanceKm ?? prev?.distance_km,
      }));

      setStatusText(payload.status);

      // Handle ride completion
      if (payload.status === "completed") {
        Alert.alert(
          "Ride Completed",
          `Total Fare: ₱${payload.fare ?? ride?.fare ?? "—"}`
        );
        onEndRide();
      }

      // Handle cancellation
      if (payload.status === "cancelled") {
        Alert.alert("Ride Cancelled", "Driver or passenger cancelled the ride.");
        onEndRide();
      }
    };

    socket.on("ride:status:update", handleUpdate);

    return () => {
      socket.off("ride:status:update", handleUpdate);
    };
  }, [rideId, onEndRide, ride?.fare]);

  // ---------------------------------------------------
  // OPTIONAL SAFETY NET: Poll the backend every 3 seconds
  // ---------------------------------------------------
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await api.get("/passenger/rides/current");
        const current = res.data.ride;
        if (!current) return;

        if (current.id === rideId) {
          setRide(current);
          setStatusText(current.status);

          if (current.status === "completed" || current.status === "cancelled") {
            onEndRide();
          }
        }
      } catch (err) {
        console.log("Polling error", err);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [rideId, onEndRide]);

  // ---------------------------------------------------

  if (!ride) {
    return <Text style={{ padding: 20 }}>Loading ride...</Text>;
  }

  return (
    <View style={{ padding: 20 }}>
      <Text style={{ fontSize: 20, fontWeight: "bold", marginBottom: 10 }}>
        Ride #{rideId}
      </Text>

      <Text>Status: {statusText}</Text>

      <Text>
        Estimated distance:{" "}
        {ride.estimated_distance_km != null
            ? `${Number(ride.estimated_distance_km).toFixed(1)} km`
            : ride.distance_km != null
            ? `${Number(ride.distance_km).toFixed(1)} km`
            : "—"}
      </Text>

      <Text>
        Estimated fare:{" "}
        {ride.estimated_fare != null
            ? `₱${ride.estimated_fare}`
            : ride.fare != null
            ? `₱${ride.fare}`
            : "—"}
      </Text>


      {/* CANCEL BUTTON */}
      {(statusText === "requested" || statusText === "assigned") && (
        <View style={{ marginTop: 20 }}>
          <Button
            title="CANCEL RIDE"
            onPress={async () => {
              try {
                await api.post(`/rides/${rideId}/cancel`);
              } catch (e) {
                console.log("Cancel failed", e);
              }
            }}
            color="red"
          />
        </View>
      )}
    </View>
  );
}
