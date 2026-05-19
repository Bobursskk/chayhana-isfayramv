const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const path = require('path');
const db = require('./database');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const JWT_SECRET = 'chayhana-isfayram-secret-key-2026';
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// === AUTH MIDDLEWARE ===
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Нет токена' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = db.getUserById(decoded.userId);
    if (!req.user) return res.status(401).json({ error: 'Пользователь не найден' });
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Неверный токен' });
  }
}

// === AUTH API ===

const DEMO_MODE = true; // Установите false, чтобы скрыть коды на сайте. Код будет виден только в консоли сервера!

// Отправить код верификации
app.post('/api/auth/send-code', (req, res) => {
  const { phone } = req.body;
  if (!phone || phone.length < 6) {
    return res.status(400).json({ error: 'Введите номер телефона' });
  }

  const code = db.createVerificationCode(phone);

  // Код всегда пишется в консоль сервера (только для вас)
  console.log(`\n📱 Код для ${phone}: ${code}\n`);

  res.json({
    success: true,
    message: 'Код отправлен',
    // Возвращаем код на клиент, только если включен демо-режим
    demo_code: DEMO_MODE ? code : null
  });
});

// Проверить код
app.post('/api/auth/verify-code', (req, res) => {
  const { phone, code } = req.body;

  if (!phone || !code) {
    return res.status(400).json({ error: 'Введите номер и код' });
  }

  const valid = db.verifyCode(phone, code);
  if (!valid) {
    return res.status(400).json({ error: 'Неверный или просроченный код' });
  }

  // Создаём/находим пользователя
  const user = db.createUser(phone);
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });

  res.json({ success: true, token, user: { id: user.id, phone: user.phone, name: user.name } });
});

// Текущий пользователь
app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ user: { id: req.user.id, phone: req.user.phone, name: req.user.name } });
});

// Обновить имя
app.post('/api/auth/update-name', authMiddleware, (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Введите имя' });
  db.updateUserName(req.user.id, name);
  res.json({ success: true });
});

// === ORDERS API ===

// Создать заказ
app.post('/api/orders', authMiddleware, (req, res) => {
  const { items, totalKg, totalPrice, comment } = req.body;
  if (!items || !items.length) return res.status(400).json({ error: 'Корзина пуста' });

  const order = db.createOrder(req.user.id, items, totalKg, totalPrice, comment);

  // Уведомляем админов через Socket.io
  io.to('admins').emit('new-order', {
    ...order,
    items: JSON.parse(order.items),
    phone: req.user.phone,
    user_name: req.user.name
  });

  res.json({ success: true, order: { ...order, items: JSON.parse(order.items) } });
});

// Мои заказы
app.get('/api/orders/my', authMiddleware, (req, res) => {
  const orders = db.getOrdersByUser(req.user.id).map(o => ({
    ...o, items: JSON.parse(o.items)
  }));
  res.json({ orders });
});

// Все заказы (для админа)
app.get('/api/orders', (req, res) => {
  const adminToken = req.headers['x-admin-token'];
  if (!adminToken) return res.status(401).json({ error: 'Нет доступа' });

  try {
    const decoded = jwt.verify(adminToken, JWT_SECRET);
    if (!decoded.isAdmin) return res.status(403).json({ error: 'Нет прав' });
  } catch (e) {
    return res.status(401).json({ error: 'Неверный токен' });
  }

  const orders = db.getAllOrders().map(o => ({
    ...o, items: JSON.parse(o.items)
  }));
  res.json({ orders });
});

// Обновить статус заказа
app.patch('/api/orders/:id/status', (req, res) => {
  const adminToken = req.headers['x-admin-token'];
  if (!adminToken) return res.status(401).json({ error: 'Нет доступа' });

  try {
    const decoded = jwt.verify(adminToken, JWT_SECRET);
    if (!decoded.isAdmin) return res.status(403).json({ error: 'Нет прав' });
  } catch (e) {
    return res.status(401).json({ error: 'Неверный токен' });
  }

  const { status } = req.body;
  const order = db.updateOrderStatus(req.params.id, status);

  // Уведомляем пользователя
  io.to(`user-${order.user_id}`).emit('order-status-updated', {
    orderId: order.id,
    status: order.status
  });

  res.json({ success: true, order: { ...order, items: JSON.parse(order.items) } });
});

// Статистика
app.get('/api/orders/stats', (req, res) => {
  const adminToken = req.headers['x-admin-token'];
  if (!adminToken) return res.status(401).json({ error: 'Нет доступа' });
  try {
    const decoded = jwt.verify(adminToken, JWT_SECRET);
    if (!decoded.isAdmin) return res.status(403).json({ error: 'Нет прав' });
  } catch (e) {
    return res.status(401).json({ error: 'Неверный токен' });
  }
  res.json({ stats: db.getTodayStats() });
});

// Админ вход
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (db.checkAdminPassword(password)) {
    const token = jwt.sign({ isAdmin: true }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ success: true, token });
  } else {
    res.status(401).json({ error: 'Неверный пароль' });
  }
});

// === MESSAGES API ===
app.get('/api/messages/:orderId', (req, res) => {
  const messages = db.getMessages(req.params.orderId);
  res.json({ messages });
});

// === SOCKET.IO ===
io.on('connection', (socket) => {
  console.log('🔌 Подключён:', socket.id);

  // Пользователь подключается к своей комнате
  socket.on('join-user', (userId) => {
    socket.join(`user-${userId}`);
    console.log(`👤 Пользователь ${userId} в комнате`);
  });

  // Админ подключается
  socket.on('join-admin', () => {
    socket.join('admins');
    console.log('👨‍💼 Админ подключён');
  });

  // Присоединиться к чату заказа
  socket.on('join-chat', (orderId) => {
    socket.join(`chat-${orderId}`);
    console.log(`💬 Подключение к чату заказа ${orderId}`);
  });

  // Отправить сообщение
  socket.on('send-message', (data) => {
    const { orderId, senderType, senderId, text } = data;
    const message = db.addMessage(orderId, senderType, senderId, text);
    io.to(`chat-${orderId}`).emit('new-message', message);
    // Уведомляем админов
    if (senderType === 'user') {
      io.to('admins').emit('chat-notification', { orderId, text });
    }
  });

  // Индикатор печати
  socket.on('typing', (data) => {
    socket.to(`chat-${data.orderId}`).emit('user-typing', data);
  });

  // === WEBRTC SIGNALING ===
  socket.on('call-offer', (data) => {
    io.to(`chat-${data.orderId}`).emit('call-offer', { ...data, from: socket.id });
  });

  socket.on('call-answer', (data) => {
    io.to(data.to).emit('call-answer', { ...data, from: socket.id });
  });

  socket.on('ice-candidate', (data) => {
    if (data.to) {
      io.to(data.to).emit('ice-candidate', { candidate: data.candidate, from: socket.id });
    } else {
      socket.to(`chat-${data.orderId}`).emit('ice-candidate', { candidate: data.candidate, from: socket.id });
    }
  });

  socket.on('call-end', (data) => {
    io.to(`chat-${data.orderId}`).emit('call-ended', { from: socket.id });
  });

  socket.on('disconnect', () => {
    console.log('❌ Отключён:', socket.id);
  });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, () => {
  console.log(`\n🫖 Чайхана «Исфайрам» запущена!`);
  console.log(`📍 http://localhost:${PORT}`);
  console.log(`👨‍💼 Админка: http://localhost:${PORT}/admin.html`);
  console.log(`🔑 Пароль админа: admin123\n`);
});
