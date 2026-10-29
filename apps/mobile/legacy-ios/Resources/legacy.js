/* ES5 only; kept intentionally compatible with old iOS WebKit. */
(function () {
  'use strict';
  var input = document.getElementById('server-url');
  var form = document.getElementById('connect-form');
  var forget = document.getElementById('forget-button');
  var error = document.getElementById('error-message');
  var key = 'mirrorforge.legacy.displayUrl.v1';
  var saved = null;
  try { saved = window.localStorage.getItem(key); } catch (e) { saved = null; }
  if (saved) { input.value = saved; forget.className = 'forget'; }

  function normalize(raw) {
    var text = String(raw || '').replace(/^\s+|\s+$/g, '');
    var anchor;
    var match;
    var path;
    if (!text) throw new Error('Enter the complete display URL.');
    if (!/^https?:\/\//i.test(text)) text = 'http://' + text;
    anchor = document.createElement('a');
    anchor.href = text;
    if (!anchor.hostname || !anchor.protocol || (anchor.protocol !== 'http:' && anchor.protocol !== 'https:')) throw new Error('Only HTTP and HTTPS display URLs are supported.');
    if (anchor.username || anchor.password) throw new Error('Do not include credentials in the URL.');
    path = (anchor.pathname || '').replace(/\/+$/, '');
    match = path.match(/\/(?:display|legacy-display)\/([A-Za-z0-9_-]+)$/);
    if (!match) throw new Error('Paste a full display link ending in /display/your-token.');
    return anchor.protocol + '//' + anchor.host + '/legacy-display/' + encodeURIComponent(match[1]);
  }
  form.addEventListener('submit', function (event) {
    var url;
    event.preventDefault();
    error.className = 'error hidden';
    try {
      url = normalize(input.value);
      try { window.localStorage.setItem(key, url); } catch (storageError) { /* Private browsing may disable storage. */ }
      window.location.href = url;
    } catch (e) {
      error.textContent = e.message || 'Could not open that display link.';
      error.className = 'error';
    }
  });
  forget.addEventListener('click', function () {
    try { window.localStorage.removeItem(key); } catch (e) { /* Ignore unavailable storage. */ }
    input.value = '';
    forget.className = 'forget hidden';
    error.className = 'error hidden';
  });
}());
