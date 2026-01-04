let currentUser = null;
let activePostId = null;
let allComments = [];
let commentOffset = 0;
const firstLoad = 5;
const stepLoad = 3;


let lastScrollTop = 0; 
const navbar = document.querySelector(".navbar"); 

// Cookie helper utilities
function setCookie(name, value, days, opts = {}) {
  let cookie = encodeURIComponent(name) + '=' + encodeURIComponent(value) + '; path=/';
  if (days) {
    cookie += '; Max-Age=' + (days * 24 * 60 * 60);
  }
  if (opts.secure) cookie += '; Secure';
  if (opts.sameSite) cookie += '; SameSite=' + opts.sameSite;
  if (opts.domain) cookie += '; Domain=' + opts.domain;
  document.cookie = cookie;
}

function getCookie(name) {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()\[\]\\\/\+^])/g, '\\$1') + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

function eraseCookie(name) {
  document.cookie = encodeURIComponent(name) + '=; Max-Age=0; path=/';
}

// Migrate auth data from localStorage to cookies (safe, idempotent). Keeps localStorage as fallback.
function migrateLocalStorageToCookies() {
  try {
    const keys = ['token','username','userId','role','avatar'];
    const DEFAULT_AVATAR = 'https://cdn.britannica.com/99/236599-050-1199AD2C/Mark-Zuckerberg-2019.jpg';
    keys.forEach(k => {
      const v = localStorage.getItem(k);
      if (v) {
        // token: keep shorter expiry (7d), others keep 30d
        if (k === 'token') setCookie(k, v, 7, { secure: location.protocol === 'https:', sameSite: 'Lax' });
        else if (k === 'avatar') setCookie(k, v || DEFAULT_AVATAR, 30, { sameSite: 'Lax' });
        else setCookie(k, v, 30, { sameSite: 'Lax' });
      }
    });
  } catch (e) { console.warn('Migration to cookies failed', e); }
}

window.addEventListener("scroll", function() {
  if (!navbar) return;
  let currentScroll = window.pageYOffset || document.documentElement.scrollTop;
  if (currentScroll > 50) { 
    if (currentScroll > lastScrollTop) {
      navbar.classList.add("navbar-hidden");
    } else {
      navbar.classList.remove("navbar-hidden");
    }
  } else {
    navbar.classList.remove("navbar-hidden");
  }
  lastScrollTop = currentScroll <= 0 ? 0 : currentScroll; 
}, false);



document.addEventListener("DOMContentLoaded", () => {
  migrateLocalStorageToCookies();
  checkLoginStatus();


  const hamburgerBtn = document.getElementById("hamburger-btn");
  const sidebar = document.getElementById("sidebar");
  const closeSidebarBtn = document.getElementById("close-sidebar-btn");
  const overlay = document.getElementById("sidebar-overlay");

  function openSidebar() {
    sidebar.classList.add("open");
    overlay.classList.add("open");
  }

  function closeSidebar() {
    sidebar.classList.remove("open");
    overlay.classList.remove("open");
  }

  if (hamburgerBtn) hamburgerBtn.addEventListener("click", openSidebar);
  if (closeSidebarBtn) closeSidebarBtn.addEventListener("click", closeSidebar);
  if (overlay) overlay.addEventListener("click", closeSidebar);




  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) logoutBtn.addEventListener("click", logout);

  const closePopup = document.getElementById("close-popup");
  if (closePopup) closePopup.onclick = () => {
    const cp = document.getElementById("comment-popup");
    if (cp) cp.classList.add("hidden");
  };

  const loadMoreCommentsBtn = document.getElementById("load-more-comments");
  if (loadMoreCommentsBtn) loadMoreCommentsBtn.onclick = () => loadCommentChunk();
});

function checkLoginStatus() {
  // First try legacy localStorage (migration fallback)
  const token = localStorage.getItem("token");
  const username = localStorage.getItem("username");
  const role = localStorage.getItem("role");
  const loginLink = document.getElementById("login-link");
  const registerLink = document.getElementById("register-link");
  const userDisplaySidebar = document.getElementById("username-display-sidebar");
  const adminLink = document.getElementById("admin-link");
  const createLink = document.getElementById("create-link");
  const profileLink = document.getElementById("profile-link");
  const navAvatar = document.getElementById("nav-avatar");
  const logoutNav = document.getElementById('logout-nav');
  const sidebarAuth = document.getElementById('sidebar-auth');
  const sidebarGuest = document.getElementById('sidebar-guest');

  if (token && username) {
    // Legacy behavior while migrating
    if (loginLink) loginLink.classList.add("hidden");
    if (registerLink) registerLink.classList.add("hidden");
    if (userDisplaySidebar) userDisplaySidebar.textContent = username;
    if (profileLink) profileLink.classList.remove('hidden');
    const DEFAULT_AVATAR = 'https://cdn.britannica.com/99/236599-050-1199AD2C/Mark-Zuckerberg-2019.jpg';
    const avatar = localStorage.getItem('avatar') || getCookie('avatar') || DEFAULT_AVATAR || `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=random`;
    if (navAvatar) navAvatar.src = avatar;
    if (createLink) createLink.classList.remove("hidden");
    if (userDisplaySidebar) userDisplaySidebar.textContent = `Xin chào, ${username}!`;
    if (sidebarAuth) sidebarAuth.classList.remove('hidden');
    if (sidebarGuest) sidebarGuest.classList.add('hidden');

    if (role === "admin" && adminLink) {
      adminLink.classList.remove("hidden");
    }
    if (logoutNav) { logoutNav.classList.remove('hidden'); logoutNav.onclick = () => { if (confirm('Đăng xuất?')) logout(); } }
    return;
  }

  // No legacy token, try server-side session (HttpOnly cookie)
  fetch('/auth/me', { credentials: 'include' }).then(r => {
    if (!r.ok) throw r;
    return r.json();
  }).then(user => {
    const uname = user.username;
    const urole = user.role;
    const avatar = user.avatar || getCookie('avatar') || '';
    if (loginLink) loginLink.classList.add('hidden');
    if (registerLink) registerLink.classList.add('hidden');
    if (userDisplaySidebar) userDisplaySidebar.textContent = uname;
    if (profileLink) { profileLink.classList.remove('hidden'); profileLink.href = `/@${user.uuid || user._id}`; }
    if (createLink) createLink.classList.remove('hidden');
    if (userDisplaySidebar) userDisplaySidebar.textContent = `Xin chào, ${uname}!`;
    if (sidebarAuth) sidebarAuth.classList.remove('hidden');
    if (sidebarGuest) sidebarGuest.classList.add('hidden');
    if (navAvatar) navAvatar.src = avatar;
    if (urole === 'admin' && adminLink) adminLink.classList.remove('hidden');
    if (logoutNav) { logoutNav.classList.remove('hidden'); logoutNav.onclick = () => { if (confirm('Đăng xuất?')) logout(); } }
  }).catch(() => {
    if (adminLink) adminLink.classList.add("hidden");
    if (createLink) createLink.classList.add("hidden");
    if (sidebarAuth) sidebarAuth.classList.add('hidden');
    if (sidebarGuest) sidebarGuest.classList.remove('hidden');
    if (profileLink) profileLink.classList.add('hidden');
    if (navAvatar) navAvatar.src = '';
    if (logoutNav) logoutNav.classList.add('hidden');
  });
}

function handleAuthError(response) {
  if (response.status === 401 || response.status === 403) {
    alert("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại!");
    
    // clear both localStorage and cookies
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    localStorage.removeItem("userId");
    localStorage.removeItem("role");
    eraseCookie('token'); eraseCookie('username'); eraseCookie('userId'); eraseCookie('role'); eraseCookie('avatar');

    window.location.href = "login.html";
    return true;
  }
  return false;
}
function logout() {
  // Ask server to clear HttpOnly cookie, then clear client-side data
  fetch('/auth/logout', { method: 'POST', credentials: 'include' }).finally(() => {
    eraseCookie('token'); eraseCookie('username'); eraseCookie('userId'); eraseCookie('role'); eraseCookie('avatar');
    localStorage.clear();
    location.reload();
  });
}

// Fallback delegation: ensure hamburger/close/overlay clicks toggle sidebar
document.addEventListener('click', (e) => {
  const target = e.target;
  // robust closest lookup: handle text nodes in older browsers
  const hamburger = (target && target.closest) ? target.closest('#hamburger-btn') : null;
  const closeBtn = (target && target.closest) ? target.closest('#close-sidebar-btn') : null;
  const overlayClicked = (target && target.closest) ? target.closest('#sidebar-overlay') : null;

  // fallback: if closest isn't available or didn't find, try element containment
  const hbEl = document.getElementById('hamburger-btn');
  const closeEl = document.getElementById('close-sidebar-btn');
  const overlayEl = document.getElementById('sidebar-overlay');
  const sidebar = document.getElementById('sidebar');

  const isHamburger = hamburger || (hbEl && (hbEl === target || hbEl.contains(target)));
  const isClose = closeBtn || (closeEl && (closeEl === target || closeEl.contains(target)));
  const isOverlay = overlayClicked || (overlayEl && (overlayEl === target || overlayEl.contains(target)));

  if (isHamburger) {
    if (sidebar) sidebar.classList.add('open');
    if (overlayEl) overlayEl.classList.add('open');
  }
  if (isClose || isOverlay) {
    if (sidebar) sidebar.classList.remove('open');
    if (overlayEl) overlayEl.classList.remove('open');
  }
});
