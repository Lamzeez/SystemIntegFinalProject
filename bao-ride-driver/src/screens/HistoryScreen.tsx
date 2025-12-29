import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  RefreshControl,
} from "react-native";
import { api } from "../api";

type RideHistoryItem = {
  id: number;
  pickup_address?: string;
  dropoff_address?: string;
  passenger_name?: string;
  status?: string;
  fare?: number;
  final_fare?: number;
  estimated_fare?: number;
  created_at?: string;
  completed_at?: string;
  [key: string]: any;
};

type Props = {
  onBack: () => void;
};

export default function HistoryScreen({ onBack }: Props) {
  const [loading, setLoading] = useState(false);
  const [rides, setRides] = useState<RideHistoryItem[]>([]);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      // IMPORTANT: This endpoint must be driver-scoped by auth on the backend.
      const res = await api.get("/driver/rides/history?limit=50");
      const data = res.data;
      const list: RideHistoryItem[] = Array.isArray(data) ? data : data?.rides || [];
      setRides(list);
    } catch (e) {
      console.log("Failed to load driver history", e);
      setRides([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const renderItem = ({ item }: { item: RideHistoryItem }) => {
    const fare =
      item.final_fare ?? item.fare ?? item.estimated_fare ?? null;

    const when = item.completed_at ?? item.created_at ?? "";

    return (
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
        <Text style={{ fontWeight: "bold" }}>Ride #{item.id}</Text>

        <Text numberOfLines={1}>
          Passenger: {item.passenger_name ?? "—"}
        </Text>

        <Text numberOfLines={1}>Pickup: {item.pickup_address ?? "—"}</Text>
        <Text numberOfLines={1}>Dropoff: {item.dropoff_address ?? "—"}</Text>

        <Text>Status: {item.status ?? "—"}</Text>

        <Text>
          Fare: {fare != null ? `₱${fare}` : "—"}
        </Text>

        {!!when && <Text style={{ color: "#666" }}>When: {when}</Text>}
      </View>
    );
  };

  const emptyText = useMemo(() => {
    if (loading) return "Loading history...";
    return "No completed rides yet.";
  }, [loading]);

  return (
    <View style={{ flex: 1, padding: 20, marginTop: 20 }}>
      <Text style={{ fontSize: 20, fontWeight: "bold" }}>Ride History</Text>
      <Text style={{ color: "#666", marginTop: 4 }}>
        This list should show only YOUR rides (driver-scoped).
      </Text>

      <View style={{ height: 10 }} />

      <TouchableOpacity
        onPress={onBack}
        activeOpacity={0.7}
        style={{
          paddingVertical: 10,
          borderRadius: 6,
          alignItems: "center",
          backgroundColor: "#EEEEEE",
          marginBottom: 12,
        }}
      >
        <Text style={{ fontWeight: "600" }}>BACK</Text>
      </TouchableOpacity>

      <FlatList
        data={rides}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={loadHistory} />
        }
        ListEmptyComponent={
          <Text style={{ textAlign: "center", marginTop: 20 }}>
            {emptyText}
          </Text>
        }
        contentContainerStyle={{ paddingBottom: 20 }}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}
