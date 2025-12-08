// index.js
require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const pool = require('./db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { authenticateToken, requireAdmin, requireDriver } = require('./authMiddleware');

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

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

// Driver accepts a ride
app.post(
  '/driver/rides/:id/accept',
  authenticateToken,
  requireDriver,
  async (req, res) => {
    const rideId = req.params.id;

    try {
      const userId = req.user.id;
      const driver = await getDriverForUser(userId);

      const [result] = await pool.query(
        `UPDATE rides
         SET status = 'assigned', driver_id = ?
         WHERE id = ?
           AND status IN ('requested', 'assigned')
           AND (driver_id IS NULL OR driver_id = ?)`,
        [driver.id, rideId, driver.id]
      );

      if (result.affectedRows === 0) {
        return res.status(400).json({ error: 'Ride cannot be accepted' });
      }

      io.emit('ride:status:update', {
        rideId: Number(rideId),
        status: 'assigned',
        driverId: driver.id,
      });

      res.json({ message: 'Ride accepted' });
    } catch (err) {
      console.error('Error accepting ride', err);
      res.status(500).json({ error: 'Failed to accept ride' });
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
  '/driver/rides/:id/complete',
  authenticateToken,
  requireDriver,
  async (req, res) => {
    const rideId = req.params.id;

    try {
      const userId = req.user.id;
      const driver = await getDriverForUser(userId);

      // Fetch ride details
      const [rows] = await pool.query(
        `SELECT id, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, distance_km
         FROM rides
         WHERE id = ?
           AND driver_id = ?
           AND status = 'in_progress'
         LIMIT 1`,
        [rideId, driver.id]
      );

      if (!rows.length) {
        return res.status(400).json({ error: 'Ride cannot be completed' });
      }

      const ride = rows[0];

      // Use existing distance if already stored, otherwise compute it
      let distanceKm = ride.distance_km;
      if (!distanceKm) {
        distanceKm = calculateDistanceKm(
          Number(ride.pickup_lat),
          Number(ride.pickup_lng),
          Number(ride.dropoff_lat),
          Number(ride.dropoff_lng)
        );
      }

      const fare = calculateFareFromDistance(Number(distanceKm));

      // Update ride with status, distance, and fare
      await pool.query(
        `UPDATE rides
         SET status = 'completed',
             distance_km = ?,
             fare = ?
         WHERE id = ?`,
        [distanceKm, fare, rideId]
      );

      // Notify dashboards / clients
      io.emit('ride:status:update', {
        rideId: Number(rideId),
        status: 'completed',
        driverId: driver.id,
        distanceKm,
        fare,
      });

      res.json({
        message: 'Ride completed',
        distance_km: distanceKm,
        fare,
      });
    } catch (err) {
      console.error('Error completing ride', err);
      res.status(500).json({ error: 'Failed to complete ride' });
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




// (Later: add /auth/login, /drivers, /rides, etc.)
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

  // socket.on('disconnect', () => {
  //   console.log('Client disconnected', socket.id);
  // });

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

    // Mark driver online
    await pool.query("UPDATE drivers SET status = 'online' WHERE id = ?", [
      driverId,
    ]);

    io.emit("driver:status:update", { driverId, status: "online" });
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

    io.emit("ride:status:update", {
      rideId,
      status: "assigned",
      driverId,
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

    io.emit("ride:status:update", {
      rideId,
      status: "in_progress",
      driverId,
    });
  });

  socket.on("ride:complete", async ({ rideId }) => {
    const driverId = socket.data?.driverId;
    if (!driverId) return;

    // Use our NEW auto fare calculation
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

    const fare = calculateFareFromDistance(distance);

    await pool.query(
      `UPDATE rides SET status='completed', fare=?, distance_km=? WHERE id=?`,
      [fare, distance, rideId]
    );

    io.emit("ride:status:update", {
      rideId,
      status: "completed",
      driverId,
      distanceKm: distance,
      fare,
    });
  });



});

// ---------- START SERVER ----------

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Bao Ride server listening on port ${PORT}`);
});
