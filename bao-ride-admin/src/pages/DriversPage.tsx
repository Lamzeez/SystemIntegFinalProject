import React, { useEffect, useState } from "react";
import { api } from "../api";
import { getSocket } from "../socket";

type Driver = {
  id: number;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  vehicle_plate?: string | null;
  vehicle_model?: string | null;
  status?: string | null;
};

type FormState = {
  name: string;
  email: string;
  phone: string;
  password: string;
  vehicle_plate: string;
  vehicle_model: string;
  status: string;
};

const emptyForm: FormState = {
  name: "",
  email: "",
  phone: "",
  password: "",
  vehicle_plate: "",
  vehicle_model: "",
  status: "offline",
};

export default function DriversPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Load drivers from backend
  const loadDrivers = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await api.get<Driver[]>("/admin/drivers");
      // Make sure we always have an array
      const list = Array.isArray(res.data) ? res.data : [];
      setDrivers(list);
    } catch (err) {
      console.error("Failed to load drivers", err);
      setErrorMsg("Failed to load drivers.");
      setDrivers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDrivers();
  }, []);

  useEffect(() => {
    // Subscribe to driver status updates
    const socket = getSocket();

    const handleStatusUpdate = () => {
      console.log("Driver status changed – reloading drivers list");
      loadDrivers();
    };

    socket.on("driver:status:update", handleStatusUpdate);

    // Cleanup when component unmounts
    return () => {
      socket.off("driver:status:update", handleStatusUpdate);
    };
  }, []);


  const handleChange = (field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);

    try {
      if (editingId) {
        await api.put(`/admin/drivers/${editingId}`, {
          name: form.name,
          email: form.email,
          phone: form.phone,
          vehicle_plate: form.vehicle_plate,
          vehicle_model: form.vehicle_model,
          status: form.status,
        });
      } else {
        await api.post("/admin/drivers", form);
      }

      setForm(emptyForm);
      setEditingId(null);
      await loadDrivers();
    } catch (err: any) {
      console.error("Save driver failed", err);
      setErrorMsg(
        err?.response?.data?.error || "Failed to save driver. Try again."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (driver: Driver) => {
    setEditingId(driver.id);
    setForm({
      name: driver.name || "",
      email: driver.email || "",
      phone: driver.phone || "",
      password: "", // password not changed when editing
      vehicle_plate: driver.vehicle_plate || "",
      vehicle_model: driver.vehicle_model || "",
      status: driver.status || "offline",
    });
  };

  const handleDelete = async (id: number) => {
    const ok = window.confirm("Delete this driver?");
    if (!ok) return;
    try {
      await api.delete(`/admin/drivers/${id}`);
      setDrivers((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      console.error("Delete driver failed", err);
      alert("Failed to delete driver.");
    }
  };

  return (
    <div className="page">
      {/* Form panel */}
      <section className="panel">
        <h2 className="panel-title">
          {editingId ? "Edit Driver" : "Add new Driver"}
        </h2>

        <form className="drivers-form" onSubmit={handleSubmit}>
          <div className="drivers-form-grid">
            <label className="drivers-label">
              Name
              <input
                className="drivers-input"
                value={form.name}
                onChange={(e) => handleChange("name", e.target.value)}
                required
              />
            </label>

            <label className="drivers-label">
              Email
              <input
                type="email"
                className="drivers-input"
                value={form.email}
                onChange={(e) => handleChange("email", e.target.value)}
                required
              />
            </label>

            <label className="drivers-label">
              Phone
              <input
                className="drivers-input"
                value={form.phone}
                onChange={(e) => handleChange("phone", e.target.value)}
              />
            </label>

            {!editingId && (
              <label className="drivers-label">
                Password
                <input
                  type="password"
                  className="drivers-input"
                  value={form.password}
                  onChange={(e) => handleChange("password", e.target.value)}
                  required
                />
              </label>
            )}

            <label className="drivers-label">
              Vehicle Plate
              <input
                className="drivers-input"
                value={form.vehicle_plate}
                onChange={(e) =>
                  handleChange("vehicle_plate", e.target.value)
                }
              />
            </label>

            <label className="drivers-label">
              Vehicle Model
              <input
                className="drivers-input"
                value={form.vehicle_model}
                onChange={(e) =>
                  handleChange("vehicle_model", e.target.value)
                }
              />
            </label>

            {editingId && (
              <label className="drivers-label">
                Status
                <select
                  className="drivers-input"
                  value={form.status}
                  onChange={(e) => handleChange("status", e.target.value)}
                >
                  <option value="offline">Offline</option>
                  <option value="online">Online</option>
                  <option value="on_trip">On trip</option>
                </select>
              </label>
            )}
          </div>

          {errorMsg && <div className="login-error">{errorMsg}</div>}

          <div className="drivers-form-actions">
            <button
              className="drivers-save-button"
              type="submit"
              disabled={saving}
            >
              {saving
                ? editingId
                  ? "Saving..."
                  : "Creating..."
                : editingId
                ? "Save changes"
                : "Create driver"}
            </button>

            {editingId && (
              <button
                type="button"
                className="drivers-cancel-button"
                onClick={() => {
                  setEditingId(null);
                  setForm(emptyForm);
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </section>

      {/* List panel */}
      <section className="panel">
        <h2 className="panel-title">Drivers list</h2>

        {loading ? (
          <p>Loading drivers...</p>
        ) : drivers.length === 0 ? (
          <p>No drivers yet.</p>
        ) : (
          <table className="drivers-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Contact</th>
                <th>Vehicle</th>
                <th>Status</th>
                <th style={{ width: 130 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {drivers.map((d) => (
                <tr key={d.id}>
                  <td>{d.name || "—"}</td>
                  <td>
                    <div>{d.email || "—"}</div>
                    <div className="drivers-sub">
                      {d.phone && d.phone.trim() !== "" ? d.phone : ""}
                    </div>
                  </td>
                  <td>
                    <div>{d.vehicle_plate || "—"}</div>
                    <div className="drivers-sub">
                      {d.vehicle_model || ""}
                    </div>
                  </td>
                  <td className="drivers-status">
                    {(d.status || "offline").replace("_", " ")}
                  </td>
                  <td>
                    <button
                      className="drivers-action"
                      type="button"
                      onClick={() => handleEdit(d)}
                    >
                      Edit
                    </button>
                    <button
                      className="drivers-action drivers-danger"
                      type="button"
                      onClick={() => handleDelete(d.id)}
                    >
                      Delete
                    </button>
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
