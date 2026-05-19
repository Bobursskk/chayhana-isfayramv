let currentPhone = '';
let timerInterval;

const token = localStorage.getItem('chayhana_token');
if (token) {
  fetch('/api/auth/me', { headers: { 'Authorization': 'Bearer ' + token } })
    .then(r => r.json())
    .then(data => { if (data.user) window.location.href = '/order.html'; })
    .catch(() => {});
}

function showError(msg) {
  const el = document.getElementById('errorMsg');
  el.textContent = msg; el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 4000);
}

function goToStep(n) {
  document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
  document.getElementById('step' + n).classList.add('active');
}

async function sendCode() {
  const country = document.getElementById('countryCode').value;
  const phone = document.getElementById('phoneInput').value.replace(/\s/g, '');
  if (!phone || phone.length < 5) return showError('Введите номер телефона');
  currentPhone = country + phone;
  const btn = document.getElementById('sendCodeBtn');
  btn.disabled = true; btn.textContent = 'Отправляем...';
  try {
    const res = await fetch('/api/auth/send-code', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: currentPhone })
    });
    const data = await res.json();
    if (data.success) {
      const demoCodeEl = document.getElementById('demoCode');
      if (data.demo_code) {
        demoCodeEl.style.display = 'block';
        document.getElementById('demoCodeValue').textContent = data.demo_code;
      } else {
        demoCodeEl.style.display = 'none';
      }
      goToStep(2); startTimer();
      document.querySelector('.code-input').focus();
    } else { showError(data.error || 'Ошибка'); }
  } catch (e) { showError('Ошибка сети'); }
  btn.disabled = false; btn.textContent = 'Получить код';
}

function startTimer() {
  let sec = 300; clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    sec--;
    const m = Math.floor(sec / 60), s = sec % 60;
    document.getElementById('timer').textContent = `Код действует: ${m}:${String(s).padStart(2, '0')}`;
    if (sec <= 0) { clearInterval(timerInterval); document.getElementById('timer').textContent = 'Код истёк'; }
  }, 1000);
}

document.querySelectorAll('.code-input').forEach((input, i, all) => {
  input.addEventListener('input', e => {
    if (e.target.value && i < all.length - 1) all[i + 1].focus();
    if (e.target.value && i === all.length - 1) verifyCode();
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Backspace' && !e.target.value && i > 0) all[i - 1].focus();
  });
  input.addEventListener('paste', e => {
    e.preventDefault();
    const paste = (e.clipboardData || window.clipboardData).getData('text').trim();
    if (paste.length === 6) {
      all.forEach((inp, j) => inp.value = paste[j] || '');
      all[5].focus(); setTimeout(verifyCode, 200);
    }
  });
});

async function verifyCode() {
  const code = Array.from(document.querySelectorAll('.code-input')).map(i => i.value).join('');
  if (code.length !== 6) return showError('Введите 6-значный код');
  const btn = document.getElementById('verifyBtn');
  btn.disabled = true; btn.textContent = 'Проверяем...';
  try {
    const res = await fetch('/api/auth/verify-code', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: currentPhone, code })
    });
    const data = await res.json();
    if (data.success) {
      localStorage.setItem('chayhana_token', data.token);
      localStorage.setItem('chayhana_user', JSON.stringify(data.user));
      clearInterval(timerInterval);
      if (!data.user.name) goToStep(3); else window.location.href = '/order.html';
    } else { showError(data.error || 'Неверный код'); }
  } catch (e) { showError('Ошибка сети'); }
  btn.disabled = false; btn.textContent = 'Подтвердить';
}

async function saveName() {
  const name = document.getElementById('nameInput').value.trim();
  if (!name) return showError('Введите имя');
  const token = localStorage.getItem('chayhana_token');
  await fetch('/api/auth/update-name', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
    body: JSON.stringify({ name })
  });
  const user = JSON.parse(localStorage.getItem('chayhana_user'));
  user.name = name; localStorage.setItem('chayhana_user', JSON.stringify(user));
  window.location.href = '/order.html';
}

document.getElementById('phoneInput').addEventListener('keydown', e => { if (e.key === 'Enter') sendCode(); });
