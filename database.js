const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const db = new DatabaseSync(path.join(__dirname, 'chayhana.db'));

// Включаем WAL для производительности
db.exec('PRAGMA journal_mode = WAL');

// === СОЗДАНИЕ ТАБЛИЦ ===
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    phone TEXT UNIQUE,
    name TEXT DEFAULT '',
    google_id TEXT,
    google_name TEXT,
    google_email TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS verification_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT NOT NULL,
    code TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    used INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    items TEXT NOT NULL,
    total_kg REAL NOT NULL,
    total_price INTEGER NOT NULL,
    comment TEXT DEFAULT '',
    status TEXT DEFAULT 'new',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    sender_type TEXT NOT NULL,
    sender_id TEXT,
    text TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id)
  );

  CREATE TABLE IF NOT EXISTS admin_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// Пароль админа по умолчанию
const adminExists = db.prepare('SELECT * FROM admin_settings WHERE key = ?').get('admin_password');
if (!adminExists) {
  db.prepare('INSERT INTO admin_settings (key, value) VALUES (?, ?)').run('admin_password', 'admin123');
}

// === ФУНКЦИИ ===

// Пользователи
function createUser(phone) {
  const id = uuidv4();
  db.prepare('INSERT OR IGNORE INTO users (id, phone) VALUES (?, ?)').run(id, phone);
  return db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
}

function getUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function getUserByPhone(phone) {
  return db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
}

function updateUserName(userId, name) {
  db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, userId);
}

// Верификация
function createVerificationCode(phone) {
  // Удаляем старые коды
  db.prepare('DELETE FROM verification_codes WHERE phone = ?').run(phone);
  
  // Генерируем 6-значный код
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 минут
  
  db.prepare('INSERT INTO verification_codes (phone, code, expires_at) VALUES (?, ?, ?)').run(phone, code, expiresAt);
  
  return code;
}

function verifyCode(phone, code) {
  const record = db.prepare(
    "SELECT * FROM verification_codes WHERE phone = ? AND code = ? AND used = 0 AND expires_at > datetime('now')"
  ).get(phone, code);
  
  if (record) {
    db.prepare('UPDATE verification_codes SET used = 1 WHERE id = ?').run(record.id);
    return true;
  }
  return false;
}

// Заказы
function createOrder(userId, items, totalKg, totalPrice, comment) {
  const id = uuidv4();
  db.prepare(
    'INSERT INTO orders (id, user_id, items, total_kg, total_price, comment) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, userId, JSON.stringify(items), totalKg, totalPrice, comment || '');
  return db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
}

function getOrderById(id) {
  return db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
}

function getOrdersByUser(userId) {
  return db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC').all(userId);
}

function getAllOrders() {
  return db.prepare(`
    SELECT orders.*, users.phone, users.name as user_name
    FROM orders
    LEFT JOIN users ON orders.user_id = users.id
    ORDER BY orders.created_at DESC
  `).all();
}

function updateOrderStatus(orderId, status) {
  db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, orderId);
  return db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
}

function getTodayStats() {
  const today = new Date().toISOString().split('T')[0];
  const stats = db.prepare(`
    SELECT 
      COUNT(*) as total_orders,
      COALESCE(SUM(total_price), 0) as total_revenue,
      COALESCE(SUM(total_kg), 0) as total_kg
    FROM orders 
    WHERE date(created_at) = date(?)
  `).get(today);
  
  const newOrders = db.prepare(`
    SELECT COUNT(*) as count FROM orders WHERE status = 'new'
  `).get();
  
  return { ...stats, new_orders: newOrders.count };
}

// Сообщения
function addMessage(orderId, senderType, senderId, text) {
  const id = uuidv4();
  db.prepare(
    'INSERT INTO messages (id, order_id, sender_type, sender_id, text) VALUES (?, ?, ?, ?, ?)'
  ).run(id, orderId, senderType, senderId, text);
  return db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
}

function getMessages(orderId) {
  return db.prepare('SELECT * FROM messages WHERE order_id = ? ORDER BY created_at ASC').all(orderId);
}

// Админ
function checkAdminPassword(password) {
  const admin = db.prepare('SELECT * FROM admin_settings WHERE key = ?').get('admin_password');
  return admin && admin.value === password;
}

module.exports = {
  createUser, getUserById, getUserByPhone, updateUserName,
  createVerificationCode, verifyCode,
  createOrder, getOrderById, getOrdersByUser, getAllOrders, updateOrderStatus, getTodayStats,
  addMessage, getMessages,
  checkAdminPassword
};
