import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Button,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import MapView, {
  Marker,
  MapPressEvent,
  Polygon,
  PoiClickEvent,
  Region,
} from "react-native-maps";
import { useAuth } from "../AuthContext";
import { api } from "../api";
import { getSocket } from "../socket";

type LatLng = { latitude: number; longitude: number };

export default function HomeScreen({
  onRideCreated,
  onActiveRideDetected,
}: {
  onRideCreated: (ride: any) => void;
  onActiveRideDetected: (ride: any) => void;
}) {
  const { user, logout } = useAuth();

  const [selection, setSelection] = useState<"pickup" | "dropoff">("pickup");
  const [pickupCoord, setPickupCoord] = useState<LatLng | null>(null);
  const [dropoffCoord, setDropoffCoord] = useState<LatLng | null>(null);
  const [pickupLabel, setPickupLabel] = useState<string | null>(null);
  const [dropoffLabel, setDropoffLabel] = useState<string | null>(null);

  const [passengerCount, setPassengerCount] = useState<number>(1);
  const MAX_PAX = 5;

  const MATI_DEFAULT_REGION: Region = {
    latitude: 6.95,
    longitude: 126.2333,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  };

  // ✅ Bao-Ride service area (RECTANGLE / BOUNDS)
  // Source bbox for Mati area: (south 6.13327, west 126.09071, north 7.08391, east 126.49175)
  const MATI_SERVICE_BOUNDS = {
    minLat: 6.13327,
    maxLat: 7.08391,
    minLng: 126.09071,
    maxLng: 126.49175,
  };

  const isWithinMatiServiceArea = (p: LatLng) =>
    p.latitude >= MATI_SERVICE_BOUNDS.minLat &&
    p.latitude <= MATI_SERVICE_BOUNDS.maxLat &&
    p.longitude >= MATI_SERVICE_BOUNDS.minLng &&
    p.longitude <= MATI_SERVICE_BOUNDS.maxLng;

  // Optional: draw the rectangle on the map
  const MATI_SERVICE_RECT: LatLng[] = [
    { latitude: MATI_SERVICE_BOUNDS.minLat, longitude: MATI_SERVICE_BOUNDS.minLng }, // SW
    { latitude: MATI_SERVICE_BOUNDS.maxLat, longitude: MATI_SERVICE_BOUNDS.minLng }, // NW
    { latitude: MATI_SERVICE_BOUNDS.maxLat, longitude: MATI_SERVICE_BOUNDS.maxLng }, // NE
    { latitude: MATI_SERVICE_BOUNDS.minLat, longitude: MATI_SERVICE_BOUNDS.maxLng }, // SE
  ];

  // Check if passenger already has an active ride
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

  // Optional: listen for status updates
  useEffect(() => {
    const socket = getSocket();

    const handleStatusUpdate = (payload: any) => {
      if (payload.passengerId === user?.id) {
        console.log("ride:status:update (passenger)", payload);
      }
    };

    socket.on("ride:status:update", handleStatusUpdate);

    return () => {
      socket.off("ride:status:update", handleStatusUpdate);
    };
  }, [user?.id]);

  const handleMapPress = (e: MapPressEvent) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    const chosen = { latitude, longitude };

    if (!isWithinMatiServiceArea(chosen)) {
      Alert.alert(
        "Out of service area",
        "Bao-Ride is only available inside the Mati service rectangle."
      );
      return;
    }

    if (selection === "pickup") {
      setPickupCoord(chosen);
      setPickupLabel(null);
    } else {
      setDropoffCoord(chosen);
      setDropoffLabel(null);
    }
  };

  const handlePoiClick = (e: PoiClickEvent) => {
    const { coordinate, name } = e.nativeEvent;
    const { latitude, longitude } = coordinate;
    const chosen = { latitude, longitude };

    if (!isWithinMatiServiceArea(chosen)) {
      Alert.alert(
        "Out of service area",
        "Bao-Ride is only available inside the Mati service rectangle."
      );
      return;
    }

    if (selection === "pickup") {
      setPickupCoord(chosen);
      setPickupLabel(name || "Pinned pickup");
    } else {
      setDropoffCoord(chosen);
      setDropoffLabel(name || "Pinned dropoff");
    }
  };

  const canRequest = !!(pickupCoord && dropoffCoord);

  useEffect(() => {
    if (!pickupCoord || !dropoffCoord) setPassengerCount(1);
  }, [pickupCoord, dropoffCoord]);

  const incrementPassenger = () => {
    setPassengerCount((prev) => Math.min(MAX_PAX, prev + 1));
  };

  const decrementPassenger = () => {
    setPassengerCount((prev) => Math.max(1, prev - 1));
  };

  const handleRequestRidePress = async () => {
    if (!pickupCoord || !dropoffCoord) {
      Alert.alert(
        "Incomplete locations",
        "Please set pickup and dropoff locations first."
      );
      return;
    }

    if (
      !isWithinMatiServiceArea(pickupCoord) ||
      !isWithinMatiServiceArea(dropoffCoord)
    ) {
      Alert.alert(
        "Out of service area",
        "Pickup and dropoff must both be inside the Mati service rectangle."
      );
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
        passenger_count: passengerCount,
      });

      const ride = res.data.ride;

      if (ride?.id) {
        Alert.alert(
          "Ride requested",
          "Your ride request has been sent. Please wait for a driver.",
          [
            {
              text: "OK",
              onPress: () => {
                onRideCreated(ride); // navigate AFTER the success modal
              },
            },
          ]
        );
      } else {
        Alert.alert("Error", "Ride requested, but no ride ID returned.");
      }
    } catch (err: any) {
      console.log("Request ride error", err?.response?.data || err);
      Alert.alert("Error", "Failed to request ride.");
    }
  };

  const pickupText = pickupLabel
    ? pickupLabel
    : pickupCoord
    ? "Pinned pickup"
    : "Not set";

  const dropoffText = dropoffLabel
    ? dropoffLabel
    : dropoffCoord
    ? "Pinned dropoff"
    : "Not set";

  const handleLogoutPress = () => {
    Alert.alert("Logout", "Are you sure you want to logout?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: () => {
          Alert.alert("Logout successful", "You have been logged out.", [
            {
              text: "OK",
              onPress: () => {
                logout(); // logout AFTER the success modal
              },
            },
          ]);
        },
      },
    ]);
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={{ padding: 20, marginTop: 20 }}>
        <Text style={styles.helloText}>Hello, {user?.name}</Text>

        <Text style={{ marginTop: 8, marginBottom: 8 }}>
          Select which location to set on the map:
        </Text>

        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[
              styles.toggleButton,
              selection === "pickup" && styles.toggleButtonActive,
            ]}
            onPress={() => setSelection("pickup")}
          >
            <Text
              style={[
                styles.toggleText,
                selection === "pickup" && styles.toggleTextActive,
              ]}
            >
              SET PICKUP
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.toggleButton,
              selection === "dropoff" && styles.toggleButtonActive,
            ]}
            onPress={() => setSelection("dropoff")}
          >
            <Text
              style={[
                styles.toggleText,
                selection === "dropoff" && styles.toggleTextActive,
              ]}
            >
              SET DROPOFF
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={{ marginTop: 10 }}>Pickup: {pickupText}</Text>
        <Text>Dropoff: {dropoffText}</Text>

        {canRequest && (
          <View style={styles.paxRow}>
            <Text style={styles.paxLabel}>Passengers</Text>

            <View style={styles.paxControls}>
              <TouchableOpacity
                onPress={decrementPassenger}
                activeOpacity={0.7}
                accessibilityLabel="Decrease passenger count"
              >
                <Ionicons name="remove-circle" size={32} color="#333" />
              </TouchableOpacity>

              <Text style={styles.paxCountText}>{passengerCount}</Text>

              <TouchableOpacity
                onPress={incrementPassenger}
                activeOpacity={0.7}
                accessibilityLabel="Increase passenger count"
              >
                <Ionicons name="add-circle" size={32} color="#333" />
              </TouchableOpacity>
            </View>

            <Text style={styles.paxHint}>(max {MAX_PAX})</Text>
          </View>
        )}

        <View style={{ marginTop: 16 }}>
          <TouchableOpacity
            onPress={handleRequestRidePress}
            activeOpacity={0.7}
            style={styles.requestButton}
          >
            <Text style={styles.requestButtonText}>REQUEST RIDE</Text>
          </TouchableOpacity>
        </View>

        <View style={{ marginTop: 16 }}>
          <TouchableOpacity
            onPress={handleLogoutPress}
            activeOpacity={0.7}
            style={{
              paddingVertical: 12,
              borderRadius: 4,
              alignItems: "center",
              backgroundColor: "red",
            }}
          >
            <Text style={styles.requestButtonText}>LOGOUT</Text>
          </TouchableOpacity>
        </View>
      </View>

      <MapView
        style={{ flex: 1 }}
        initialRegion={MATI_DEFAULT_REGION}
        onPress={handleMapPress}
        onPoiClick={handlePoiClick}
      >
        <Polygon
          coordinates={MATI_SERVICE_RECT}
          strokeWidth={2}
          strokeColor="rgba(0, 102, 255, 0.8)"
          fillColor="rgba(0, 102, 255, 0.15)"
        />

        {!!pickupCoord && (
          <Marker
            coordinate={pickupCoord}
            title="Pickup"
            description={pickupLabel || "Pinned pickup"}
            pinColor="green"
          />
        )}

        {!!dropoffCoord && (
          <Marker
            coordinate={dropoffCoord}
            title="Dropoff"
            description={dropoffLabel || "Pinned dropoff"}
            pinColor="red"
          />
        )}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  helloText: { fontSize: 18, fontWeight: "600" },

  toggleRow: {
    flexDirection: "row",
    gap: 10,
  },

  toggleButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 4,
    backgroundColor: "#e6e6e6",
    alignItems: "center",
  },

  toggleButtonActive: {
    backgroundColor: "#001F54",
  },

  toggleText: {
    color: "#333",
    fontWeight: "600",
  },

  toggleTextActive: {
    color: "white",
  },

  requestButton: {
    paddingVertical: 12,
    borderRadius: 4,
    alignItems: "center",
    backgroundColor: "#001F54",
  },

  requestButtonText: {
    color: "white",
    fontWeight: "700",
  },

  paxRow: {
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e5e5",
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  paxLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
  paxControls: {
    flexDirection: "row",
    alignItems: "center",
  },
  paxCountText: {
    fontSize: 18,
    fontWeight: "700",
    marginHorizontal: 10,
    minWidth: 22,
    textAlign: "center",
  },
  paxHint: {
    fontSize: 12,
    color: "#666",
  },
});
