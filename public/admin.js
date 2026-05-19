let adminToken = localStorage.getItem('chayhana_admin_token');
let currentFilter = 'all';
let allOrders = [];
let socket;

// Check if already logged in
if (adminToken) { showPanel(); }

async function adminLogin() {
  const pw = document.getElementById('adminPassword').value;
  if (!pw) return;
  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw })
    });
    const data = await res.json();
    if (data.success) {
      adminToken = data.token;
      localStorage.setItem('chayhana_admin_token', adminToken);
      showPanel();
    } else {
      const el = document.getElementById('loginError');
      el.textContent = 'Неверный пароль'; el.classList.add('show');
      setTimeout(() => el.classList.remove('show'), 3000);
    }
  } catch (e) { alert('Ошибка сети'); }
}

document.getElementById('adminPassword').addEventListener('keydown', e => {
  if (e.key === 'Enter') adminLogin();
});

function adminLogout() {
  localStorage.removeItem('chayhana_admin_token');
  window.location.reload();
}

function showPanel() {
  document.getElementById('adminLogin').style.display = 'none';
  document.getElementById('adminPanel').style.display = 'block';
  initSocket();
  loadStats();
  loadOrders();
}

function initSocket() {
  socket = io();
  socket.emit('join-admin');

  socket.on('new-order', order => {
    allOrders.unshift(order);
    renderOrders();
    loadStats();
    // Play notification sound
    try { document.getElementById('notifSound').play(); } catch (e) {}
    // Highlight new order
    setTimeout(() => {
      const card = document.querySelector('.o-card');
      if (card) card.classList.add('highlight');
    }, 100);
  });
}

async function loadStats() {
  try {
    const res = await fetch('/api/orders/stats', { headers: { 'x-admin-token': adminToken } });
    const data = await res.json();
    if (data.stats) {
      document.getElementById('statOrders').textContent = data.stats.total_orders;
      document.getElementById('statRevenue').textContent = data.stats.total_revenue.toLocaleString();
      document.getElementById('statKg').textContent = data.stats.total_kg;
      document.getElementById('statNew').textContent = data.stats.new_orders;
    }
  } catch (e) {}
}

async function loadOrders() {
  try {
    const res = await fetch('/api/orders', { headers: { 'x-admin-token': adminToken } });
    const data = await res.json();
    allOrders = data.orders || [];
    renderOrders();
  } catch (e) {}
}

function setFilter(filter, btn) {
  currentFilter = filter;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderOrders();
}

function renderOrders() {
  const list = document.getElementById('ordersList');
  let orders = allOrders;
  if (currentFilter !== 'all') orders = orders.filter(o => o.status === currentFilter);

  if (orders.length === 0) {
    list.innerHTML = '<div class="empty">Нет заказов</div>';
    return;
  }

  const statusMap = {
    new: ['🟡 Новый', 's-new', 'cooking', '🔥 Готовить'],
    cooking: ['🟢 Готовится', 's-cooking', 'ready', '✅ Готов'],
    ready: ['🔵 Готов!', 's-ready', 'done', '📦 Выдан'],
    done: ['⚪ Выдан', 's-done', null, null]
  };

  list.innerHTML = orders.map(o => {
    const [statusText, statusClass, nextStatus, nextLabel] = statusMap[o.status] || ['—', '', null, null];
    const items = o.items.map(i => `${i.emoji} ${i.name} ${i.qty}кг`).join(', ');
    const date = new Date(o.created_at).toLocaleString('ru');
    const nextBtn = nextStatus ? `<button class="o-btn o-btn-next" onclick="changeStatus('${o.id}','${nextStatus}')">${nextLabel}</button>` : '';

    return `<div class="o-card">
      <div class="o-top">
        <span class="o-phone">📞 ${o.phone || '—'} ${o.user_name ? '(' + o.user_name + ')' : ''}</span>
        <span class="o-status ${statusClass}">${statusText}</span>
      </div>
      <div class="o-date">${date}</div>
      <div class="o-items">${items}</div>
      ${o.comment ? '<div class="o-comment">💬 ' + o.comment + '</div>' : ''}
      <div class="o-bottom">
        <span class="o-total">${o.total_price} сом (${o.total_kg} кг)</span>
        <div class="o-actions">
          ${nextBtn}
          <a href="/chat.html?order=${o.id}" class="o-btn o-btn-chat" onclick="localStorage.setItem('chayhana_admin_token','${adminToken}')">💬 Чат</a>
        </div>
      </div>
    </div>`;
  }).join('');
}

async function changeStatus(orderId, status) {
  try {
    const res = await fetch('/api/orders/' + orderId + '/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
      body: JSON.stringify({ status })
    });
    const data = await res.json();
    if (data.success) {
      const idx = allOrders.findIndex(o => o.id === orderId);
      if (idx >= 0) allOrders[idx] = data.order;
      renderOrders();
      loadStats();
    }
  } catch (e) {}
}
