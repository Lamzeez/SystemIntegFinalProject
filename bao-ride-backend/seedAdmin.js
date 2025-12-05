// seedAdmin.js
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./db');

async function main() {
  const name = 'Admin';
  const email = 'admin@baoride.com';
  const phone = '0000000000';
  const plainPassword = 'admin123'; // change after login!
  const password_hash = await bcrypt.hash(plainPassword, 10);

  try {
    const [result] = await pool.query(
      'INSERT INTO users (name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, "admin")',
      [name, email, phone, password_hash]
    );
    console.log('Admin created with id:', result.insertId);
  } catch (err) {
    console.error('Error creating admin', err);
  } finally {
    pool.end();
  }
}

main();
