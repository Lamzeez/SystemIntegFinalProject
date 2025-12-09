// src/screens/HomeScreen.tsx
import React, { useEffect, useState } from "react";
import { View, Text, Button } from "react-native";
import { useAuth } from "../AuthContext";
import { api } from "../api";
import { getSocket } from "../socket";
import MapView, {
  Marker,
  MapPressEvent,
  Region,
  PoiClickEvent,
} from "react-native-maps";

type LatLng = { latitude: number; longitude: number };

export default function HomeScreen({
  onRideCreated,
  onActiveRideDetected,
}: {
  onRideCreated: (ride: any) => void;
  onActiveRideDetected: (ride: any) => void;
}) {
  const { user, logout } = useAuth();

  // map coords
  const [pickupCoord, setPickupCoord] = useState<LatLng | null>(null);
  const [dropoffCoord, setDropoffCoord] = useState<LatLng | null>(null);

  // labels shown and sent to backend
  const [pickupLabel, setPickupLabel] = useState<string | null>(null);
  const [dropoffLabel, setDropoffLabel] = useState<string | null>(null);

  // are we choosing pickup or dropoff right now
  const [selection, setSelection] = useState<"pickup" | "dropoff">("pickup");

  const [msg, setMsg] = useState("");

  // default map region: Mati City, Davao Oriental
  const MATI_DEFAULT_REGION: Region = {
    latitude: 6.95,
    longitude: 126.2333,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  };

  // tap anywhere on map (not POI)
  const handleMapPress = (e: MapPressEvent) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;

    if (selection === "pickup") {
      setPickupCoord({ latitude, longitude });
      if (!pickupLabel) setPickupLabel("Pinned pickup");
      setMsg("Pickup location set on map.");
    } else {
      setDropoffCoord({ latitude, longitude });
      if (!dropoffLabel) setDropoffLabel("Pinned dropoff");
      setMsg("Dropoff location set on map.");
    }
  };

  // tap on POI (store, school, company icons)
  const handlePoiClick = (e: PoiClickEvent) => {
    const { coordinate, name } = e.nativeEvent;
    const { latitude, longitude } = coordinate;

    if (selection === "pickup") {
      setPickupCoord({ latitude, longitude });
      setPickupLabel(name || "Pinned pickup");
      setMsg(`Pickup set: ${name || "Pinned pickup"}`);
    } else {
      setDropoffCoord({ latitude, longitude });
      setDropoffLabel(name || "Pinned dropoff");
      setMsg(`Dropoff set: ${name || "Pinned dropoff"}`);
    }
  };

  // on mount: check if passenger already has active ride
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

  // listen for driver assignment updates
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
    if (!pickupCoord || !dropoffCoord) {
      setMsg("Please choose pickup and dropoff on the map.");
      return;
    }

    const pickupAddress = pickupLabel || "Pinned pickup";
    const dropoffAddress = dropoffLabel || "Pinned dropoff";

    try {
      const res = await api.post("/rides/request", {
        pickup_lat: pickupCoord.latitude,
        pickup_lng: pickupCoord.longitude,
        dropoff_lat: dropoffCoord.latitude,
        dropoff_lng: dropoffCoord.longitude,
        pickup_address: pickupAddress,
        dropoff_address: dropoffAddress,
      });

      const ride = res.data.ride;
      if (ride?.id) {
        const dist = ride.estimated_distance_km
          ? Number(ride.estimated_distance_km).toFixed(1)
          : null;
        const fare = ride.estimated_fare;

        setMsg(
          dist && fare != null
            ? `Ride requested! Estimated distance: ${dist} km, fare: ₱${fare}`
            : "Ride requested!"
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
      {/* top controls */}
      <View style={{ padding: 20 }}>
        <Text style={{ fontSize: 22, fontWeight: "bold", marginBottom: 10 }}>
          Hello, {user?.name}
        </Text>

        <Text style={{ marginBottom: 6 }}>
          Select which location to set on the map:
        </Text>

        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            marginBottom: 10,
          }}
        >
          <Button
            title={
              selection === "pickup"
                ? "Choosing PICKUP (tap map / POI)"
                : "Set pickup"
            }
            onPress={() => setSelection("pickup")}
          />
          <Button
            title={
              selection === "dropoff"
                ? "Choosing DROPOFF (tap map / POI)"
                : "Set dropoff"
            }
            onPress={() => setSelection("dropoff")}
          />
        </View>

        <Text>
          Pickup:{" "}
          {pickupLabel
            ? pickupLabel
            : pickupCoord
            ? "Pinned location"
            : "Not set"}
        </Text>
        <Text style={{ marginBottom: 8 }}>
          Dropoff:{" "}
          {dropoffLabel
            ? dropoffLabel
            : dropoffCoord
            ? "Pinned location"
            : "Not set"}
        </Text>

        <Button title="REQUEST RIDE" onPress={requestRide} />

        {msg ? <Text style={{ marginTop: 10 }}>{msg}</Text> : null}

        <View style={{ marginTop: 20 }}>
          <Button title="Logout" onPress={logout} color="red" />
        </View>
      </View>

      {/* map area */}
      <MapView
        style={{ flex: 1 }}
        initialRegion={MATI_DEFAULT_REGION}
        onPress={handleMapPress}
        onPoiClick={handlePoiClick}
      >
        {pickupCoord && (
          <Marker
            coordinate={pickupCoord}
            title={pickupLabel || "Pickup"}
            pinColor="green"
          />
        )}
        {dropoffCoord && (
          <Marker
            coordinate={dropoffCoord}
            title={dropoffLabel || "Dropoff"}
            pinColor="red"
          />
        )}
      </MapView>
    </View>
  );
}
