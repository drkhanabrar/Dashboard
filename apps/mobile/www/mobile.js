'use strict';
const urlInput = document.getElementById('server-url');
const forgetButton = document.getElementById('forget-button');
const errorMessage = document.getElementById('error-message');
const STORAGE_KEY = 'mirrorforge.serverUrl.v1';
const saved = localStorage.getItem(STORAGE_KEY);
if (saved) { urlInput.value = saved; forgetButton.classList.remove('hidden'); }
function normalizeUrl(raw) {
  let text = String(raw || '').trim();
  if (!text) throw new Error('Enter your server URL.');
  if (!/^https?:\/\//i.test(text)) text = `http://${text}`;
  let value;
  try { value = new URL(text); } catch { throw new Error('That server URL is not valid.'); }
  if (!['http:', 'https:'].includes(value.protocol)) throw new Error('Only HTTP and HTTPS server URLs are supported.');
  if (!value.hostname || value.username || value.password) throw new Error('Enter a host URL without embedded credentials.');
  if (value.hash) value.hash = '';
  return value.toString().replace(/\/$/, '');
}
document.getElementById('connect-form').addEventListener('submit', (event) => {
  event.preventDefault(); errorMessage.classList.add('hidden');
  try {
    const url = normalizeUrl(urlInput.value);
    localStorage.setItem(STORAGE_KEY, url); forgetButton.classList.remove('hidden');
    // Capacitor is configured to allow the destination chosen by the device owner.
    window.location.assign(url);
  } catch (err) { errorMessage.textContent = err.message; errorMessage.classList.remove('hidden'); }
});
forgetButton.addEventListener('click', () => { localStorage.removeItem(STORAGE_KEY); urlInput.value = ''; forgetButton.classList.add('hidden'); errorMessage.classList.add('hidden'); });
