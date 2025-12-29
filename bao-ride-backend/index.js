require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const pool = require('./db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { authenticateToken, requireAdmin, requireDriver, requirePassenger } = require('./authMiddleware');

const app = express();
const server = http.createServer(app);

const axios = require("axios");

// ---------------- Passenger count support (1..5) ----------------
function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.trunc(n);
  if (i < min) return min;
  if (i > max) return max;
  return i;
}

const __columnCache = new Map(); // key: `${table}.${column}` => boolean
async function tableHasColumn(tableName, columnName) {
  const key = `${tableName}.${columnName}`;
  if (__columnCache.has(key)) return __columnCache.get(key);

  const [rows] = await pool.query(
    `SELECT 1 AS ok
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?
     LIMIT 1`,
    [tableName, columnName]
  );

  const exists = !!rows.length;
  __columnCache.set(key, exists);
  return exists;
}

async function ensurePassengerCountColumn() {
  try {
    const exists = await tableHasColumn("rides", "passenger_count");
    if (exists) return;

    // Add a default passenger_count column so fare multiplication is consistent
    await pool.query(`ALTER TABLE rides ADD COLUMN passenger_count INT NOT NULL DEFAULT 1`);
    __columnCache.set("rides.passenger_count", true);
    console.log("✅ Added rides.passenger_count column (default 1)");
  } catch (e) {
    console.warn("⚠️ Could not ensure rides.passenger_count column:", e?.message || e);
  }
}

// Haversine as fallback
function haversineDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius km
  const toRad = (d) => (d * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Use OSRM, fallback to Haversine
async function getRouteDistanceKm(pickupLat, pickupLng, dropoffLat, dropoffLng) {
  try {
    const url = `http://router.project-osrm.org/route/v1/driving/${pickupLng},${pickupLat};${dropoffLng},${dropoffLat}?overview=false`;
    const response = await axios.get(url);

    if (
      response.data &&
      response.data.routes &&
      response.data.routes[0] &&
      typeof response.data.routes[0].distance === "number"
    ) {
      const meters = response.data.routes[0].distance;
      return meters / 1000; // km
    }
  } catch (err) {
    console.error("OSRM route error, falling back to Haversine:", err.message);
  }

  return haversineDistanceKm(pickupLat, pickupLng, dropoffLat, dropoffLng);
}

async function getRouteMetricsKmMin(pickupLat, pickupLng, dropoffLat, dropoffLng) {
  try {
    const url = `http://router.project-osrm.org/route/v1/driving/${pickupLng},${pickupLat};${dropoffLng},${dropoffLat}?overview=false`;
    const response = await axios.get(url);
    const route = response.data?.routes?.[0];
    if (!route) throw new Error("No routes returned");

    const distanceKm = route.distance / 1000;
    const durationMin = route.duration / 60;
    return { distanceKm, durationMin };
  } catch (e) {
    console.error("OSRM route metrics failed, fallback:", e.message || e);
    // fallback: assume ~20kph average
    const fallbackDistanceKm = haversineDistanceKm(pickupLat, pickupLng, dropoffLat, dropoffLng);
    const durationMin = (fallbackDistanceKm / 20) * 60;
    return { distanceKm: fallbackDistanceKm, durationMin };
  }
}


// ONE single fare rule used everywhere
function computeFare(distanceKm) {
  const baseFare = 15; // up to 5 km
  const includedKm = 5;
  const extraPerKm = 3;

  if (!Number.isFinite(distanceKm)) return baseFare;

  const extraKm = Math.max(0, distanceKm - includedKm);
  const extraUnits = Math.ceil(extraKm); // each started km
  return baseFare + extraUnits * extraPerKm;
}

app.use(cors());
app.use(express.json());

// Ensure passenger_count column exists (non-fatal)
ensurePassengerCountColumn();

const io = new Server(server, {
  cors: {
    origin: '*',
  },
});

function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function toRad(value) {
  return (value * Math.PI) / 180;
}

// Haversine distance in kilometers
function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  if (
    lat1 == null ||
    lon1 == null ||
    lat2 == null ||
    lon2 == null
  ) {
    return null;
  }

  const R = 6371; // Earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c;
  return d; // km
}

function calculateFareFromDistance(distanceKm) {
  const MIN_FARE = 15; // ₱15.00
  const BASE_KM = 5;   // up to 5 km
  const EXTRA_PER_KM = 3; // ₱3 per extra km

  if (!distanceKm || distanceKm <= 0) return MIN_FARE;

  if (distanceKm <= BASE_KM) return MIN_FARE;

  const extraKm = Math.max(0, Math.ceil(distanceKm - BASE_KM));
  return MIN_FARE + extraKm * EXTRA_PER_KM;
}

async function getDriverForUser(userId) {
  const [rows] = await pool.query(
    'SELECT * FROM drivers WHERE user_id = ? LIMIT 1',
    [userId]
  );
  if (!rows.length) {
    const err = new Error('Driver record not found');
    err.statusCode = 404;
    throw err;
  }
  return rows[0]; // { id, user_id, vehicle_plate, vehicle_model, status }
}

// ---------- REST ENDPOINTS (example for admin dashboard) ----------

// Simple health check
app.get('/', (req, res) => {
  res.json({ status: 'Bao Ride backend running' });
});

// Dashboard stats
app.get('/admin/dashboard', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const [[{ totalDrivers }]] = await pool.query(
      "SELECT COUNT(*) AS totalDrivers FROM users WHERE role = 'driver'"
    );
    const [[{ activeRides }]] = await pool.query(
      "SELECT COUNT(*) AS activeRides FROM rides WHERE status IN ('requested','assigned','in_progress')"
    );
    const [[{ todaysRevenue }]] = await pool.query(
      "SELECT IFNULL(SUM(fare),0) AS todaysRevenue FROM rides WHERE DATE(created_at) = CURDATE() AND status = 'completed'"
    );
    const [[{ totalRides }]] = await pool.query(
      "SELECT COUNT(*) AS totalRides FROM rides"
    );
    const [recentRides] = await pool.query(
      `SELECT r.id, r.status, r.fare, r.created_at,
              p.name AS passenger_name,
              u.name AS driver_name
       FROM rides r
       JOIN users p ON r.passenger_id = p.id
       LEFT JOIN drivers d ON r.driver_id = d.id
       LEFT JOIN users u ON d.user_id = u.id
       ORDER BY r.created_at DESC
       LIMIT 10`
    );

    res.json({
      totalDrivers,
      activeRides,
      todaysRevenue,
      totalRides,
      recentRides,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

// ---------- DRIVERS MANAGEMENT (ADMIN) ----------

// List all drivers
app.get('/admin/drivers', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT d.id,
              u.name,
              u.email,
              u.phone,
              d.vehicle_plate,
              d.vehicle_model,
              d.status
       FROM drivers d
       JOIN users u ON d.user_id = u.id
       ORDER BY u.name ASC`
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching drivers', err);
    res.status(500).json({ error: 'Failed to fetch drivers' });
  }
});

// Create new driver
app.post('/admin/drivers', authenticateToken, requireAdmin, async (req, res) => {
  const { name, email, phone, password, vehicle_plate, vehicle_model } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }

  try {
    const password_hash = await bcrypt.hash(password, 10);

    // create user
    const [userResult] = await pool.query(
      'INSERT INTO users (name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, "driver")',
      [name, email, phone || null, password_hash]
    );

    const userId = userResult.insertId;

    // create driver record
    const [driverResult] = await pool.query(
      'INSERT INTO drivers (user_id, vehicle_plate, vehicle_model, status) VALUES (?, ?, ?, "offline")',
      [userId, vehicle_plate || null, vehicle_model || null]
    );

    res.status(201).json({
      id: driverResult.insertId,
      name,
      email,
      phone,
      vehicle_plate,
      vehicle_model,
      status: 'offline',
    });
  } catch (err) {
    console.error('Error creating driver', err);
    res.status(500).json({ error: 'Failed to create driver' });
  }
});

// Update driver
app.put(
  '/admin/drivers/:id',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    const driverId = req.params.id;
    const { name, email, phone, vehicle_plate, vehicle_model, status } = req.body;

    try {
      // Find user_id for this driver
      const [[driver]] = await pool.query(
        'SELECT user_id FROM drivers WHERE id = ?',
        [driverId]
      );
      if (!driver) {
        return res.status(404).json({ error: 'Driver not found' });
      }

      const userId = driver.user_id;

      // Update user
      await pool.query(
        'UPDATE users SET name = ?, email = ?, phone = ? WHERE id = ?',
        [name, email, phone, userId]
      );

      // Update driver record
      await pool.query(
        'UPDATE drivers SET vehicle_plate = ?, vehicle_model = ?, status = ? WHERE id = ?',
        [vehicle_plate, vehicle_model, status || 'offline', driverId]
      );

      res.json({ message: 'Driver updated' });
    } catch (err) {
      console.error('Error updating driver', err);
      res.status(500).json({ error: 'Failed to update driver' });
    }
  }
);

// Delete driver
app.delete(
  '/admin/drivers/:id',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    const driverId = req.params.id;
    try {
      // Find user_id for this driver
      const [[driver]] = await pool.query(
        'SELECT user_id FROM drivers WHERE id = ?',
        [driverId]
      );
      if (!driver) {
        return res.status(404).json({ error: 'Driver not found' });
      }

      const userId = driver.user_id;

      // Delete driver & user
      await pool.query('DELETE FROM drivers WHERE id = ?', [driverId]);
      await pool.query('DELETE FROM users WHERE id = ?', [userId]);

      res.json({ message: 'Driver deleted' });
    } catch (err) {
      console.error('Error deleting driver', err);
      res.status(500).json({ error: 'Failed to delete driver' });
    }
  }
);

// ---------- DRIVER API ----------

// Get driver profile (user + driver info)
app.get('/driver/profile', authenticateToken, requireDriver, async (req, res) => {
  try {
    const userId = req.user.id;
    const driver = await getDriverForUser(userId);

    const [[user]] = await pool.query(
      'SELECT id, name, email, phone, role FROM users WHERE id = ?',
      [userId]
    );

    res.json({ user, driver });
  } catch (err) {
    console.error('Error fetching driver profile', err);
    res
      .status(err.statusCode || 500)
      .json({ error: err.statusCode === 404 ? 'Driver not found' : 'Failed to load profile' });
  }
});

// Update driver status: 'online' | 'offline' | 'on_trip'
app.post('/driver/status', authenticateToken, requireDriver, async (req, res) => {
  const { status } = req.body;
  const allowed = ['online', 'offline', 'on_trip'];

  if (!allowed.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  try {
    const userId = req.user.id;
    const driver = await getDriverForUser(userId);

    await pool.query(
      'UPDATE drivers SET status = ? WHERE id = ?',
      [status, driver.id]
    );

    // Optional: notify dashboards
    io.emit('driver:status:update', {
      driverId: driver.id,
      status,
    });

    res.json({ message: 'Status updated', status });
  } catch (err) {
    console.error('Error updating driver status', err);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// Get current active ride (assigned or in_progress) for this driver
app.get(
  '/driver/rides/current',
  authenticateToken,
  requireDriver,
  async (req, res) => {
    try {
      const userId = req.user.id;
      const driver = await getDriverForUser(userId);

      const [rows] = await pool.query(
        `SELECT r.*,
                p.name  AS passenger_name,
                p.phone AS passenger_phone
         FROM rides r
         JOIN users p ON r.passenger_id = p.id
         WHERE r.driver_id = ?
           AND r.status IN ('assigned', 'in_progress')
         ORDER BY r.updated_at DESC
         LIMIT 1`,
        [driver.id]
      );

      const ride = rows[0] || null;
      res.json({ ride });
    } catch (err) {
      console.error('Error fetching current ride', err);
      res.status(500).json({ error: 'Failed to fetch current ride' });
    }
  }
);

// Get completed rides history for this driver
app.get(
  '/driver/rides/history',
  authenticateToken,
  requireDriver,
  async (req, res) => {
    const limit = Number(req.query.limit || 50);

    try {
      const userId = req.user.id;
      const driver = await getDriverForUser(userId);

      const [rows] = await pool.query(
        `SELECT r.*,
                p.name  AS passenger_name
         FROM rides r
         JOIN users p ON r.passenger_id = p.id
         WHERE r.driver_id = ?
           AND r.status = 'completed'
         ORDER BY r.created_at DESC
         LIMIT ?`,
        [driver.id, limit]
      );

      res.json(rows);
    } catch (err) {
      console.error('Error fetching ride history', err);
      res.status(500).json({ error: 'Failed to fetch ride history' });
    }
  }
);

// Get all currently available (requested & unassigned) rides for drivers
app.get(
  "/driver/rides/available",
  authenticateToken,
  requireDriver,
  async (req, res) => {
    try {
      // ✅ Only ONLINE drivers are allowed to view the available rides list.
      // If a driver is OFFLINE/ON_TRIP, return an empty list.
      const driver = await getDriverForUser(req.user.id);
      if (driver.status !== 'online') {
        return res.json({ rides: [] });
      }

      const [rows] = await pool.query(
        `SELECT r.*,
                u.name  AS passenger_name,
                u.phone AS passenger_phone
         FROM rides r
         JOIN users u ON r.passenger_id = u.id
         WHERE r.status = 'requested'
           AND r.driver_id IS NULL
         ORDER BY r.created_at DESC`
      );

      res.json({ rides: rows });
    } catch (err) {
      console.error("Error loading available rides for driver", err);
      res.status(500).json({ error: "Failed to load available rides" });
    }
  }
);

// Driver accepts a ride
app.post(
  '/driver/rides/:id/accept',
  authenticateToken,
  requireDriver,
  async (req, res) => {
    const rideId = req.params.id;

    try {
      const userId = req.user.id;
      const driver = await getDriverForUser(userId); // { id, status, ... }

      // NEW: Block accepting if driver is not ONLINE
      if (driver.status !== 'online') {
        return res.status(403).json({
          error: 'You must be ONLINE to accept rides',
        });
      }

      // Attempt an atomic update:
      // Only succeed if ride is still REQUESTED and unassigned.
      const [result] = await pool.query(
        `UPDATE rides
         SET status = 'assigned', driver_id = ?
         WHERE id = ?
           AND status = 'requested'
           AND driver_id IS NULL`,
        [driver.id, rideId]
      );

      // If no rows updated → another driver took it already
      if (result.affectedRows === 0) {
        return res.status(409).json({
          error: 'Ride already assigned to another driver',
        });
      }

      // ⭐ ADDED: fetch driver_name from users table
      const [[driverUser]] = await pool.query(
        'SELECT name FROM users WHERE id = ? LIMIT 1',
        [userId]
      );
      const driverName = driverUser ? driverUser.name : null;

      // Emit status update ONLY AFTER a successful assignment
      io.emit('ride:status:update', {
        rideId: Number(rideId),
        status: 'assigned',
        driverId: driver.id,
        driver_name: driverName, // ⭐ ADDED
      });

      return res.json({
        message: 'Ride accepted',
        driverId: driver.id,
        driver_name: driverName, // optional but useful
      });
    } catch (err) {
      console.error('Error accepting ride', err);
      return res.status(500).json({ error: 'Failed to accept ride' });
    }
  }
);

// Driver starts the ride (picked up passenger)
app.post(
  '/driver/rides/:id/start',
  authenticateToken,
  requireDriver,
  async (req, res) => {
    const rideId = req.params.id;

    try {
      const userId = req.user.id;
      const driver = await getDriverForUser(userId);

      const [result] = await pool.query(
        `UPDATE rides
         SET status = 'in_progress'
         WHERE id = ?
           AND driver_id = ?
           AND status = 'assigned'`,
        [rideId, driver.id]
      );

      if (result.affectedRows === 0) {
        return res.status(400).json({ error: 'Ride cannot be started' });
      }

      io.emit('ride:status:update', {
        rideId: Number(rideId),
        status: 'in_progress',
        driverId: driver.id,
      });

      res.json({ message: 'Ride started' });
    } catch (err) {
      console.error('Error starting ride', err);
      res.status(500).json({ error: 'Failed to start ride' });
    }
  }
);

// Driver completes the ride (fare auto-calculated from distance)
app.post(
  "/driver/rides/:id/complete",
  authenticateToken,
  requireDriver,
  async (req, res) => {
    const rideId = req.params.id;

    try {
      const userId = req.user.id;
      const driver = await getDriverForUser(userId);

      // 1) Get ride
      const [rows] = await pool.query("SELECT * FROM rides WHERE id = ?", [
        rideId,
      ]);
      const ride = rows[0];

      if (!ride) {
        return res.status(404).json({ error: "Ride not found" });
      }

      if (ride.driver_id !== driver.id) {
        return res
          .status(403)
          .json({ error: "This ride is not assigned to you" });
      }

      if (ride.status !== "in_progress" && ride.status !== "assigned") {
        return res
          .status(400)
          .json({ error: "Ride is not in a completable state" });
      }

      // 2) Use stored estimated distance (fallback to recompute if missing)
      let finalDistanceKm =
        ride.estimated_distance_km != null
          ? Number(ride.estimated_distance_km)
          : null;

      if (!Number.isFinite(finalDistanceKm)) {
        finalDistanceKm = await getRouteDistanceKm(
          Number(ride.pickup_lat),
          Number(ride.pickup_lng),
          Number(ride.dropoff_lat),
          Number(ride.dropoff_lng)
        );
      }

      // 3) Compute final fare using the SAME helper
      const passengerCount = Math.max(
        1,
        Math.min(5, parseInt(String(ride.passenger_count ?? 1), 10) || 1)
      );

      const baseFinalFare = computeFare(finalDistanceKm);
      const finalFare = baseFinalFare * passengerCount;


      // 4) Update ride as completed
      const [result] = await pool.query(
        `UPDATE rides
         SET status = 'completed',
             final_distance_km = ?,
             final_fare = ?,
             distance_km = ?,
             fare = ?
         WHERE id = ?`,
        [finalDistanceKm, finalFare, finalDistanceKm, finalFare, rideId]
      );

      if (result.affectedRows === 0) {
        return res.status(500).json({ error: "Failed to complete ride" });
      }

      io.emit("ride:status:update", {
        rideId: Number(rideId),
        status: "completed",
        final_distance_km: finalDistanceKm,
        final_fare: finalFare,
        fare: finalFare, // for any client still using 'fare'
        passengerId: ride.passenger_id,
        driverId: ride.driver_id,
        passenger_count: passengerCount,
      });

      res.json({ message: "Ride completed", fare: finalFare, final_fare: finalFare, passenger_count: passengerCount });
    } catch (err) {
      console.error("Error completing ride", err);
      res.status(500).json({ error: "Failed to complete ride" });
    }
  }
);

// ---------- RIDES MANAGEMENT (ADMIN) ----------

// List rides with optional ?status=
app.get('/admin/rides', authenticateToken, requireAdmin, async (req, res) => {
  const { status } = req.query;

  try {
    let sql = `
      SELECT r.id,
             r.status,
             r.fare,
             r.created_at,
             r.updated_at,
             p.name AS passenger_name,
             u.name AS driver_name
      FROM rides r
      JOIN users p ON r.passenger_id = p.id
      LEFT JOIN drivers d ON r.driver_id = d.id
      LEFT JOIN users u ON d.user_id = u.id
    `;
    const params = [];

    if (status && status !== 'all') {
      sql += ' WHERE r.status = ?';
      params.push(status);
    }

    sql += ' ORDER BY r.created_at DESC LIMIT 200';

    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching rides', err);
    res.status(500).json({ error: 'Failed to fetch rides' });
  }
});

// ⭐ UPDATED: include driver_name for passenger current ride
app.get('/passenger/rides/current', authenticateToken, async (req, res) => {
  if (req.user.role !== 'passenger') {
    return res.status(403).json({ error: 'Only passengers can view rides' });
  }

  const passengerId = req.user.id;
  const [rows] = await pool.query(
    `SELECT r.*,
            u.name AS driver_name
     FROM rides r
     LEFT JOIN drivers d ON r.driver_id = d.id
     LEFT JOIN users u ON d.user_id = u.id
     WHERE r.passenger_id = ?
       AND r.status IN ('requested','assigned','in_progress')
     ORDER BY r.updated_at DESC
     LIMIT 1`,
    [passengerId]
  );

  res.json({ ride: rows[0] || null });
});

// ---------- AUTH ROUTES ----------

app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)
    return res.status(400).json({ error: 'Email and password are required' });

  try {
    const [rows] = await pool.query(
      'SELECT * FROM users WHERE email = ? LIMIT 1',
      [email]
    );

    if (!rows.length) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken(user);

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role, // 'admin' | 'driver' | 'passenger'
      },
    });
  } catch (err) {
    console.error('Login error', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// New endpoint for passenger registration
app.post('/auth/register/passenger', async (req, res) => {
  const { name, email, phone, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }

  try {
    const password_hash = await bcrypt.hash(password, 10);

    // Check if email already exists
    const [existingUsers] = await pool.query(
      'SELECT id FROM users WHERE email = ? LIMIT 1',
      [email]
    );

    if (existingUsers.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    // Create user with 'passenger' role
    const [userResult] = await pool.query(
      'INSERT INTO users (name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, "passenger")',
      [name, email, phone || null, password_hash]
    );

    const userId = userResult.insertId;

    // Generate token for the newly registered passenger
    const token = generateToken({
      id: userId,
      name,
      email,
      role: 'passenger',
    });

    res.status(201).json({
      token,
      user: {
        id: userId,
        name,
        email,
        role: 'passenger',
      },
    });
  } catch (err) {
    console.error('Passenger registration error', err);
    res.status(500).json({ error: 'Failed to register passenger' });
  }
});

// ---------- PASSENGER API ----------

// Request a new ride
app.post(
  "/rides/request",
  authenticateToken,
  requirePassenger,
  async (req, res) => {
    try {
      const passengerId = req.user.id;
      const {
        pickup_lat,
        pickup_lng,
        dropoff_lat,
        dropoff_lng,
        pickup_address,
        dropoff_address,
      } = req.body;

      const passengerCount = clampInt(req.body.passenger_count ?? req.body.passengerCount, 1, 5, 1);

      if (
        pickup_lat == null ||
        pickup_lng == null ||
        dropoff_lat == null ||
        dropoff_lng == null
      ) {
        return res
          .status(400)
          .json({ error: "pickup and dropoff coordinates are required" });
      }

      const pickupLat = Number(pickup_lat);
      const pickupLng = Number(pickup_lng);
      const dropoffLat = Number(dropoff_lat);
      const dropoffLng = Number(dropoff_lng);

      const { distanceKm, durationMin } = await getRouteMetricsKmMin(
        pickupLat, pickupLng, dropoffLat, dropoffLng
      );
      // No surge pricing: keep multiplier at 1.0 (compatibility only)
      const surgeMultiplier = 1.0;

      // Base fare is computed from distance only
      const baseEstimatedFare = computeFare(distanceKm);
      const estimatedFare = baseEstimatedFare * passengerCount;

      const includePassengerCount = await tableHasColumn("rides", "passenger_count");
      const includeSurge = await tableHasColumn("rides", "surge_multiplier");

      let result;
      if (includePassengerCount && includeSurge) {
        const [r] = await pool.query(
          `INSERT INTO rides
          (passenger_id, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng,
            pickup_address, dropoff_address, status,
            estimated_distance_km, estimated_duration_min, estimated_fare, surge_multiplier,
            passenger_count)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'requested', ?, ?, ?, ?, ?)`,
          [
            passengerId,
            pickupLat,
            pickupLng,
            dropoffLat,
            dropoffLng,
            pickup_address || null,
            dropoff_address || null,
            distanceKm,
            durationMin,
            estimatedFare,
            surgeMultiplier,
            passengerCount,
          ]
        );
        result = r;
      } else if (includePassengerCount && !includeSurge) {
        const [r] = await pool.query(
          `INSERT INTO rides
          (passenger_id, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng,
            pickup_address, dropoff_address, status,
            estimated_distance_km, estimated_duration_min, estimated_fare,
            passenger_count)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'requested', ?, ?, ?, ?)`,
          [
            passengerId,
            pickupLat,
            pickupLng,
            dropoffLat,
            dropoffLng,
            pickup_address || null,
            dropoff_address || null,
            distanceKm,
            durationMin,
            estimatedFare,
            passengerCount,
          ]
        );
        result = r;
      } else if (!includePassengerCount && includeSurge) {
        const [r] = await pool.query(
          `INSERT INTO rides
          (passenger_id, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng,
            pickup_address, dropoff_address, status,
            estimated_distance_km, estimated_duration_min, estimated_fare, surge_multiplier)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'requested', ?, ?, ?, ?)`,
          [
            passengerId,
            pickupLat,
            pickupLng,
            dropoffLat,
            dropoffLng,
            pickup_address || null,
            dropoff_address || null,
            distanceKm,
            durationMin,
            estimatedFare,
            surgeMultiplier,
          ]
        );
        result = r;
      } else {
        const [r] = await pool.query(
          `INSERT INTO rides
          (passenger_id, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng,
            pickup_address, dropoff_address, status,
            estimated_distance_km, estimated_duration_min, estimated_fare)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'requested', ?, ?, ?)`,
          [
            passengerId,
            pickupLat,
            pickupLng,
            dropoffLat,
            dropoffLng,
            pickup_address || null,
            dropoff_address || null,
            distanceKm,
            durationMin,
            estimatedFare,
          ]
        );
        result = r;
      }

      const rideId = result.insertId;

      // Load ride including passenger_name
      const [rows] = await pool.query(
        `SELECT r.*,
                u.name  AS passenger_name,
                u.phone AS passenger_phone
         FROM rides r
         JOIN users u ON r.passenger_id = u.id
         WHERE r.id = ?`,
        [rideId]
      );

      const newRide = rows[0];
      if (newRide && newRide.passenger_count == null) newRide.passenger_count = passengerCount;

      // Notify drivers & clients
      await findAndNotifyDrivers(newRide);
      io.emit("ride:status:update", {
        rideId: newRide.id,
        status: newRide.status,
        estimated_distance_km: newRide.estimated_distance_km,
        estimated_fare: newRide.estimated_fare,
        passenger_count: passengerCount,
        passengerId: newRide.passenger_id,
      });

      res.json({ ride: newRide });
    } catch (err) {
      console.error("Error requesting ride", err);
      res.status(500).json({ error: "Failed to request ride" });
    }
  }
);


app.get("/drivers/:id/location", authenticateToken, async (req, res) => {
  try {
    const driverId = Number(req.params.id);
    const [rows] = await pool.query(
      "SELECT lat, lng, updated_at FROM driver_locations WHERE driver_id = ?",
      [driverId]
    );
    if (!rows.length) return res.json({ lat: null, lng: null });
    return res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load driver location" });
  }
});

app.get("/driver/earnings/summary", authenticateToken, requireDriver, async (req, res) => {
  try {
    const driverUserId = req.user.id;

    const [[driverRow]] = await pool.query("SELECT id FROM drivers WHERE user_id = ?", [driverUserId]);
    const driverId = driverRow?.id;
    if (!driverId) return res.status(404).json({ error: "Driver not found" });

    const [[totalRow]] = await pool.query(
      `SELECT COALESCE(SUM(fare),0) AS total, COUNT(*) AS completed_count
       FROM rides WHERE driver_id = ? AND status = 'completed'`,
      [driverId]
    );

    const [[todayRow]] = await pool.query(
      `SELECT COALESCE(SUM(fare),0) AS today
       FROM rides WHERE driver_id = ? AND status = 'completed' AND DATE(updated_at) = CURDATE()`,
      [driverId]
    );

    const [[weekRow]] = await pool.query(
      `SELECT COALESCE(SUM(fare),0) AS week
       FROM rides WHERE driver_id = ? AND status = 'completed' AND YEARWEEK(updated_at, 1) = YEARWEEK(CURDATE(), 1)`,
      [driverId]
    );

    res.json({
      today: Number(todayRow.today),
      week: Number(weekRow.week),
      total: Number(totalRow.total),
      completed_count: Number(totalRow.completed_count),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load earnings summary" });
  }
});


// Passenger cancels a ride
app.post('/rides/:id/cancel', authenticateToken, async (req, res) => {
  try {
    // Only passengers can cancel their own rides
    if (req.user.role !== 'passenger') {
      return res.status(403).json({ error: 'Only passengers can cancel rides' });
    }

    const rideId = Number(req.params.id);
    const passengerId = req.user.id;

    // Only allow cancelling if it's still requested or assigned
    const [result] = await pool.query(
      `UPDATE rides
       SET status = 'cancelled'
       WHERE id = ?
         AND passenger_id = ?
         AND status IN ('requested','assigned')`,
      [rideId, passengerId]
    );

    if (result.affectedRows === 0) {
      return res
        .status(400)
        .json({ error: 'Ride cannot be cancelled (maybe already in progress or finished)' });
    }

    // Notify all clients (passenger app, driver app, admin dashboard)
    io.emit('ride:status:update', {
      rideId,
      status: 'cancelled',
      driverId: null,
    });

    res.json({ message: 'Ride cancelled' });
  } catch (err) {
    console.error('Error cancelling ride', err);
    res.status(500).json({ error: 'Failed to cancel ride' });
  }
});

async function findAndNotifyDrivers(newRide) {
  try {
    // 1. Find all drivers who are currently 'online'
    const [onlineDrivers] = await pool.query(
      "SELECT id FROM drivers WHERE status = 'online'"
    );

    if (onlineDrivers.length === 0) {
      console.log("No online drivers found to notify for new ride.");
      return;
    }

    const onlineDriverIds = onlineDrivers.map(d => d.id);
    console.log(`Found online drivers to notify: ${onlineDriverIds.join(', ')}`);

    // 2. Get all connected socket clients from the main namespace
    const allSockets = await io.fetchSockets();

    // 3. Filter for sockets that belong to an online driver and emit the event
    allSockets.forEach(socket => {
      const driverId = socket.data.driverId;
      if (driverId && onlineDriverIds.includes(driverId)) {
        console.log(`Notifying driver ${driverId} (socket ${socket.id}) of new ride ${newRide.id}`);
        socket.emit("ride:incoming", newRide);
      }
    });

  } catch (err) {
    console.error("Error in findAndNotifyDrivers:", err);
  }
}

// ---------- SOCKET.IO HANDLERS (realtime) ----------

io.on('connection', (socket) => {
  console.log('New client connected', socket.id);

  // Driver sends current location
  socket.on('driver:location', async (payload) => {
    const { driverId, lat, lng } = payload;
    try {
      await pool.query(
        `INSERT INTO driver_locations (driver_id, lat, lng)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE lat = VALUES(lat), lng = VALUES(lng)`,
        [driverId, lat, lng]
      );

      // Broadcast to admins & passengers tracking this driver
      io.emit('driver:location:update', { driverId, lat, lng });
    } catch (err) {
      console.error('Error saving driver location', err);
    }
  });

  // Ride status updated (accepted, completed, etc.)
  socket.on('ride:update', async (payload) => {
    const { rideId, status, driverId } = payload;
    try {
      await pool.query(
        'UPDATE rides SET status = ?, driver_id = IFNULL(?, driver_id) WHERE id = ?',
        [status, driverId || null, rideId]
      );

      // Notify all connected clients (including admin dashboard)
      io.emit('ride:status:update', { rideId, status, driverId });
    } catch (err) {
      console.error('Error updating ride status', err);
    }
  });

  socket.on("auth:driver", async ({ token }) => {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      if (decoded.role !== "driver") {
        socket.emit("auth:error", { error: "Not a driver account" });
        return;
      }

      const userId = decoded.id;

      // Find actual driver row
      const [rows] = await pool.query(
        "SELECT id FROM drivers WHERE user_id = ? LIMIT 1",
        [userId]
      );

      if (!rows.length) {
        socket.emit("auth:error", { error: "Driver record not found" });
        return;
      }

      const driverId = rows[0].id;

      socket.data.userId = userId;
      socket.data.driverId = driverId;

      console.log(`Driver ${driverId} connected via WS`);

      // (We intentionally do NOT auto-set online here.)

      socket.emit("auth:success", { driverId });
    } catch (err) {
      console.error("Driver WS auth failed", err);
      socket.emit("auth:error", { error: "Invalid token" });
    }

    socket.on("disconnect", async () => {
      if (socket.data?.driverId) {
        const driverId = socket.data.driverId;

        await pool.query("UPDATE drivers SET status = 'offline' WHERE id = ?", [
          driverId,
        ]);

        io.emit("driver:status:update", {
          driverId,
          status: "offline",
        });

        console.log(`Driver ${driverId} disconnected`);
      }
    });

    // Send ride request to a specific driver
    function sendRideToDriver(driverId, rideData) {
      for (const [id, socket] of io.of("/").sockets) {
        if (socket.data?.driverId === driverId) {
          socket.emit("ride:incoming", rideData);
        }
      }
    }
  });

  // ⭐ UPDATED: include driver_name in WS accept event too
  socket.on("ride:accept", async ({ rideId }) => {
    const driverId = socket.data?.driverId;
    if (!driverId) return;

    // Accept ride using same logic as the HTTP endpoint
    const [result] = await pool.query(
      `UPDATE rides
       SET status = 'assigned', driver_id = ?
       WHERE id = ?
         AND status IN ('requested','assigned')
         AND (driver_id IS NULL OR driver_id = ?)`,
      [driverId, rideId, driverId]
    );

    if (result.affectedRows === 0) {
      socket.emit("ride:accept:failed", { rideId });
      return;
    }

    // Fetch driver_name via join
    const [[driverUser]] = await pool.query(
      `SELECT u.name
       FROM drivers d
       JOIN users u ON d.user_id = u.id
       WHERE d.id = ?
       LIMIT 1`,
      [driverId]
    );
    const driverName = driverUser ? driverUser.name : null;

    // ✅ Make sure passenger_count is included in the WS status update
    const [[rideRow]] = await pool.query(
      `SELECT passenger_count FROM rides WHERE id = ? LIMIT 1`,
      [rideId]
    );
    const passengerCount = Math.max(
      1,
      Math.min(5, parseInt(String(rideRow?.passenger_count ?? 1), 10) || 1)
    );

    io.emit("ride:status:update", {
      rideId,
      status: "assigned",
      driverId,
      driver_name: driverName, // ⭐ ADDED
      passenger_count: passengerCount,
    });

    socket.emit("ride:accept:success", { rideId });
  });

  socket.on("ride:start", async ({ rideId }) => {
    const driverId = socket.data?.driverId;
    if (!driverId) return;

    const [result] = await pool.query(
      `UPDATE rides SET status='in_progress'
       WHERE id=? AND driver_id=? AND status='assigned'`,
      [rideId, driverId]
    );

    if (result.affectedRows === 0) return;

    // ✅ Include passenger_count in the WS status update
const [[rideRow]] = await pool.query(
  `SELECT passenger_count FROM rides WHERE id = ? LIMIT 1`,
  [rideId]
);
const passengerCount = Math.max(
  1,
  Math.min(5, parseInt(String(rideRow?.passenger_count ?? 1), 10) || 1)
);

io.emit("ride:status:update", {
  rideId,
  status: "in_progress",
  driverId,
  passenger_count: passengerCount,
});
  });

  socket.on("ride:complete", async ({ rideId }) => {
    const driverId = socket.data?.driverId;
    if (!driverId) return;

    const [rows] = await pool.query(
      "SELECT * FROM rides WHERE id = ? AND driver_id = ? AND status='in_progress' LIMIT 1",
      [rideId, driverId]
    );

    if (!rows.length) return;

    const ride = rows[0];

    const distance = calculateDistanceKm(
      Number(ride.pickup_lat),
      Number(ride.pickup_lng),
      Number(ride.dropoff_lat),
      Number(ride.dropoff_lng)
    );

    const passengerCount = Math.max(
      1,
      Math.min(5, parseInt(String(ride.passenger_count ?? 1), 10) || 1)
    );

    const baseFare = calculateFareFromDistance(distance);
    const fare = baseFare * passengerCount;


    await pool.query(
      `UPDATE rides
       SET status='completed',
           fare = ?,
           distance_km = ?,
           final_fare = ?,
           final_distance_km = ?
       WHERE id=?`,
      [fare, distance, fare, distance, rideId]
    );

    io.emit("ride:status:update", {
      rideId,
      status: "completed",
      driverId,
      distanceKm: distance,
      fare,
      final_fare: fare,
      final_distance_km: distance,
      passenger_count: passengerCount,
    });
  });
});

// ---------- START SERVER ----------

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Bao Ride server listening on port ${PORT}`);
});