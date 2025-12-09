// src/screens/HomeScreen.tsx
import React, { useEffect, useState } from "react";
import { View, Text, TextInput, Button } from "react-native";
import { useAuth } from "../AuthContext";
import { api } from "../api";
import { getSocket } from "../socket";
import MapView, { Marker, MapPressEvent, Region } from "react-native-maps";

export default function HomeScreen({
  onRideCreated,
  onActiveRideDetected,
}: {
  onRideCreated: (ride: any) => void;
  onActiveRideDetected: (ride: any) => void;
}) {
  const { user, logout } = useAuth();

  // TEXT INPUTS
  const [pickup, setPickup] = useState("");
  const [destination, setDestination] = useState("");

  // MAP STATE
  const [pickupCoord, setPickupCoord] = useState<any>(null);
  const [dropoffCoord, setDropoffCoord] = useState<any>(null);
  const [selecting, setSelecting] = useState<"pickup" | "dropoff" | null>("pickup");

  const [msg, setMsg] = useState("");

  // INITIAL MAP LOCATION (Manila)
  const initialRegion: Region = {
    latitude: 14.5995,
    longitude: 120.9842,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  };

  // HANDLE MAP TAP
  const handleMapPress = (e: MapPressEvent) => {
    const coord = e.nativeEvent.coordinate;
    if (selecting === "pickup") {
      setPickupCoord(coord);
      setMsg("Pickup location set on map.");
    } else if (selecting === "dropoff") {
      setDropoffCoord(coord);
      setMsg("Dropoff location set on map.");
    }
  };

  // CHECK IF PASSENGER STILL HAS ACTIVE RIDE
  useEffect(() => {
    const loadCurrentRide = async () => {
      try {
        const res = await api.get("/passenger/rides/current");
        if (res.data.ride?.id) {
          onActiveRideDetected(res.data.ride);
        }
      } catch (e) {
        console.log("Failed to check current ride", e);
      }
    };
    loadCurrentRide();
  }, [onActiveRideDetected]);

  // SOCKET: LISTEN FOR STATUS UPDATES
  useEffect(() => {
    const socket = getSocket();
    const handleStatusUpdate = (payload: any) => {
      if (payload.passengerId === user?.id && payload.status === "assigned") {
        setMsg("Driver has been assigned!");
      }
    };
    socket.on("ride:status:update", handleStatusUpdate);
    return () => {
      socket.off("ride:status:update", handleStatusUpdate);
    };
  }, [user?.id]);

  const requestRide = async () => {
    // Require coordinates to be set
    if (!pickupCoord || !dropoffCoord) {
      setMsg("Please set pickup and dropoff by tapping the map.");
      return;
    }

    // Use manual text inputs OR fallback labels
    const pickupLabel =
      pickup.trim() ||
      `Pickup (${pickupCoord.latitude.toFixed(5)}, ${pickupCoord.longitude.toFixed(5)})`;

    const dropoffLabel =
      destination.trim() ||
      `Dropoff (${dropoffCoord.latitude.toFixed(5)}, ${dropoffCoord.longitude.toFixed(5)})`;

    try {
      const res = await api.post("/rides/request", {
        pickup_lat: pickupCoord.latitude,
        pickup_lng: pickupCoord.longitude,
        dropoff_lat: dropoffCoord.latitude,
        dropoff_lng: dropoffCoord.longitude,
        pickup_address: pickupLabel,
        dropoff_address: dropoffLabel,
      });

      const ride = res.data.ride;
      if (ride?.id) {
        setMsg(
          `Ride requested! Estimated distance: ${Number(
            ride.estimated_distance_km
          ).toFixed(1)} km, fare: ₱${ride.estimated_fare}`
        );
        onRideCreated(ride);
      } else {
        setMsg("Ride requested, but no ride ID returned.");
      }
    } catch (err: any) {
      console.log("Request ride error", err.response?.data || err);
      setMsg("Failed to request ride.");
    }
  };

  return (
    <View style={{ flex: 1 }}>
      {/* TEXT INPUT AREA */}
      <View style={{ padding: 20 }}>
        <Text style={{ fontSize: 22, fontWeight: "bold", marginBottom: 10 }}>
          Hello, {user?.name}
        </Text>

        <Text>Pickup address (optional)</Text>
        <TextInput
          style={{ borderWidth: 1, padding: 8, marginBottom: 10 }}
          value={pickup}
          onChangeText={setPickup}
        />

        <Text>Destination (optional)</Text>
        <TextInput
          style={{ borderWidth: 1, padding: 8, marginBottom: 10 }}
          value={destination}
          onChangeText={setDestination}
        />

        <View style={{ flexDirection: "row", marginBottom: 10 }}>
          <Button title="Set Pickup on Map" onPress={() => setSelecting("pickup")} />
          <View style={{ width: 10 }} />
          <Button
            title="Set Dropoff on Map"
            onPress={() => setSelecting("dropoff")}
          />
        </View>

        <Button title="Request Ride" onPress={requestRide} />

        {msg ? <Text style={{ marginTop: 10 }}>{msg}</Text> : null}

        <View style={{ marginTop: 30 }}>
          <Button title="Logout" onPress={logout} color="red" />
        </View>
      </View>

      {/* MAP AREA */}
      <MapView style={{ flex: 1 }} initialRegion={initialRegion} onPress={handleMapPress}>
        {pickupCoord && (
          <Marker coordinate={pickupCoord} title="Pickup" pinColor="green" />
        )}
        {dropoffCoord && (
          <Marker coordinate={dropoffCoord} title="Dropoff" pinColor="red" />
        )}
      </MapView>
    </View>
  );
}
