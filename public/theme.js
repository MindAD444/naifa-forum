// theme.js — quản lý chế độ sáng/tối cho toàn site

// Theme stored in first-party cookie
function setCookie(name, value, days, opts = {}){
  let cookie = encodeURIComponent(name) + '=' + encodeURIComponent(value) + '; path=/';
  if (days) cookie += '; Max-Age=' + (days*24*60*60);
  if (opts.secure) cookie += '; Secure';
  if (opts.sameSite) cookie += '; SameSite=' + opts.sameSite;
  document.cookie = cookie;
}
function getCookie(name){
  const cookies = document.cookie ? document.cookie.split('; ') : [];
  for (let c of cookies){
    const idx = c.indexOf('=');
    const k = decodeURIComponent(c.substring(0, idx));
    const v = decodeURIComponent(c.substring(idx+1));
    if (k === name) return v;
  }
  return null;
}

// Apply saved theme from cookie
const body = document.body;
const saved = getCookie('theme');
if (saved === 'dark') body.classList.add('dark');

const toggle = document.getElementById('theme-toggle');
if (toggle) toggle.addEventListener('click', () => {
  body.classList.toggle('dark');
  setCookie('theme', body.classList.contains('dark') ? 'dark' : 'light', 365, { sameSite: 'Lax', secure: location.protocol === 'https:' });
});

