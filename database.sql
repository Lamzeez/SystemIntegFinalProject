-- =========================================================
-- BaoRide - Database Schema
-- Save as: database.sql
-- =========================================================

-- Change the DB name if you want
CREATE DATABASE IF NOT EXISTS bao_ride
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE bao_ride;

-- =========================================================
-- USERS
-- - Holds all accounts: admin, driver, passenger
-- =========================================================
CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(190) NOT NULL,
  phone         VARCHAR(30) DEFAULT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          ENUM('admin', 'driver', 'passenger') NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================================================
-- DRIVERS
-- - Extra info for driver accounts
-- - Linked to users.id
-- =========================================================
CREATE TABLE IF NOT EXISTS drivers (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id        INT UNSIGNED NOT NULL,
  vehicle_plate  VARCHAR(32) DEFAULT NULL,
  vehicle_model  VARCHAR(100) DEFAULT NULL,
  status         ENUM('online', 'offline', 'on_trip') NOT NULL DEFAULT 'offline',
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_drivers_user (user_id),
  CONSTRAINT fk_drivers_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================================================
-- RIDES
-- - Core of the system
-- - passenger_id references users.id (role=passenger)
-- - driver_id references drivers.id
-- - Distances in km; fares in whole pesos
-- =========================================================
CREATE TABLE IF NOT EXISTS rides (
  id                   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  passenger_id         INT UNSIGNED NOT NULL,
  driver_id            INT UNSIGNED DEFAULT NULL,
  
  pickup_lat           DECIMAL(9,6)  NOT NULL,
  pickup_lng           DECIMAL(9,6)  NOT NULL,
  dropoff_lat          DECIMAL(9,6)  NOT NULL,
  dropoff_lng          DECIMAL(9,6)  NOT NULL,

  pickup_address       VARCHAR(255) DEFAULT NULL,
  dropoff_address      VARCHAR(255) DEFAULT NULL,

  status               ENUM('requested','assigned','in_progress','completed','cancelled')
                       NOT NULL DEFAULT 'requested',

  -- Estimated values at request time
  estimated_distance_km DECIMAL(10,3) DEFAULT NULL,
  estimated_fare        INT UNSIGNED DEFAULT NULL,

  -- Final values when ride is completed
  distance_km           DECIMAL(10,3) DEFAULT NULL,
  fare                  INT UNSIGNED DEFAULT NULL,
  final_distance_km     DECIMAL(10,3) DEFAULT NULL,
  final_fare            INT UNSIGNED DEFAULT NULL,

  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),

  KEY idx_rides_passenger_status (passenger_id, status),
  KEY idx_rides_driver_status    (driver_id, status),
  KEY idx_rides_status           (status),

  CONSTRAINT fk_rides_passenger
    FOREIGN KEY (passenger_id) REFERENCES users(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,

  CONSTRAINT fk_rides_driver
    FOREIGN KEY (driver_id) REFERENCES drivers(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================================================
-- DRIVER LOCATIONS
-- - Updated via socket.io 'driver:location'
-- - One row per driver, updated with ON DUPLICATE KEY
-- =========================================================
CREATE TABLE IF NOT EXISTS driver_locations (
  driver_id  INT UNSIGNED NOT NULL,
  lat        DECIMAL(9,6) NOT NULL,
  lng        DECIMAL(9,6) NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                         ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (driver_id),

  CONSTRAINT fk_driver_locations_driver
    FOREIGN KEY (driver_id) REFERENCES drivers(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================================================
-- OPTIONAL: Seed an admin user (CHANGE email & password!)
-- =========================================================
-- INSERT INTO users (name, email, phone, password_hash, role)
-- VALUES (
--   'Admin',
--   'admin@example.com',
--   NULL,
--   '$2a$10$REPLACE_THIS_WITH_A_REAL_BCRYPT_HASH',
--   'admin'
-- );

-- You can generate a bcrypt hash in Node:
--   const bcrypt = require('bcryptjs');
--   bcrypt.hash('yourpassword', 10).then(console.log);
