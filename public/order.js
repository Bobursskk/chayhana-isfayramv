// Auth check
const token = localStorage.getItem('chayhana_token');
const user = JSON.parse(localStorage.getItem('chayhana_user') || 'null');
if (!token || !user) { window.location.href = '/login.html'; }

document.getElementById('navUser').textContent = '👤 ' + (user?.name || user?.phone || '');
document.getElementById('logoutBtn').onclick = (e) => {
  e.preventDefault();
  localStorage.removeItem('chayhana_token');
  localStorage.removeItem('chayhana_user');
  window.location.href = '/login.html';
};

const socket = io();
socket.emit('join-user', user.id);

// Menu
const menuItems = [
  { id: 'plov', name: 'Плов', desc: 'Настоящий, на кг', emoji: '🍚', price: 650 },
  { id: 'lagman', name: 'Лагман', desc: 'Густой, домашний, на кг', emoji: '🍜', price: 650 },
  { id: 'manty', name: 'Манты', desc: 'Сочные, на пару, на кг', emoji: '🥟', price: 650 },
  { id: 'samsa', name: 'Самса', desc: 'Из тандыра, горячая', emoji: '🥟', price: 650 },
  { id: 'shashlik', name: 'Шашлык', desc: 'На углях, свежее мясо, на кг', emoji: '🥩', price: 650 },
  { id: 'tea', name: 'Чай', desc: 'Зелёный / чёрный', emoji: '🍵', price: 0 },
];

const cart = {};
const menuGrid = document.getElementById('menuGrid');

function renderMenu() {
  menuGrid.innerHTML = '';
  menuItems.forEach(item => {
    const qty = cart[item.id] || 0;
    const card = document.createElement('div');
    card.className = 'm-card';
    card.innerHTML = `
      <div class="m-card-top">
        <span class="m-emoji">${item.emoji}</span>
        <div class="m-info"><h3>${item.name}</h3><p>${item.desc}</p></div>
      </div>
      <div class="m-price">${item.price > 0 ? item.price + ' сом/кг' : 'Бесплатно'}</div>
      <div class="m-controls">
        <button class="m-btn" onclick="changeQty('${item.id}',-0.5)">−</button>
        <span class="m-qty">${qty > 0 ? qty + ' <span class="m-kg">кг</span>' : '—'}</span>
        <button class="m-btn" onclick="changeQty('${item.id}',0.5)">+</button>
      </div>
    `;
    menuGrid.appendChild(card);
  });
}

function changeQty(id, delta) {
  const current = cart[id] || 0;
  const newQty = Math.max(0, +(current + delta).toFixed(1));
  if (newQty === 0) delete cart[id];
  else cart[id] = newQty;
  renderMenu();
  renderCart();
}

function renderCart() {
  const cartEl = document.getElementById('cart');
  const cartItemsEl = document.getElementById('cartItems');
  const keys = Object.keys(cart);

  if (keys.length === 0) { cartEl.style.display = 'none'; return; }
  cartEl.style.display = 'block';

  let totalPrice = 0, totalKg = 0;
  cartItemsEl.innerHTML = '';

  keys.forEach(id => {
    const item = menuItems.find(m => m.id === id);
    const qty = cart[id];
    const sum = item.price * qty;
    totalPrice += sum;
    totalKg += qty;
    cartItemsEl.innerHTML += `<div class="cart-item"><span>${item.emoji} ${item.name} × ${qty} кг</span><span>${sum > 0 ? sum + ' сом' : 'Бесплатно'}</span></div>`;
  });

  document.getElementById('cartTotal').textContent = totalPrice + ' сом';
}

async function submitOrder() {
  const keys = Object.keys(cart);
  if (keys.length === 0) return;

  const btn = document.getElementById('orderBtn');
  btn.disabled = true; btn.textContent = 'Отправляем...';

  const items = keys.map(id => {
    const item = menuItems.find(m => m.id === id);
    return { id, name: item.name, emoji: item.emoji, qty: cart[id], price: item.price, sum: item.price * cart[id] };
  });
  const totalKg = items.reduce((s, i) => s + i.qty, 0);
  const totalPrice = items.reduce((s, i) => s + i.sum, 0);
  const comment = document.getElementById('cartComment').value;

  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ items, totalKg, totalPrice, comment })
    });
    const data = await res.json();
    if (data.success) {
      Object.keys(cart).forEach(k => delete cart[k]);
      renderMenu(); renderCart();
      document.getElementById('cartComment').value = '';
      loadMyOrders();
      alert('✅ Заказ отправлен!');
    }
  } catch (e) { alert('Ошибка отправки'); }
  btn.disabled = false; btn.textContent = 'Отправить заказ';
}

// My orders
async function loadMyOrders() {
  try {
    const res = await fetch('/api/orders/my', { headers: { 'Authorization': 'Bearer ' + token } });
    const data = await res.json();
    const list = document.getElementById('ordersList');
    if (!data.orders || data.orders.length === 0) {
      list.innerHTML = '<div class="empty-orders">У вас пока нет заказов</div>';
      return;
    }
    list.innerHTML = data.orders.map(o => {
      const statusMap = { new: ['Новый', 'status-new'], cooking: ['Готовится', 'status-cooking'], ready: ['Готов!', 'status-ready'], done: ['Выдан', 'status-done'] };
      const [statusText, statusClass] = statusMap[o.status] || ['—', ''];
      const itemsText = o.items.map(i => `${i.emoji} ${i.name} ${i.qty}кг`).join(', ');
      const date = new Date(o.created_at).toLocaleString('ru');
      return `<div class="order-card">
        <div class="order-top"><span class="order-id">${date}</span><span class="order-status ${statusClass}">${statusText}</span></div>
        <div class="order-items">${itemsText}</div>
        <div class="order-bottom"><span class="order-total">${o.total_price} сом</span>
        <a href="/chat.html?order=${o.id}" class="order-chat-btn">💬 Чат</a></div>
      </div>`;
    }).join('');
  } catch (e) {}
}

// Realtime order status updates
socket.on('order-status-updated', data => {
  loadMyOrders();
});

renderMenu();
loadMyOrders();
