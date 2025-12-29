import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  FlatList,
  RefreshControl,
  Platform,
} from "react-native";
import { useAuth } from "../AuthContext";
import { api } from "../api";
import { getSocket } from "../socket";
import * as Notifications from "expo-notifications";

type Ride = {
  id: number;
  pickup_address?: string;
  dropoff_address?: string;
  passenger_name?: string;
  passenger_phone?: string;
  passenger_count?: number;
  estimated_distance_km?: number | string;
  estimated_duration_min?: number | string;
  estimated_fare?: number;
status?: string;
  fare?: number;
  final_fare?: number;
  created_at?: string;
  completed_at?: string;
  [key: string]: any;
};

type EarningsSummary = {
  today: number;
  week: number;
  total: number;
  completed_count: number;
};

type Props = {
  onOpenRide: (ride: Ride) => void;

  /**
   * NEW: used to redirect to a dedicated history screen.
   * If you don’t pass this from your parent navigator/App.tsx, the button will show an alert.
   */
  onOpenHistory?: () => void;
};

export default function HomeScreen({ onOpenRide, onOpenHistory }: Props) {
  const { user, logout } = useAuth();

  const [status, setStatus] = useState<"online" | "offline" | "on_trip">(
    "offline"
  );
  const [availableRides, setAvailableRides] = useState<Ride[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const [earnings, setEarnings] = useState<EarningsSummary | null>(null);
  const [recentCompleted, setRecentCompleted] = useState<Ride[]>([]);

  const loadAvailable = useCallback(async () => {
    try {
      const res = await api.get("/driver/rides/available");
      setAvailableRides(res.data?.rides || []);
    } catch (e) {
      console.log("Failed to load available rides", e);
    }
  }, []);

  const loadProfile = useCallback(async () => {
    try {
      const res = await api.get("/driver/profile");
      if (res.data?.driver?.status) {
        setStatus(res.data.driver.status);
      }
    } catch (e) {
      console.log("Failed to load driver profile", e);
    }
  }, []);

  const loadEarnings = useCallback(async () => {
    try {
      const res = await api.get("/driver/earnings/summary");
      if (res.data) setEarnings(res.data);
    } catch (e) {
      console.log("Earnings summary not available yet", e);
      setEarnings(null);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const res = await api.get("/driver/rides/history?limit=10");
      const data = res.data;
      const list: Ride[] = Array.isArray(data) ? data : data?.rides || [];
      setRecentCompleted(list);
    } catch (e) {
      console.log("Failed to load ride history", e);
      setRecentCompleted([]);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    try {
      // IMPORTANT:
      // Only show/refresh available rides when the driver is ONLINE.
      // When OFFLINE (or on_trip), the list must stay empty even if the user refreshes.
      const profileRes = await api.get("/driver/profile");
      const newStatus = (profileRes.data?.driver?.status as
        | "online"
        | "offline"
        | "on_trip"
        | undefined) ?? "offline";

      setStatus(newStatus);

      // Load earnings + history in parallel (these are safe to view while offline)
      await Promise.all([loadEarnings(), loadHistory()]);

      if (newStatus === "online") {
        await loadAvailable();
      } else {
        setAvailableRides([]);
      }
    } finally {
      setRefreshing(false);
    }
  }, [loadAvailable, loadEarnings, loadHistory]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const notifyIncomingRide = useCallback(async (ride: Ride) => {
    try {
      // Expo SDK 54 typing can differ; keep runtime-correct behavior via `any`.
      const perm: any = await Notifications.getPermissionsAsync();

      const currentStatus: string | undefined =
        perm?.status ?? (perm?.granted ? "granted" : undefined);

      if (currentStatus !== "granted") {
        const req: any = await Notifications.requestPermissionsAsync();
        const reqStatus: string | undefined =
          req?.status ?? (req?.granted ? "granted" : undefined);

        if (reqStatus !== "granted") return;
      }

      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("rides", {
          name: "Ride requests",
          importance: Notifications.AndroidImportance.MAX,
          sound: "default",
        });
      }

      await Notifications.scheduleNotificationAsync({
        content: {
          title: "New ride request",
          body: `Pickup: ${ride.pickup_address ?? "—"} → Dropoff: ${
            ride.dropoff_address ?? "—"
          }`,
          sound: "default",
        },
        trigger: null,
      });
    } catch (e) {
      console.log("Notification error", e);
    }
  }, []);

  useEffect(() => {
    const socket = getSocket();

    const handleIncoming = (ride: Ride) => {
      console.log("Ride incoming:", ride);

      // Safety guard: only show incoming rides when the driver is ONLINE.
      if (status !== "online") {
        return;
      }

      setAvailableRides((prev) => {
        if (prev.some((r) => r.id === ride.id)) return prev;
        return [ride, ...prev]; // ✅ FIXED
      });

      notifyIncomingRide(ride);
    };

    const handleStatusUpdate = (payload: any) => {
      if (payload?.rideId == null) return;

      // Remove ride from available list when it's no longer requested
      if (payload.status && payload.status !== "requested") {
        setAvailableRides((prev) => prev.filter((r) => r.id !== payload.rideId));
      }

      // If completed, refresh earnings + history
      if (payload.status === "completed") {
        loadEarnings();
        loadHistory();
      }
    };

    socket.on("ride:incoming", handleIncoming);
    socket.on("ride:status:update", handleStatusUpdate);

    return () => {
      socket.off("ride:incoming", handleIncoming);
      socket.off("ride:status:update", handleStatusUpdate);
    };
  }, [notifyIncomingRide, loadEarnings, loadHistory, status]);

  useEffect(() => {
    // Avoid doing notification global init at import-time.
    // Also keeps Expo Go from showing the remote push warning at startup.
    try {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });
    } catch (e) {
      console.log("Notification handler init skipped:", e);
    }
  }, []);


  const updateStatus = async (newStatus: "online" | "offline") => {
    try {
      await api.post("/driver/status", { status: newStatus });
      setStatus(newStatus);

      if (newStatus === "online") await loadAvailable();
      if (newStatus === "offline") setAvailableRides([]);
    } catch (e) {
      console.log("Failed to update driver status", e);
      Alert.alert("Error", "Failed to update status.");
    }
  };

  const handleLogout = () => {
    Alert.alert("Logout", "Are you sure you want to logout?", [
      { text: "Cancel", style: "cancel" },
      { text: "Logout", style: "destructive", onPress: logout },
    ]);
  };

  const earningsText = useMemo(() => {
    if (!earnings) return "Earnings not loaded.";
    return `Today: ₱${earnings.today}   •   Week: ₱${earnings.week}   •   Total: ₱${earnings.total}`;
  }, [earnings]);

  const completedCount =
    earnings?.completed_count ?? (Array.isArray(recentCompleted) ? recentCompleted.length : 0);

  const openHistory = () => {
    if (onOpenHistory) return onOpenHistory();
    Alert.alert(
      "History screen not wired",
      "Please pass onOpenHistory() from your navigator/App.tsx to open the new history screen."
    );
  };

  return (
    <View style={{ flex: 1, padding: 20, marginTop: 20 }}>
      <Text style={{ fontSize: 24, fontWeight: "bold" }}>Hello, {user?.name}</Text>
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

      {/* Earnings summary (same UI style, just improved functionality) */}
      <View
        style={{
          marginTop: 14,
          padding: 12,
          borderWidth: 1,
          borderColor: "#ddd",
          borderRadius: 8,
          backgroundColor: "white",
        }}
      >
        <Text style={{ fontWeight: "bold", marginBottom: 6 }}>Earnings</Text>
        <Text>{earningsText}</Text>

        <Text style={{ marginTop: 6, color: "#666" }}>
          Completed rides: {completedCount}
        </Text>

        <View style={{ height: 10 }} />

        {/* ✅ Replaces expand/collapse with redirect */}
        <TouchableOpacity
          onPress={openHistory}
          activeOpacity={0.7}
          style={{
            paddingVertical: 8,
            borderRadius: 6,
            alignItems: "center",
            backgroundColor: "#EEEEEE",
          }}
        >
          <Text style={{ fontWeight: "600" }}>VIEW RIDE HISTORY</Text>
        </TouchableOpacity>
      </View>

      {/* Available rides list */}
      <View style={{ marginTop: 20, flex: 1 }}>
        <Text style={{ fontWeight: "bold", marginBottom: 8 }}>Available rides:</Text>

        <FlatList
          data={availableRides}
          keyExtractor={(item) => item.id.toString()}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 20 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshAll} />}
          ListEmptyComponent={
            <Text style={{ textAlign: "center", marginTop: 20 }}>
              No rides available yet.
            </Text>
          }
          renderItem={({ item: ride }) => (
            <View
              style={{
                borderWidth: 1,
                borderColor: "#ccc",
                padding: 12,
                marginBottom: 10,
                borderRadius: 8,
                backgroundColor: "white",
              }}
            >
              <Text style={{ fontWeight: "bold" }}>Ride #{ride.id}</Text>

              <Text>Passenger: {ride.passenger_name ?? "Unknown passenger"}</Text>
              <Text>Passengers: {ride.passenger_count ?? 1}</Text>


              <Text numberOfLines={1}>Pickup: {ride.pickup_address}</Text>
              <Text numberOfLines={1}>Dropoff: {ride.dropoff_address}</Text>

              {ride.estimated_distance_km != null && (
                <Text>Est. distance: {Number(ride.estimated_distance_km).toFixed(1)} km</Text>
              )}

              {ride.estimated_duration_min != null && (
                <Text>Est. time: {Math.round(Number(ride.estimated_duration_min))} min</Text>
              )}

              {ride.estimated_fare != null && <Text>Est. fare: ₱{ride.estimated_fare}</Text>}
              <View style={{ height: 10 }} />

              <TouchableOpacity
                onPress={() => onOpenRide(ride)}
                activeOpacity={0.7}
                style={{
                  paddingVertical: 10,
                  borderRadius: 6,
                  alignItems: "center",
                  backgroundColor: "#1976D2",
                }}
              >
                <Text style={{ color: "white", fontWeight: "bold" }}>OPEN</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      </View>

      <TouchableOpacity
        onPress={handleLogout}
        activeOpacity={0.7}
        style={{
          paddingVertical: 10,
          borderRadius: 4,
          alignItems: "center",
          backgroundColor: "#D32F2F",
          marginTop: 10,
        }}
      >
        <Text style={{ color: "white", fontWeight: "bold" }}>LOGOUT</Text>
      </TouchableOpacity>
    </View>
  );
}
