import * as TaskManager from "expo-task-manager";
import * as Location from "expo-location";
import { getSocket } from "../socket";

// NOTE:
// - This file is DRIVER-APP only.
// - Make sure you have "expo-location" and "expo-task-manager" installed.
// - Android: background updates require a foreground service notification.

const TASK_NAME = "BAO_RIDE_BG_LOCATION";

let currentDriverId: number | null = null;

TaskManager.defineTask(TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.log("BG Location task error:", error);
    return;
  }

  if (!data) return;
  if (currentDriverId == null) return;

  const { locations } = data as any;
  const loc = locations?.[0];
  const lat = Number(loc?.coords?.latitude);
  const lng = Number(loc?.coords?.longitude);
  if (!isFinite(lat) || !isFinite(lng)) return;

  try {
    const socket = getSocket();
    socket.emit("driver:location", { driverId: currentDriverId, lat, lng });
  } catch (e) {
    console.log("BG location emit error", e);
  }
});

export async function ensureLocationPermissions(): Promise<boolean> {
  try {
    const fg = await Location.requestForegroundPermissionsAsync();
    if (!fg.granted) return false;

    // Ask background only if you actually start background updates.
    const bg = await Location.requestBackgroundPermissionsAsync();
    if (!bg.granted) {
      // You can still do foreground tracking.
      return true;
    }
    return true;
  } catch (e) {
    console.log("Permission error", e);
    return false;
  }
}

export async function startBackgroundLocation(driverId: number) {
  currentDriverId = driverId;

  const started = await Location.hasStartedLocationUpdatesAsync(TASK_NAME);
  if (started) return;

  await Location.startLocationUpdatesAsync(TASK_NAME, {
    accuracy: Location.Accuracy.Highest,
    distanceInterval: 5, // meters
    timeInterval: 3000, // ms
    pausesUpdatesAutomatically: false,
    // Android foreground service notification
    foregroundService: {
      notificationTitle: "Bao-Ride",
      notificationBody: "Sharing your location for the active ride.",
    },
    showsBackgroundLocationIndicator: true, // iOS
  });
}

export async function stopBackgroundLocation() {
  currentDriverId = null;

  const started = await Location.hasStartedLocationUpdatesAsync(TASK_NAME);
  if (!started) return;

  await Location.stopLocationUpdatesAsync(TASK_NAME);
}

export async function startForegroundWatch(
  driverId: number,
  onCoord: (lat: number, lng: number) => void
) {
  currentDriverId = driverId;

  const perm = await Location.requestForegroundPermissionsAsync();
  if (!perm.granted) return null;

  const sub = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.Highest,
      distanceInterval: 5,
      timeInterval: 2500,
    },
    (loc) => {
      const lat = Number(loc.coords.latitude);
      const lng = Number(loc.coords.longitude);
      if (!isFinite(lat) || !isFinite(lng)) return;
      onCoord(lat, lng);

      // Emit to backend for passenger live tracking
      try {
        const socket = getSocket();
        socket.emit("driver:location", { driverId, lat, lng });
      } catch (e) {
        console.log("FG location emit error", e);
      }
    }
  );

  return sub;
}
