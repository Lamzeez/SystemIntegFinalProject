// index.js
require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const pool = require('./db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { authenticateToken, requireAdmin } = require('./authMiddleware');

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
      'SELECT * FROM users WHERE email = ? AND role = "admin" LIMIT 1',
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
        role: user.role,
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

  socket.on('disconnect', () => {
    console.log('Client disconnected', socket.id);
  });
});

// ---------- START SERVER ----------

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Bao Ride server listening on port ${PORT}`);
});
