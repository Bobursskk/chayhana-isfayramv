// Auth
const token = localStorage.getItem('chayhana_token');
const user = JSON.parse(localStorage.getItem('chayhana_user') || 'null');
const isAdmin = !!localStorage.getItem('chayhana_admin_token');
const senderType = isAdmin ? 'admin' : 'user';
const senderId = isAdmin ? 'admin' : user?.id;

if (!isAdmin && (!token || !user)) { window.location.href = '/login.html'; }

// Get order ID from URL
const params = new URLSearchParams(window.location.search);
const orderId = params.get('order');
if (!orderId) { window.location.href = '/order.html'; }

document.getElementById('chatOrderId').textContent = 'Заказ #' + orderId.slice(0, 8);

const socket = io();
socket.emit('join-chat', orderId);
if (isAdmin) socket.emit('join-admin');
else socket.emit('join-user', user.id);

const messagesEl = document.getElementById('chatMessages');
const chatEmpty = document.getElementById('chatEmpty');
const chatInput = document.getElementById('chatInput');

// Load messages
async function loadMessages() {
  try {
    const res = await fetch('/api/messages/' + orderId);
    const data = await res.json();
    if (data.messages && data.messages.length > 0) {
      chatEmpty.style.display = 'none';
      data.messages.forEach(m => appendMessage(m, false));
      scrollToBottom();
    }
  } catch (e) {}
}

function appendMessage(msg, scroll = true) {
  chatEmpty.style.display = 'none';
  const div = document.createElement('div');
  const isMine = msg.sender_type === senderType;
  div.className = 'msg ' + (isMine ? 'msg-user' : 'msg-admin');
  const time = new Date(msg.created_at).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
  div.innerHTML = `${msg.text}<span class="msg-time">${time}</span>`;
  messagesEl.appendChild(div);
  if (scroll) scrollToBottom();
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// Send message
function sendMessage() {
  const text = chatInput.value.trim();
  if (!text) return;
  socket.emit('send-message', { orderId, senderType, senderId, text });
  chatInput.value = '';
}

document.getElementById('sendBtn').addEventListener('click', sendMessage);
chatInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendMessage(); });

// Typing indicator
let typingTimeout;
chatInput.addEventListener('input', () => {
  socket.emit('typing', { orderId, senderType });
  clearTimeout(typingTimeout);
});

socket.on('user-typing', data => {
  if (data.senderType !== senderType) {
    const el = document.getElementById('typingIndicator');
    el.style.display = 'flex';
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => { el.style.display = 'none'; }, 2000);
  }
});

// Receive messages
socket.on('new-message', msg => { appendMessage(msg); });

// === WEBRTC CALLS ===
let peerConnection;
let localStream;
let callTimerInterval;
let callSeconds = 0;
let isMuted = false;
let currentCallType = 'audio';

const iceConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] };

// Audio call
document.getElementById('audioCallBtn').addEventListener('click', () => startCall('audio'));
document.getElementById('videoCallBtn').addEventListener('click', () => startCall('video'));

async function startCall(type) {
  currentCallType = type;
  try {
    const constraints = type === 'video' ? { audio: true, video: true } : { audio: true, video: false };
    localStream = await navigator.mediaDevices.getUserMedia(constraints);

    showCallScreen(type, 'Вызываем...');
    if (type === 'video') {
      document.getElementById('localVideo').srcObject = localStream;
      document.getElementById('callVideos').style.display = 'block';
      document.getElementById('camBtn').style.display = 'flex';
    }

    peerConnection = new RTCPeerConnection(iceConfig);
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    peerConnection.ontrack = e => {
      document.getElementById('remoteVideo').srcObject = e.streams[0];
      if (type === 'video') document.getElementById('callVideos').style.display = 'block';
      updateCallStatus('Соединено');
      startCallTimer();
    };

    peerConnection.onicecandidate = e => {
      if (e.candidate) {
        socket.emit('ice-candidate', { orderId, candidate: e.candidate });
      }
    };

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('call-offer', { orderId, offer, type });
  } catch (e) {
    alert('Не удалось получить доступ к микрофону/камере');
    hideCallScreen();
  }
}

// Incoming call
socket.on('call-offer', async data => {
  if (data.from === socket.id) return;
  currentCallType = data.type || 'audio';
  document.getElementById('incomingType').textContent = data.type === 'video' ? 'Видео звонок' : 'Аудио звонок';
  document.getElementById('incomingCall').style.display = 'flex';

  document.getElementById('acceptCallBtn').onclick = async () => {
    document.getElementById('incomingCall').style.display = 'none';
    try {
      const constraints = data.type === 'video' ? { audio: true, video: true } : { audio: true, video: false };
      localStream = await navigator.mediaDevices.getUserMedia(constraints);

      showCallScreen(data.type, 'Соединяем...');
      if (data.type === 'video') {
        document.getElementById('localVideo').srcObject = localStream;
        document.getElementById('callVideos').style.display = 'block';
        document.getElementById('camBtn').style.display = 'flex';
      }

      peerConnection = new RTCPeerConnection(iceConfig);
      localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

      peerConnection.ontrack = e => {
        document.getElementById('remoteVideo').srcObject = e.streams[0];
        if (data.type === 'video') document.getElementById('callVideos').style.display = 'block';
        updateCallStatus('Соединено');
        startCallTimer();
      };

      peerConnection.onicecandidate = e => {
        if (e.candidate) socket.emit('ice-candidate', { orderId, candidate: e.candidate, to: data.from });
      };

      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      socket.emit('call-answer', { orderId, answer, to: data.from });
    } catch (e) {
      alert('Ошибка подключения');
      hideCallScreen();
    }
  };

  document.getElementById('rejectCallBtn').onclick = () => {
    document.getElementById('incomingCall').style.display = 'none';
  };
});

socket.on('call-answer', async data => {
  if (peerConnection) {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    updateCallStatus('Соединено');
  }
});

socket.on('ice-candidate', async data => {
  if (peerConnection && data.candidate) {
    try { await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate)); } catch (e) {}
  }
});

socket.on('call-ended', () => { endCall(); });

// Call UI
function showCallScreen(type, status) {
  document.getElementById('callScreen').style.display = 'flex';
  document.getElementById('callTitle').textContent = type === 'video' ? 'Видео звонок' : 'Аудио звонок';
  document.getElementById('callStatus').textContent = status;
  document.getElementById('callTimer').textContent = '00:00';
}

function updateCallStatus(s) { document.getElementById('callStatus').textContent = s; }

function hideCallScreen() {
  document.getElementById('callScreen').style.display = 'none';
  document.getElementById('callVideos').style.display = 'none';
  document.getElementById('camBtn').style.display = 'none';
}

function startCallTimer() {
  callSeconds = 0;
  clearInterval(callTimerInterval);
  callTimerInterval = setInterval(() => {
    callSeconds++;
    const m = String(Math.floor(callSeconds / 60)).padStart(2, '0');
    const s = String(callSeconds % 60).padStart(2, '0');
    document.getElementById('callTimer').textContent = m + ':' + s;
  }, 1000);
}

function endCall() {
  if (localStream) localStream.getTracks().forEach(t => t.stop());
  if (peerConnection) { peerConnection.close(); peerConnection = null; }
  clearInterval(callTimerInterval);
  hideCallScreen();
  socket.emit('call-end', { orderId });
}

// Controls
document.getElementById('endCallBtn').addEventListener('click', endCall);

document.getElementById('muteBtn').addEventListener('click', () => {
  if (!localStream) return;
  isMuted = !isMuted;
  localStream.getAudioTracks().forEach(t => t.enabled = !isMuted);
  const btn = document.getElementById('muteBtn');
  btn.textContent = isMuted ? '🔇' : '🎤';
  btn.classList.toggle('muted', isMuted);
});

document.getElementById('camBtn').addEventListener('click', () => {
  if (!localStream) return;
  const videoTrack = localStream.getVideoTracks()[0];
  if (videoTrack) {
    videoTrack.enabled = !videoTrack.enabled;
    document.getElementById('camBtn').textContent = videoTrack.enabled ? '📷' : '🚫';
  }
});

loadMessages();
