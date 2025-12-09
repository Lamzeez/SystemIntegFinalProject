// bao-ride-driver/src/screens/RideScreen.tsx (DRIVER VERSION)
import React, { useEffect, useState } from "react";
import { View, Text, Button, Alert } from "react-native";
import { api } from "../api";
import { getSocket } from "../socket";
import MapView, { Marker, Polyline, Region } from "react-native-maps";

type Ride = {
  id: number;
  status: string;
  pickup_lat?: number | string;
  pickup_lng?: number | string;
  dropoff_lat?: number | string;
  dropoff_lng?: number | string;
  estimated_distance_km?: number | string;
  distance_km?: number | string;
  final_distance_km?: number | string;
  estimated_fare?: number;
  fare?: number;
  final_fare?: number;
  passenger_name?: string;
  pickup_address?: string;
  dropoff_address?: string;
  [key: string]: any;
};

type Coord = { latitude: number; longitude: number };

export default function RideScreen({
  rideId,
  initialRide,
  onEndRide,
  onBack,
}: {
  rideId: number;
  initialRide?: Ride | null;
  onEndRide: () => void;
  onBack: () => void;
}) {
  const [ride, setRide] = useState<Ride | null>(initialRide ?? null);
  const [statusText, setStatusText] = useState<string>(
    initialRide?.status || "requested"
  );

  const [routeCoords, setRouteCoords] = useState<Coord[]>([]);
  const [mapRegion, setMapRegion] = useState<Region | null>(null);

  // Load ride details if not provided by AppNavigator
  useEffect(() => {
    if (initialRide) return;

    const load = async () => {
      try {
        const res = await api.get("/driver/rides/current");
        if (res.data.ride) {
          setRide(res.data.ride);
          setStatusText(res.data.ride.status);
        }
      } catch (e) {
        console.log("Driver failed to load ride", e);
      }
    };

    load();
  }, [initialRide]);

  // Listen for passenger cancelling / ride completing
  useEffect(() => {
    const socket = getSocket();

    const handleUpdate = (payload: any) => {
      if (payload.rideId !== rideId) return;

      setRide((prev) => {
        const existing = prev || ({} as Ride);

        const updated: Ride = {
          ...existing,
          status: payload.status ?? existing.status,
          // prefer final_fare, then fare, then keep previous
          fare:
            payload.fare ??
            payload.final_fare ??
            existing.fare ??
            existing.final_fare,
          final_fare:
            payload.final_fare ??
            payload.fare ??
            existing.final_fare ??
            existing.fare,
          distance_km:
            payload.distanceKm ??
            payload.final_distance_km ??
            existing.distance_km ??
            existing.final_distance_km,
          final_distance_km:
            payload.final_distance_km ??
            payload.distanceKm ??
            existing.final_distance_km ??
            existing.distance_km,
        };

        return updated;
      });

      setStatusText(payload.status);

      if (payload.status === "completed") {
        const finalFare =
          payload.final_fare ??
          payload.fare ??
          ride?.final_fare ??
          ride?.fare ??
          ride?.estimated_fare ??
          "—";

        Alert.alert("Ride completed", `Fare: ₱${finalFare}`);
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
  }, [rideId, onEndRide, ride?.fare, ride?.final_fare, ride?.estimated_fare]);

  // Load OSRM route polyline when we have pickup/dropoff coordinates
  useEffect(() => {
    if (!ride) return;

    const lat1 = Number(ride.pickup_lat);
    const lng1 = Number(ride.pickup_lng);
    const lat2 = Number(ride.dropoff_lat);
    const lng2 = Number(ride.dropoff_lng);

    if (
      !isFinite(lat1) ||
      !isFinite(lng1) ||
      !isFinite(lat2) ||
      !isFinite(lng2)
    ) {
      return;
    }

    const fetchRoute = async () => {
      try {
        const url = `http://router.project-osrm.org/route/v1/driving/${lng1},${lat1};${lng2},${lat2}?overview=full&geometries=geojson`;
        const res = await fetch(url);
        const data = await res.json();

        if (data.code !== "Ok" || !data.routes || !data.routes.length) {
          console.log("OSRM route error (driver):", data);
          return;
        }

        const coords: Coord[] =
          data.routes[0].geometry.coordinates.map(
            (pair: [number, number]): Coord => ({
              latitude: pair[1],
              longitude: pair[0],
            })
          );

        setRouteCoords(coords);

        // Center map between pickup and dropoff
        const midLat = (lat1 + lat2) / 2;
        const midLng = (lng1 + lng2) / 2;
        const latDiff = Math.abs(lat1 - lat2) || 0.01;
        const lngDiff = Math.abs(lng1 - lng2) || 0.01;

        setMapRegion({
          latitude: midLat,
          longitude: midLng,
          latitudeDelta: latDiff * 1.8,
          longitudeDelta: lngDiff * 1.8,
        });
      } catch (err) {
        console.log("Driver failed to load route polyline", err);
      }
    };

    fetchRoute();
  }, [ride?.pickup_lat, ride?.pickup_lng, ride?.dropoff_lat, ride?.dropoff_lng]);

  const acceptRide = async () => {
    try {
      await api.post(`/driver/rides/${rideId}/accept`);
      setRide((prev) => (prev ? { ...prev, status: "assigned" } : prev));
      setStatusText("assigned");
    } catch (e: any) {
      console.log("Accept failed", e.response?.data || e);
      Alert.alert(
        "Error",
        e.response?.data?.error || "Failed to accept ride."
      );
    }
  };

  const startRide = async () => {
    try {
      await api.post(`/driver/rides/${rideId}/start`);
      setRide((prev) =>
        prev ? { ...prev, status: "in_progress" } : prev
      );
      setStatusText("in_progress");
    } catch (e: any) {
      console.log("Start failed", e.response?.data || e);
      Alert.alert("Error", "Failed to start ride.");
    }
  };

  const completeRide = async () => {
    try {
      const res = await api.post(`/driver/rides/${rideId}/complete`);
      const finalFare =
        res.data?.final_fare ?? res.data?.fare ?? ride?.final_fare ?? ride?.fare;

      setRide((prev) =>
        prev
          ? {
              ...prev,
              status: "completed",
              final_fare: finalFare ?? prev.final_fare,
              fare: finalFare ?? prev.fare,
            }
          : prev
      );

      Alert.alert("Ride completed", `Fare: ₱${finalFare ?? "—"}`);
      onEndRide();
    } catch (e: any) {
      console.log("Complete failed", e.response?.data || e);
      Alert.alert("Error", "Failed to complete ride.");
    }
  };

  if (!ride) {
    return <Text style={{ padding: 20 }}>Loading ride...</Text>;
  }

  // distance display: prefer final_distance, then distance, then estimated
  const displayDistance = () => {
    if (ride.final_distance_km != null) {
      return `${Number(ride.final_distance_km).toFixed(1)} km`;
    }
    if (ride.distance_km != null) {
      return `${Number(ride.distance_km).toFixed(1)} km`;
    }
    if (ride.estimated_distance_km != null) {
      return `${Number(ride.estimated_distance_km).toFixed(1)} km`;
    }
    return "—";
  };

  // total fare: prefer final_fare, then fare, then estimated_fare
  const totalFare =
    ride.final_fare ??
    ride.fare ??
    ride.estimated_fare ??
    null;

  const pickupLat = Number(ride.pickup_lat);
  const pickupLng = Number(ride.pickup_lng);
  const dropoffLat = Number(ride.dropoff_lat);
  const dropoffLng = Number(ride.dropoff_lng);

  const hasPickup = isFinite(pickupLat) && isFinite(pickupLng);
  const hasDropoff = isFinite(dropoffLat) && isFinite(dropoffLng);

  const initialRegion: Region = mapRegion || {
    latitude: hasPickup ? pickupLat : 6.95,
    longitude: hasPickup ? pickupLng : 126.2333,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Map with route line */}
      <MapView
        style={{ flex: 1 }}
        initialRegion={initialRegion}
        region={mapRegion || initialRegion}
      >
        {hasPickup && (
          <Marker
            coordinate={{ latitude: pickupLat, longitude: pickupLng }}
            title={ride.pickup_address || "Pickup"}
            pinColor="green"
          />
        )}
        {hasDropoff && (
          <Marker
            coordinate={{ latitude: dropoffLat, longitude: dropoffLng }}
            title={ride.dropoff_address || "Dropoff"}
            pinColor="red"
          />
        )}
        {routeCoords.length > 1 && (
          <Polyline
            coordinates={routeCoords}
            strokeColor="green"
            strokeWidth={4}
          />
        )}
      </MapView>

      {/* Info + actions */}
      <View style={{ padding: 16 }}>
        <Text style={{ fontSize: 18, fontWeight: "bold", marginBottom: 4 }}>
          Ride #{rideId}
        </Text>
        <Text>Passenger: {ride.passenger_name ?? "Unknown passenger"}</Text>
        <Text>Pickup: {ride.pickup_address}</Text>
        <Text>Dropoff: {ride.dropoff_address}</Text>
        <Text>Status: {statusText}</Text>
        <Text>Distance: {displayDistance()}</Text>
        <Text>
          Total fare: {totalFare != null ? `₱${totalFare}` : "₱--"}
        </Text>

        <View style={{ marginTop: 12 }}>
          {statusText === "requested" && (
            <Button title="ACCEPT RIDE" onPress={acceptRide} />
          )}
          {statusText === "assigned" && (
            <Button title="START RIDE" onPress={startRide} />
          )}
          {statusText === "in_progress" && (
            <Button title="COMPLETE RIDE" onPress={completeRide} />
          )}
        </View>
        <View style={{ marginTop: 12, marginBottom: 40}}>
          <Button title="Back to Home" onPress={onBack} />
        </View>
      </View>
    </View>
  );
}
