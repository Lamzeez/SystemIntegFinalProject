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

  const handleRequestRidePress = async () => {
    if (!pickupCoord || !dropoffCoord) {
      Alert.alert(
        "Incomplete locations",
        "Please set pickup and dropoff locations first."
      );
      return;
    }

    if (!isWithinMatiServiceArea(pickupCoord) || !isWithinMatiServiceArea(dropoffCoord)) {
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
        <Polygon coordinates={MATI_SERVICE_RECT} />
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
