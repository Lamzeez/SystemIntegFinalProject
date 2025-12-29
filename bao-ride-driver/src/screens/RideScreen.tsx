// bao-ride-driver/src/screens/RideScreen.tsx (DRIVER VERSION)
import React, { useEffect, useState, useRef } from "react";
import { View, Text, TouchableOpacity, Alert } from "react-native";
import { api } from "../api";
import { getSocket } from "../socket";
import MapView, { Marker, Polyline, Region } from "react-native-maps";
import {
  startBackgroundLocation,
  stopBackgroundLocation,
  startForegroundWatch,
  ensureLocationPermissions,
} from "../location/locationTasks";

type Ride = {
  id: number;
  status: string;
  pickup_lat?: number | string;
  pickup_lng?: number | string;
  dropoff_lat?: number | string;
  dropoff_lng?: number | string;
  pickup_address?: string;
  dropoff_address?: string;
  passenger_name?: string;
  passenger_phone?: string;
  passenger_count?: number;
  estimated_distance_km?: number | string;
  estimated_duration_min?: number | string;
  distance_km?: number | string;
  estimated_fare?: number;
  fare?: number;
driver_id?: number | null;
  [key: string]: any;
};

type Coord = { latitude: number; longitude: number };

export default function RideScreen({
  rideId,
  initialRide,
  onBack,
  onEndRide,
}: {
  rideId: number;
  initialRide?: Ride | null;
  onBack: () => void;
  onEndRide: () => void;
}) {
  const [ride, setRide] = useState<Ride | null>(initialRide ?? null);
  const [statusText, setStatusText] = useState<string>(
    initialRide?.status || "requested"
  );

  const [routeCoords, setRouteCoords] = useState<Coord[]>([]);
  const [mapRegion, setMapRegion] = useState<Region | null>(null);

  const [myCoord, setMyCoord] = useState<Coord | null>(null);
  const [followMe, setFollowMe] = useState<boolean>(true);

  const mapRef = useRef<MapView | null>(null);
  const acceptedShownRef = useRef(false);
  const lastCameraMoveAtRef = useRef(0);
  const locSubRef = useRef<any>(null);

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
        console.log("Failed to load ride", e);
      }
    };

    load();
  }, [initialRide]);

  useEffect(() => {
    const socket = getSocket();

    const handleUpdate = (payload: any) => {
      if (payload.rideId !== rideId) return;

      setRide((prev: any) => ({
        ...prev,
        status: payload.status ?? prev?.status,
        fare: payload.fare ?? prev?.fare,
        distance_km: payload.distanceKm ?? prev?.distance_km,
        estimated_duration_min:
          payload.estimated_duration_min ?? prev?.estimated_duration_min,
passenger_count: payload.passenger_count ?? prev?.passenger_count,
      }));

      if (payload.status) setStatusText(payload.status);

      if (payload.status === "cancelled") {
        Alert.alert("Ride Cancelled", "This ride was cancelled.");
        onEndRide();
      }
      if (payload.status === "completed") {
        Alert.alert("Ride Completed", `Fare: ₱${payload.fare ?? "—"}`);
        onEndRide();
      }
    };

    socket.on("ride:status:update", handleUpdate);
    return () => {
      socket.off("ride:status:update", handleUpdate);
    };
  }, [rideId, onEndRide]);

  useEffect(() => {
    if (!ride) return;

    const lat1 = Number(ride.pickup_lat);
    const lng1 = Number(ride.pickup_lng);
    const lat2 = Number(ride.dropoff_lat);
    const lng2 = Number(ride.dropoff_lng);

    if (!isFinite(lat1) || !isFinite(lng1) || !isFinite(lat2) || !isFinite(lng2)) {
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

        const coords: Coord[] = data.routes[0].geometry.coordinates.map(
          (pair: [number, number]): Coord => ({
            latitude: pair[1],
            longitude: pair[0],
          })
        );

        setRouteCoords(coords);

        const midLat = (lat1 + lat2) / 2;
        const midLng = (lng1 + lng2) / 2;
        const latDiff = Math.abs(lat1 - lat2) || 0.01;
        const lngDiff = Math.abs(lng1 - lng2) || 0.01;

        const region: Region = {
          latitude: midLat,
          longitude: midLng,
          latitudeDelta: latDiff * 1.8,
          longitudeDelta: lngDiff * 1.8,
        };

        setMapRegion(region);
        mapRef.current?.animateToRegion(region, 200);
      } catch (err) {
        console.log("Failed to load route polyline", err);
      }
    };

    fetchRoute();
  }, [ride?.pickup_lat, ride?.pickup_lng, ride?.dropoff_lat, ride?.dropoff_lng]);

  useEffect(() => {
    const run = async () => {
      if (!ride) return;

      const isActive = ride.status === "assigned" || ride.status === "in_progress";
      if (!isActive) return;

      let driverId = Number(ride.driver_id);
      if (!Number.isFinite(driverId)) {
        try {
          const prof = await api.get("/driver/profile");
          driverId = Number(prof.data?.driver?.id);
        } catch {}
      }

      if (!Number.isFinite(driverId)) {
        console.log("No driverId available; skipping GPS emit.");
        return;
      }

      const ok = await ensureLocationPermissions();
      if (!ok) {
        Alert.alert(
          "Location needed",
          "Please allow location access so passengers can track you."
        );
        return;
      }

      if (!locSubRef.current) {
        locSubRef.current = await startForegroundWatch(driverId, (lat, lng) => {
          setMyCoord({ latitude: lat, longitude: lng });
        });
      }

      try {
        await startBackgroundLocation(driverId);
      } catch (e) {
        console.log("Failed to start background location", e);
      }
    };

    run();

    return () => {
      if (locSubRef.current) {
        try {
          locSubRef.current.remove?.();
        } catch {}
        locSubRef.current = null;
      }
    };
  }, [ride?.status, ride?.driver_id]);

  useEffect(() => {
    const stopIfEnded = async () => {
      if (!ride) {
        await stopBackgroundLocation();
        return;
      }

      if (ride.status === "completed" || ride.status === "cancelled") {
        await stopBackgroundLocation();
      }
    };

    stopIfEnded();
  }, [ride?.status, ride]);

  useEffect(() => {
    if (!followMe) return;
    if (!myCoord) return;

    const now = Date.now();
    if (now - lastCameraMoveAtRef.current < 900) return;
    lastCameraMoveAtRef.current = now;

    mapRef.current?.animateToRegion(
      {
        latitude: myCoord.latitude,
        longitude: myCoord.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      },
      250
    );
  }, [myCoord, followMe]);

  const acceptRide = async () => {
    try {
      await api.post(`/driver/rides/${rideId}/accept`);

      const res = await api.get("/driver/rides/current");
      if (res.data.ride) {
        setRide(res.data.ride);
        setStatusText(res.data.ride.status);
      }

      if (!acceptedShownRef.current) {
        acceptedShownRef.current = true;
        Alert.alert("Ride accepted", "You have accepted this ride.", [{ text: "OK" }]);
      }
    } catch (e: any) {
      console.log("Accept failed", e.response?.data || e);
      Alert.alert("Error", e.response?.data?.error || "Failed to accept ride.");
    }
  };

  const startRide = async () => {
    try {
      await api.post(`/driver/rides/${rideId}/start`);
      setRide((prev) => (prev ? { ...prev, status: "in_progress" } : prev));
      setStatusText("in_progress");
    } catch (e: any) {
      console.log("Start failed", e.response?.data || e);
      Alert.alert("Error", e.response?.data?.error || "Failed to start ride.");
    }
  };

  const completeRide = async () => {
    try {
      const res = await api.post(`/driver/rides/${rideId}/complete`);
      const fare = res.data?.fare ?? res.data?.ride?.fare;
      Alert.alert("Ride Completed", fare != null ? `Fare: ₱${fare}` : "Ride completed.");
      setRide((prev) => (prev ? { ...prev, status: "completed", fare } : prev));
      setStatusText("completed");
      await stopBackgroundLocation();
      onEndRide();
    } catch (e: any) {
      console.log("Complete failed", e.response?.data || e);
      Alert.alert("Error", e.response?.data?.error || "Failed to complete ride.");
    }
  };

  if (!ride) {
    return <Text style={{ padding: 20 }}>Loading ride...</Text>;
  }

  const pickupLat = Number(ride.pickup_lat);
  const pickupLng = Number(ride.pickup_lng);
  const dropoffLat = Number(ride.dropoff_lat);
  const dropoffLng = Number(ride.dropoff_lng);

  const hasPickup = isFinite(pickupLat) && isFinite(pickupLng);
  const hasDropoff = isFinite(dropoffLat) && isFinite(dropoffLng);

  const displayStatus = () => statusText || ride.status || "requested";

  const displayDistance = () => {
    if (ride.distance_km != null) return `${Number(ride.distance_km).toFixed(1)} km`;
    if (ride.estimated_distance_km != null)
      return `${Number(ride.estimated_distance_km).toFixed(1)} km`;
    return "—";
  };

  const displayEta = () => {
    const v = ride.estimated_duration_min;
    if (v == null) return "—";
    const n = Number(v);
    if (!isFinite(n)) return "—";
    return `${Math.round(n)} min`;
  };

  const totalFare = ride.fare ?? ride.estimated_fare ?? null;

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        <MapView
          ref={(r) => {
            mapRef.current = r;
          }}
          style={{ flex: 1 }}
          initialRegion={
            mapRegion ??
            (hasPickup
              ? {
                  latitude: pickupLat,
                  longitude: pickupLng,
                  latitudeDelta: 0.05,
                  longitudeDelta: 0.05,
                }
              : undefined)
          }
          onRegionChangeComplete={(r) => setMapRegion(r)}
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

          {myCoord && <Marker coordinate={myCoord} title="You" />}

          {routeCoords.length > 1 && (
            <Polyline coordinates={routeCoords} strokeColor="green" strokeWidth={4} />
          )}
        </MapView>
      </View>

      <View style={{ padding: 16 }}>
        <Text style={{ fontSize: 18, fontWeight: "bold", marginBottom: 4 }}>
          Ride #{rideId}
        </Text>
        <Text>Passenger: {ride.passenger_name ?? "Unknown passenger"}</Text>
        <Text>Pickup: {ride.pickup_address}</Text>
        <Text>Dropoff: {ride.dropoff_address}</Text>
        <Text>Status: {displayStatus()}</Text>
        <Text>Distance: {displayDistance()}</Text>
        <Text>ETA: {displayEta()}</Text>
        <Text>Passengers: {ride.passenger_count ?? 1}</Text>
        <Text>Total fare: {totalFare != null ? `₱${totalFare}` : "₱--"}</Text>
        <View style={{ height: 10 }} />

        {(ride.status === "assigned" || ride.status === "in_progress") && (
          <TouchableOpacity
            onPress={() => setFollowMe((v) => !v)}
            activeOpacity={0.7}
            style={{
              paddingVertical: 10,
              borderRadius: 6,
              alignItems: "center",
              backgroundColor: "#EEEEEE",
              marginBottom: 10,
            }}
          >
            <Text style={{ fontWeight: "600" }}>
              {followMe ? "STOP FOLLOWING ME" : "FOLLOW ME"}
            </Text>
          </TouchableOpacity>
        )}

        <View style={{ marginTop: 12, marginBottom: 30 }}>
          {statusText === "requested" && (
            <TouchableOpacity
              onPress={acceptRide}
              activeOpacity={0.7}
              style={{
                paddingVertical: 12,
                borderRadius: 4,
                alignItems: "center",
                backgroundColor: "#2E7D32",
                marginBottom: 8,
              }}
            >
              <Text style={{ color: "white", fontWeight: "bold", fontSize: 16 }}>
                ACCEPT RIDE
              </Text>
            </TouchableOpacity>
          )}

          {statusText === "assigned" && (
            <TouchableOpacity
              onPress={startRide}
              activeOpacity={0.7}
              style={{
                paddingVertical: 12,
                borderRadius: 4,
                alignItems: "center",
                backgroundColor: "#2E7D32",
                marginBottom: 8,
              }}
            >
              <Text style={{ color: "white", fontWeight: "bold", fontSize: 16 }}>
                START RIDE
              </Text>
            </TouchableOpacity>
          )}

          {statusText === "in_progress" && (
            <TouchableOpacity
              onPress={completeRide}
              activeOpacity={0.7}
              style={{
                paddingVertical: 12,
                borderRadius: 4,
                alignItems: "center",
                backgroundColor: "#2E7D32",
              }}
            >
              <Text style={{ color: "white", fontWeight: "bold", fontSize: 16 }}>
                COMPLETE RIDE
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {statusText === "requested" && (
          <View style={{ marginBottom: 40 }}>
            <TouchableOpacity
              onPress={onBack}
              activeOpacity={0.7}
              style={{
                paddingVertical: 12,
                borderRadius: 4,
                alignItems: "center",
                backgroundColor: "#1976D2",
              }}
            >
              <Text style={{ color: "white", fontWeight: "bold", fontSize: 16 }}>
                Back to Home
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}
