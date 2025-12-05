import React, { useEffect, useState } from "react";
import { api } from "../api";
import { getSocket } from "../socket";

type Ride = {
  id: number;
  status: string;
  fare: number | null;
  created_at: string;
  updated_at: string;
  passenger_name: string;
  driver_name: string | null;
};

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "requested", label: "Requested" },
  { value: "assigned", label: "Assigned" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

export default function RidesPage() {
  const [rides, setRides] = useState<Ride[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const money = (n: number | null) =>
    new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
    }).format(Number(n || 0));

  const loadRides = async (status = statusFilter) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await api.get<Ride[]>("/admin/rides", {
        params: { status },
      });
      setRides(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Failed to load rides", err);
      setErrorMsg("Failed to load rides.");
      setRides([]);
    } finally {
      setLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    loadRides("all");
  }, []);

  // Reload when filter changes
  useEffect(() => {
    loadRides(statusFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  // Realtime: listen for ride:status:update from backend
  useEffect(() => {
    const socket = getSocket();

    const handler = (payload: { rideId: number; status: string }) => {
      // Just reload the list when something changes
      console.log("Ride status update received", payload);
      loadRides(statusFilter);
    };

    socket.on("ride:status:update", handler);
    return () => {
      socket.off("ride:status:update", handler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  return (
    <div className="page">
      <section className="panel">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "center",
          }}
        >
          <h2 className="panel-title">Rides</h2>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "#6b7280" }}>Status:</span>
            <select
              className="drivers-input"
              style={{ minWidth: 160 }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {errorMsg && <div className="login-error">{errorMsg}</div>}

        {loading ? (
          <p>Loading rides...</p>
        ) : rides.length === 0 ? (
          <p>No rides found.</p>
        ) : (
          <table className="drivers-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Passenger</th>
                <th>Driver</th>
                <th>Status</th>
                <th>Fare</th>
                <th>Created</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {rides.map((r) => (
                <tr key={r.id}>
                  <td>R-{r.id}</td>
                  <td>{r.passenger_name}</td>
                  <td>{r.driver_name || "—"}</td>
                  <td className="drivers-status">
                    {r.status.replace("_", " ")}
                  </td>
                  <td>{money(r.fare)}</td>
                  <td>
                    {new Date(r.created_at).toLocaleString(undefined, {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </td>
                  <td>
                    {new Date(r.updated_at).toLocaleString(undefined, {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
