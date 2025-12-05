import React, { useEffect, useState } from "react";
import { api } from "../api";
import { getSocket } from "../socket";


interface Ride {
  id: number;
  status?: string | null;
  fare?: number | null;
  created_at: string;
  passenger_name?: string | null;
  driver_name?: string | null;
}

interface DashboardData {
  totalDrivers?: number;
  activeRides?: number;
  todaysRevenue?: number;
  totalRides?: number;
  recentRides?: Ride[];
}

export default function HomePage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setErrorMsg(null);
        const res = await api.get<DashboardData>("/admin/dashboard");
        setData(res.data);
      } catch (e) {
        console.error("Failed to load dashboard", e);
        setErrorMsg("Could not load dashboard data.");
        setData(null);
      } finally {
        setLoading(false);
      }
    };

    load();

    // Realtime: refresh when rides change
    const socket = getSocket();
    const handler = () => {
      load();
    };
    socket.on("ride:status:update", handler);

    return () => {
      socket.off("ride:status:update", handler);
    };
  }, []);


  if (loading) return <p>Loading dashboard...</p>;
  if (errorMsg) return <p>{errorMsg}</p>;
  if (!data) return <p>No data available.</p>;

  // Helpers with safe defaults
  const money = (n?: number | null) =>
    new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
    }).format(Number(n || 0));

  const totalDrivers = data.totalDrivers ?? 0;
  const activeRides = data.activeRides ?? 0;
  const todaysRevenue = data.todaysRevenue ?? 0;
  const totalRides = data.totalRides ?? 0;
  const recentRides: Ride[] = Array.isArray(data.recentRides)
    ? data.recentRides
    : [];

  return (
    <div className="page">
      {/* Top metric cards */}
      <div className="card-grid">
        <MetricCard title="Total Driver" value={totalDrivers} />
        <MetricCard title="Active Rides" value={activeRides} />
        <MetricCard title="Today's Revenue" value={money(todaysRevenue)} />
        <MetricCard title="Total Rides" value={totalRides} />
      </div>

      <div className="grid-2">
        {/* Recent rides */}
        <section className="panel">
          <h2 className="panel-title">Recent Rides</h2>
          <div className="ride-list">
            {recentRides.length === 0 && (
              <p>No rides yet. They will show up here.</p>
            )}

            {recentRides.map((r) => {
              const statusLabel = r.status || "Unknown";
              const statusClass =
                "ride-status" +
                (r.status ? " ride-status-" + r.status.toLowerCase() : "");

              return (
                <div key={r.id} className="ride-card">
                  <div className="ride-row">
                    <span className="ride-id">R-{r.id}</span>
                    <span className="ride-fare">{money(r.fare)}</span>
                    <span className={statusClass}>{statusLabel}</span>
                  </div>
                  <div className="ride-row small">
                    <div>
                      <div className="label">Passenger</div>
                      <div>{r.passenger_name || "—"}</div>
                    </div>
                    <div>
                      <div className="label">Driver</div>
                      <div>{r.driver_name || "—"}</div>
                    </div>
                    <div className="ride-time">
                      {new Date(r.created_at).toLocaleString()}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Driver management quick actions */}
        <section className="panel">
          <h2 className="panel-title">Drivers management</h2>
          <div className="driver-actions">
            <button className="btn btn-primary">Add new Driver</button>
            <button className="btn">View all locations</button>
            <button className="btn">Analytics and reports</button>
            <button className="btn">Manage vehicle</button>
          </div>
        </section>
      </div>
    </div>
  );
}

function MetricCard({ title, value }: { title: string; value: number | string }) {
  return (
    <div className="metric-card">
      <div className="metric-title">{title}</div>
      <div className="metric-value">{value}</div>
    </div>
  );
}
