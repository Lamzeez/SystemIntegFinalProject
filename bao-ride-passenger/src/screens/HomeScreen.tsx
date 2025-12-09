import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Button,
} from "react-native";
import MapView, {
  Marker,
  MapPressEvent,
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

  const MATI_DEFAULT_REGION: Region = {
    latitude: 6.95,
    longitude: 126.2333,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  };

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

    if (selection === "pickup") {
      setPickupCoord({ latitude, longitude });
      // Clear any previous POI name so the label becomes "Pinned pickup"
      setPickupLabel(null);
    } else {
      setDropoffCoord({ latitude, longitude });
      // Clear any previous POI name so the label becomes "Pinned dropoff"
      setDropoffLabel(null);
    }
  };

  const handlePoiClick = (e: PoiClickEvent) => {
    const { coordinate, name } = e.nativeEvent;
    const { latitude, longitude } = coordinate;

    if (selection === "pickup") {
      setPickupCoord({ latitude, longitude });
      setPickupLabel(name || "Pinned pickup");
    } else {
      setDropoffCoord({ latitude, longitude });
      setDropoffLabel(name || "Pinned dropoff");
    }
  };


  const canRequest = !!(pickupCoord && dropoffCoord);

  const handleRequestRidePress = async () => {
    if (!pickupCoord || !dropoffCoord) {
      Alert.alert(
        "Incomplete locations",
        "Please set pickup and dropoff locations first."
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
      });

      const ride = res.data.ride;
      if (ride?.id) {
        onRideCreated(ride);
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

  return (
    <View style={{ flex: 1}}>
      <View style={{ padding: 20, marginTop: 20}}>
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

        <View style={{ marginTop: 16 }}>
          <TouchableOpacity
            onPress={handleRequestRidePress}
            disabled={!canRequest}
            style={[
              styles.requestButton,
              { backgroundColor: canRequest ? "#2E7D32" : "#BDBDBD" },
            ]}
          >
            <Text style={styles.requestButtonText}>REQUEST RIDE</Text>
          </TouchableOpacity>
        </View>

        <View style={{ marginTop: 16 }}>
          <Button title="LOGOUT" onPress={logout} color="red" />
        </View>
      </View>

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

const styles = StyleSheet.create({
  helloText: {
    fontSize: 24,
    fontWeight: "bold",
  },
  toggleRow: {
    flexDirection: "row",
    marginTop: 8,
    marginBottom: 4,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#1976D2",
    backgroundColor: "white",
    alignItems: "center",
    justifyContent: "center",
  },
  toggleButtonActive: {
    backgroundColor: "#1976D2",
  },
  toggleText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1976D2",
  },
  toggleTextActive: {
    color: "white",
  },
  requestButton: {
    paddingVertical: 12,
    borderRadius: 4,
    alignItems: "center",
  },
  requestButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 16,
  },
});
