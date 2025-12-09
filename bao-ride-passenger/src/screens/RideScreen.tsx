// src/screens/RideScreen.tsx (PASSENGER)
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
  estimated_fare?: number;
  fare?: number;
  passenger_name?: string;
  [key: string]: any;
};

type Coord = { latitude: number; longitude: number };

export default function RideScreen({
  rideId,
  initialRide,
  onEndRide,
}: {
  rideId: number;
  initialRide?: Ride | null;
  onEndRide: () => void;
}) {
  const [ride, setRide] = useState<Ride | null>(initialRide ?? null);
  const [statusText, setStatusText] = useState<string>(
    initialRide?.status || "requested"
  );

  const [routeCoords, setRouteCoords] = useState<Coord[]>([]);
  const [mapRegion, setMapRegion] = useState<Region | null>(null);

  // Load ride if we didn't get it as initialRide (e.g., app reopened)
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

  // WebSocket listener for real-time status updates
  useEffect(() => {
    const socket = getSocket();

    const handleUpdate = (payload: any) => {
      console.log("PASSENGER ride:status:update", payload);
      if (payload.rideId !== rideId) return;

      setRide((prev: any) => ({
        ...prev,
        status: payload.status,
        fare: payload.fare ?? prev?.fare,
        distance_km: payload.distanceKm ?? prev?.distance_km,
      }));
      setStatusText(payload.status);

      if (payload.status === "completed") {
        Alert.alert(
          "Ride Completed",
          `Total Fare: ₱${payload.fare ?? ride?.fare ?? "—"}`
        );
        onEndRide();
      }

      if (payload.status === "cancelled") {
        Alert.alert("Ride Cancelled", "Your ride has been cancelled.");
        onEndRide();
      }
    };

    socket.on("ride:status:update", handleUpdate);
    return () => {
      socket.off("ride:status:update", handleUpdate);
    };
  }, [rideId, onEndRide, ride?.fare]);

  // Load OSRM route polyline once we know pickup & dropoff
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
          console.log("OSRM route error:", data);
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

        // Compute a good region to show both pickup and dropoff
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
        console.log("Failed to load route polyline", err);
      }
    };

    fetchRoute();
  }, [ride?.pickup_lat, ride?.pickup_lng, ride?.dropoff_lat, ride?.dropoff_lng]);

  const cancelRide = async () => {
    try {
      await api.post(`/rides/${rideId}/cancel`);
      // status change will be handled by socket / backend
    } catch (e) {
      console.log("Cancel failed", e);
      Alert.alert("Error", "Failed to cancel ride.");
    }
  };

  if (!ride) {
    return <Text style={{ padding: 20 }}>Loading ride...</Text>;
  }

  // distance & fare display helpers
  const displayDistance = () => {
    if (ride.estimated_distance_km != null) {
      return `${Number(ride.estimated_distance_km).toFixed(1)} km`;
    }
    if (ride.distance_km != null) {
      return `${Number(ride.distance_km).toFixed(1)} km`;
    }
    return "—";
  };

  const displayFare = () => {
    if (ride.estimated_fare != null) {
      return `₱${ride.estimated_fare}`;
    }
    if (ride.fare != null) {
      return `₱${ride.fare}`;
    }
    return "—";
  };

  const pickupLat = Number(ride.pickup_lat);
  const pickupLng = Number(ride.pickup_lng);
  const dropoffLat = Number(ride.dropoff_lat);
  const dropoffLng = Number(ride.dropoff_lng);

  const hasPickup =
    isFinite(pickupLat) && isFinite(pickupLng);
  const hasDropoff =
    isFinite(dropoffLat) && isFinite(dropoffLng);

  const initialRegion: Region = mapRegion || {
    latitude: hasPickup ? pickupLat : 6.95,
    longitude: hasPickup ? pickupLng : 126.2333,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  };

  const canCancel =
    statusText === "requested" || statusText === "assigned";

  return (
    <View style={{ flex: 1 }}>
      {/* Map with route line */}
      <MapView style={{ flex: 1 }} initialRegion={initialRegion} region={mapRegion || initialRegion}>
        {hasPickup && (
          <Marker
            coordinate={{ latitude: pickupLat, longitude: pickupLng }}
            title="Pickup"
            pinColor="green"
          />
        )}
        {hasDropoff && (
          <Marker
            coordinate={{ latitude: dropoffLat, longitude: dropoffLng }}
            title="Dropoff"
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
        <Text>Status: {statusText}</Text>
        <Text>Estimated distance: {displayDistance()}</Text>
        <Text>Estimated fare: {displayFare()}</Text>

        {canCancel && (
          <View style={{ marginTop: 12 }}>
            <Button title="Cancel Ride" onPress={cancelRide} color="red" />
          </View>
        )}
      </View>
    </View>
  );
}
