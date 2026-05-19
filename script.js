// === МЕНЮ ===
const menuItems = [
  { name: "Плов", desc: "Настоящий узбекский, на кг", emoji: "🍚", price: "650 сом/кг" },
  { name: "Лагман", desc: "Густой, домашний, на кг", emoji: "🍜", price: "650 сом/кг" },
  { name: "Манты", desc: "Сочные, на пару, на кг", emoji: "🥟", price: "650 сом/кг" },
  { name: "Самса", desc: "Из тандыра, горячая", emoji: "🥟", price: "650 сом/кг" },
  { name: "Шашлык", desc: "На углях, свежее мясо, на кг", emoji: "🥩", price: "650 сом/кг" },
  { name: "Чай", desc: "Зелёный / чёрный", emoji: "🍵", price: "—" },
];

const menuGrid = document.getElementById('menuGrid');

function renderMenu() {
  menuGrid.innerHTML = '';
  menuItems.forEach((item, i) => {
    const card = document.createElement('div');
    card.className = 'menu-card anim';
    card.style.transitionDelay = `${i * 80}ms`;
    card.innerHTML = `
      <div class="menu-emoji">${item.emoji}</div>
      <div class="menu-header">
        <span class="menu-name">${item.name}</span>
        <span class="menu-price">${item.price}</span>
      </div>
      <p class="menu-desc">${item.desc}</p>
    `;
    menuGrid.appendChild(card);
  });
  observeAll();
}

renderMenu();

// === SCROLL ANIMATIONS ===
function observeAll() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('show');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.anim').forEach(el => observer.observe(el));
}

// Add anim classes to titles
document.querySelectorAll('.section-title, .section-sub').forEach(el => el.classList.add('anim'));
document.querySelectorAll('.c-card').forEach((el, i) => {
  el.style.transitionDelay = `${i * 80}ms`;
});
observeAll();

// === БУРГЕР ===
const burger = document.getElementById('burger');
const navLinks = document.getElementById('navLinks');

burger.addEventListener('click', () => {
  burger.classList.toggle('active');
  navLinks.classList.toggle('open');
});

document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', () => {
    burger.classList.remove('active');
    navLinks.classList.remove('open');
  });
});

// === NAVBAR SCROLL ===
const navbar = document.getElementById('navbar');
let lastScroll = 0;

window.addEventListener('scroll', () => {
  const current = window.scrollY;

  // Добавляем тень при скролле
  if (current > 10) {
    navbar.classList.add('scrolled');
  } else {
    navbar.classList.remove('scrolled');
  }

  // Прячем навбар при скролле вниз
  if (current > 100 && current > lastScroll) {
    navbar.style.transform = 'translateY(-100%)';
  } else {
    navbar.style.transform = 'translateY(0)';
  }
  lastScroll = current;
});

// === SCROLL TOP BUTTON ===
const scrollTopBtn = document.getElementById('scrollTop');

window.addEventListener('scroll', () => {
  if (window.scrollY > 400) {
    scrollTopBtn.classList.add('visible');
  } else {
    scrollTopBtn.classList.remove('visible');
  }
});

scrollTopBtn.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
