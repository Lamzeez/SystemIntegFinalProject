import React, { useEffect, useState, useCallback } from "react";
import { View, Text, TouchableOpacity, Alert } from "react-native";
import { useAuth } from "../AuthContext";
import { api } from "../api";
import { getSocket } from "../socket";

type Ride = {
  id: number;
  pickup_address?: string;
  dropoff_address?: string;
  passenger_name?: string;
  estimated_distance_km?: number | string;
  estimated_fare?: number;
  status?: string;
  [key: string]: any;
};

type Props = {
  onOpenRide: (ride: Ride) => void;
};

export default function HomeScreen({ onOpenRide }: Props) {
  const { user, logout } = useAuth();
  const [status, setStatus] = useState<"online" | "offline" | "on_trip">(
    "offline"
  );
  const [availableRides, setAvailableRides] = useState<Ride[]>([]);

  const loadAvailable = useCallback(async () => {
    try {
      const res = await api.get("/driver/rides/available");
      setAvailableRides(res.data.rides || []);
    } catch (e) {
      console.log("Failed to load available rides", e);
    }
  }, []);


  // 1) Load driver status
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const res = await api.get("/driver/profile");
        if (res.data?.driver?.status) {
          setStatus(res.data.driver.status);
        }
      } catch (e) {
        console.log("Failed to load driver profile", e);
      }
    };
    loadProfile();
  }, []);

  // 2) Load currently available rides whenever HomeScreen mounts
  useEffect(() => {
    loadAvailable();
  }, [loadAvailable]);

  // 3) Listen for new incoming rides
  useEffect(() => {
    const socket = getSocket();

    const handleIncoming = (ride: Ride) => {
      console.log("Ride incoming:", ride);
      setAvailableRides((prev) => {
        if (prev.some((r) => r.id === ride.id)) return prev;
        return [...prev, ride];
      });
    };

    socket.on("ride:incoming", handleIncoming);

    return () => {
      socket.off("ride:incoming", handleIncoming);
    };
  }, []);

  // 4) Listen for ride status updates and remove rides that are no longer requested
  useEffect(() => {
    const socket = getSocket();

    const handleStatusUpdate = (payload: any) => {
      if (payload.rideId == null) return;
      if (payload.status && payload.status !== "requested") {
        setAvailableRides((prev) =>
          prev.filter((r) => r.id !== payload.rideId)
        );
      }
    };

    socket.on("ride:status:update", handleStatusUpdate);

    return () => {
      socket.off("ride:status:update", handleStatusUpdate);
    };
  }, []);

  const updateStatus = async (newStatus: "online" | "offline") => {
    try {
      await api.post("/driver/status", { status: newStatus });
      setStatus(newStatus);

      if (newStatus === "online") {
        // Refresh list of available rides when driver goes online
        await loadAvailable();
      }

      // Optional: clear rides when going offline
      if (newStatus === "offline") {
        setAvailableRides([]);
      }
    } catch (e) {
      console.log("Failed to update driver status", e);
    }
  };


  const handleLogout = () => {
    Alert.alert(
      "Logout",
      "Are you sure you want to logout?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Logout", style: "destructive", onPress: logout },
      ]
    );
  };


  return (
    <View style={{ flex: 1, padding: 20, marginTop: 20 }}>
      <Text style={{ fontSize: 24, fontWeight: "bold" }}>
        Hello, {user?.name}
      </Text>

      <Text style={{ marginVertical: 10 }}>Status: {status}</Text>

      <TouchableOpacity
        onPress={() => updateStatus("online")}
        activeOpacity={0.7}
        style={{
          paddingVertical: 10,
          borderRadius: 4,
          alignItems: "center",
          backgroundColor: "#2E7D32",
        }}
      >
        <Text style={{ color: "white", fontWeight: "bold" }}>GO ONLINE</Text>
      </TouchableOpacity>

      <View style={{ height: 8 }} />

      <TouchableOpacity
        onPress={() => updateStatus("offline")}
        activeOpacity={0.7}
        style={{
          paddingVertical: 10,
          borderRadius: 4,
          alignItems: "center",
          backgroundColor: "#757575",
        }}
      >
        <Text style={{ color: "white", fontWeight: "bold" }}>GO OFFLINE</Text>
      </TouchableOpacity>


      {/* Available rides list */}
      <View style={{ marginTop: 20, flex: 1 }}>
        <Text style={{ fontWeight: "bold", marginBottom: 8 }}>
          Available rides:
        </Text>
        {availableRides.length === 0 ? (
          <Text>No rides available yet.</Text>
        ) : (
          availableRides.map((ride) => (
            <View
              key={ride.id}
              style={{
                borderWidth: 1,
                borderColor: "#ccc",
                padding: 10,
                marginBottom: 10,
              }}
            >
              <Text>Ride #{ride.id}</Text>
              <Text>
                Passenger: {ride.passenger_name ?? "Unknown passenger"}
              </Text>
              <Text>Pickup: {ride.pickup_address}</Text>
              <Text>Dropoff: {ride.dropoff_address}</Text>
              {ride.estimated_distance_km != null && (
                <Text>
                  Est. distance:{" "}
                  {Number(ride.estimated_distance_km).toFixed(1)} km
                </Text>
              )}
              {ride.estimated_fare != null && (
                <Text>Est. fare: ₱{ride.estimated_fare}</Text>
              )}

              <View style={{ marginTop: 6 }}>
              <TouchableOpacity
                onPress={() => onOpenRide(ride)}
                activeOpacity={0.7}
                style={{
                  paddingVertical: 8,
                  borderRadius: 4,
                  alignItems: "center",
                  backgroundColor: "#1976D2",
                }}
              >
                <Text style={{ color: "white", fontWeight: "600" }}>Open Ride</Text>
              </TouchableOpacity>
            </View>

            </View>
          ))
        )}
      </View>

      <View style={{ marginTop: 10, marginBottom: 40 }}>
      <TouchableOpacity
        onPress={handleLogout}
        activeOpacity={0.7}
        style={{
          paddingVertical: 12,
          borderRadius: 4,
          alignItems: "center",
          backgroundColor: "red",
        }}
      >
        <Text style={{ color: "white", fontWeight: "bold", fontSize: 16 }}>
          LOGOUT
        </Text>
      </TouchableOpacity>
    </View>

    </View>
  );
}
