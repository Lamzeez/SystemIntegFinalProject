// src/screens/RideScreen.tsx (PASSENGER)
import React, { useEffect, useState, useRef } from "react";
import { View, Text, TouchableOpacity, Alert } from "react-native";
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
  estimated_duration_min?: number | string;
  distance_km?: number | string;
  estimated_fare?: number;
  fare?: number;
  passenger_name?: string;
  driver_name?: string;
  driver_id?: number | null;
  surge_multiplier?: number;
  passenger_count?: number;
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

  const [driverCoord, setDriverCoord] = useState<Coord | null>(null);

  // ✅ Start following only if already accepted (assigned/in_progress)
  const [followDriver, setFollowDriver] = useState<boolean>(() => {
    const s = initialRide?.status || "requested";
    return s === "assigned" || s === "in_progress";
  });

  const mapRef = useRef<MapView | null>(null);
  const acceptedShownRef = useRef(false);
  const lastCameraMoveAtRef = useRef(0);

  useEffect(() => {
    if (initialRide) return;

    const load = async () => {
      try {
        const res = await api.get("/passenger/rides/current");
        if (res.data.ride) {
          setRide(res.data.ride);
          setStatusText(res.data.ride.status);

          // ✅ If the loaded ride is already accepted, allow follow button & auto-follow
          const s = res.data.ride.status;
          if (s === "assigned" || s === "in_progress") {
            setFollowDriver(true);
          } else {
            setFollowDriver(false);
          }
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

      // ✅ When accepted, show alert once
      if (payload.status === "assigned" && !acceptedShownRef.current) {
        acceptedShownRef.current = true;
        const driverName = payload.driver_name ?? ride?.driver_name;

        Alert.alert(
          "Ride accepted",
          driverName
            ? `Your ride has been accepted by ${driverName}.`
            : "Your ride has been accepted by a driver.",
          [{ text: "OK" }]
        );
      }

      setRide((prev: any) => ({
        ...prev,
        status: payload.status ?? prev?.status,
        fare: payload.fare ?? prev?.fare,
        distance_km: payload.distanceKm ?? prev?.distance_km,
        driver_name: payload.driver_name ?? prev?.driver_name,
        driver_id: payload.driverId ?? payload.driver_id ?? prev?.driver_id,
        estimated_duration_min:
          payload.estimated_duration_min ?? prev?.estimated_duration_min,
        surge_multiplier: payload.surge_multiplier ?? prev?.surge_multiplier,
        passenger_count: payload.passenger_count ?? prev?.passenger_count,
      }));

      if (payload.status) setStatusText(payload.status);

      // ✅ Control follow state based on ride status changes
      if (payload.status === "assigned" || payload.status === "in_progress") {
        setFollowDriver(true); // enable by default once accepted
      }
      if (
        payload.status === "requested" ||
        payload.status === "cancelled" ||
        payload.status === "completed"
      ) {
        setFollowDriver(false);
      }

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
  }, [rideId, onEndRide, ride?.fare, ride?.driver_name]);

  useEffect(() => {
    if (!ride) return;

    const lat1 = Number(ride.pickup_lat);
    const lng1 = Number(ride.pickup_lng);
    const lat2 = Number(ride.dropoff_lat);
    const lng2 = Number(ride.dropoff_lng);

    if (!isFinite(lat1) || !isFinite(lng1) || !isFinite(lat2) || !isFinite(lng2))
      return;

    const fetchRoute = async () => {
      try {
        const url = `http://router.project-osrm.org/route/v1/driving/${lng1},${lat1};${lng2},${lat2}?overview=full&geometries=geojson`;
        const res = await fetch(url);
        const data = await res.json();

        if (data.code !== "Ok" || !data.routes || !data.routes.length) return;

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
    if (!ride?.driver_id) return;

    const driverId = Number(ride.driver_id);
    if (!Number.isFinite(driverId)) return;

    let mounted = true;

    const loadInitial = async () => {
      try {
        const res = await api.get(`/drivers/${driverId}/location`);
        if (!mounted) return;
        if (res.data?.lat != null && res.data?.lng != null) {
          setDriverCoord({
            latitude: Number(res.data.lat),
            longitude: Number(res.data.lng),
          });
        }
      } catch (e) {
        console.log("Driver location endpoint not available yet", e);
      }
    };

    loadInitial();

    const socket = getSocket();
    const handleDriverLoc = (payload: any) => {
      if (payload?.driverId !== driverId) return;
      const lat = Number(payload.lat);
      const lng = Number(payload.lng);
      if (!isFinite(lat) || !isFinite(lng)) return;
      setDriverCoord({ latitude: lat, longitude: lng });
    };

    socket.on("driver:location:update", handleDriverLoc);

    return () => {
      mounted = false;
      socket.off("driver:location:update", handleDriverLoc);
    };
  }, [ride?.driver_id]);

  useEffect(() => {
    if (!followDriver) return;
    if (!driverCoord) return;

    const now = Date.now();
    if (now - lastCameraMoveAtRef.current < 900) return;
    lastCameraMoveAtRef.current = now;

    mapRef.current?.animateToRegion(
      {
        latitude: driverCoord.latitude,
        longitude: driverCoord.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      },
      250
    );
  }, [driverCoord, followDriver]);

  const cancelRide = async () => {
    try {
      await api.post(`/rides/${rideId}/cancel`);
    } catch (e) {
      console.log("Cancel failed", e);
      Alert.alert("Error", "Failed to cancel ride.");
    }
  };

  if (!ride) return <Text style={{ padding: 20 }}>Loading ride...</Text>;

  const displayDistance = () => {
    if (ride.distance_km != null) return `${Number(ride.distance_km).toFixed(1)} km`;
    if (ride.estimated_distance_km != null)
      return `${Number(ride.estimated_distance_km).toFixed(1)} km`;
    return "—";
  };

  const displayFare = () => {
    if (ride.fare != null) return `₱${ride.fare}`;
    if (ride.estimated_fare != null) return `₱${ride.estimated_fare}`;
    return "—";
  };

  const displayEta = () => {
    const v = ride.estimated_duration_min;
    if (v == null) return "—";
    const n = Number(v);
    if (!isFinite(n)) return "—";
    return `${Math.round(n)} min`;
  };

  const pickup = {
    latitude: Number(ride.pickup_lat),
    longitude: Number(ride.pickup_lng),
  };
  const dropoff = {
    latitude: Number(ride.dropoff_lat),
    longitude: Number(ride.dropoff_lng),
  };

  // ✅ Only show follow button AFTER driver accepts
  const canShowFollowButton =
    !!ride.driver_id && (ride.status === "assigned" || ride.status === "in_progress");

  return (
    <View style={{ flex: 1 }}>
      <View style={{ padding: 14, marginTop: 20 }}>
        <Text style={{ fontSize: 18, fontWeight: "700" }}>
          Ride Status: {statusText}
        </Text>

        <Text>Distance: {displayDistance()}</Text>
        <Text>ETA: {displayEta()}</Text>
        {ride.passenger_count != null && <Text>Passengers: {ride.passenger_count}</Text>}
        <Text>Fare: {displayFare()}</Text>

        {ride.surge_multiplier != null && Number(ride.surge_multiplier) > 1 && (
          <Text style={{ color: "#B71C1C", fontWeight: "600" }}>
            Surge x{Number(ride.surge_multiplier).toFixed(1)}
          </Text>
        )}

        <View style={{ marginTop: 10, flexDirection: "row", gap: 10 }}>
          {canShowFollowButton && (
            <TouchableOpacity
              onPress={() => setFollowDriver((v) => !v)}
              style={{
                paddingVertical: 10,
                paddingHorizontal: 12,
                backgroundColor: followDriver ? "#001F54" : "#e6e6e6",
                borderRadius: 8,
              }}
            >
              <Text style={{ color: followDriver ? "white" : "#333" }}>
                {followDriver ? "Following driver" : "Follow driver"}
              </Text>
            </TouchableOpacity>
          )}

          {(ride.status === "requested" || ride.status === "assigned") && (
            <TouchableOpacity
              onPress={cancelRide}
              style={{
                paddingVertical: 10,
                paddingHorizontal: 12,
                backgroundColor: "#b00020",
                borderRadius: 8,
              }}
            >
              <Text style={{ color: "white", fontWeight: "600" }}>
                Cancel ride
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <MapView
        ref={(r) => {
          mapRef.current = r;
        }}
        style={{ flex: 1 }}
        initialRegion={{
          latitude: pickup.latitude || 6.95,
          longitude: pickup.longitude || 126.2333,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
        region={mapRegion ?? undefined}
      >
        <Marker coordinate={pickup} title="Pickup" pinColor="green" />
        <Marker coordinate={dropoff} title="Dropoff" pinColor="red" />

        {routeCoords.length > 0 && (
          <Polyline coordinates={routeCoords} strokeWidth={4} strokeColor="#001F54" />
        )}

        {driverCoord && <Marker coordinate={driverCoord} title="Driver" pinColor="blue" />}
      </MapView>
    </View>
  );
}
