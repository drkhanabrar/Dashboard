/* ES5-compatible display renderer for older WebKit/iOS 9. */
(function () {
  'use strict';
  var root = document.getElementById('display-root');
  var errorBox = document.getElementById('display-error');
  var pathParts = window.location.pathname.split('/');
  var token = pathParts[pathParts.length - 1] || '';
  var intervals = [];
  var requestId = 0;

  function make(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (typeof text !== 'undefined' && text !== null) node.textContent = String(text);
    return node;
  }
  function clearIntervals() {
    var i;
    for (i = 0; i < intervals.length; i += 1) window.clearInterval(intervals[i]);
    intervals = [];
  }
  function showError(message) {
    errorBox.textContent = message || 'Unable to load this display.';
    errorBox.className = 'display-error';
    root.innerHTML = '';
  }
  function xhrJson(url, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      var data;
      try { data = JSON.parse(xhr.responseText || '{}'); } catch (e) { callback(new Error('The server returned invalid data.')); return; }
      if (xhr.status < 200 || xhr.status >= 300) { callback(new Error(data.error || 'Server request failed (' + xhr.status + ').')); return; }
      callback(null, data);
    };
    xhr.onerror = function () { callback(new Error('Could not contact the MirrorForge server. Check the connection.')); };
    xhr.send(null);
  }
  function setWidgetWidth(node, widget) {
    var width = window.innerWidth || document.documentElement.clientWidth || 1024;
    var span = Math.max(1, Math.min(12, Number(widget.grid && widget.grid.w) || 6));
    var cols = width <= 600 ? 1 : (width <= 950 ? 6 : 12);
    span = Math.min(span, cols);
    node.style.width = (100 * span / cols - 1.4) + '%';
    if (cols === 1) node.style.width = '100%';
  }
  function dateLabel(date, options) {
    try { return date.toLocaleDateString(undefined, options); } catch (e) { return date.toDateString(); }
  }
  function timeLabel(date, cfg) {
    var options = { hour: '2-digit', minute: '2-digit' };
    if (cfg && cfg.showSeconds) options.second = '2-digit';
    if (cfg && cfg.format24 === false) options.hour12 = true;
    else options.hour12 = false;
    try { return date.toLocaleTimeString(undefined, options); } catch (e) { return date.getHours() + ':' + ('0' + date.getMinutes()).slice(-2); }
  }
  function baseWidget(widget, css) {
    var box = make('article', 'display-widget' + (css ? ' ' + css : ''));
    if (widget.title && widget.type !== 'clock' && widget.type !== 'date') box.appendChild(make('p', 'widget-label', widget.title));
    return box;
  }
  function buildWidget(widget) {
    var cfg = widget.config || {};
    var box;
    var node;
    var date;
    var day;
    var tick;
    var interval;
    if (widget.type === 'clock') {
      box = baseWidget(widget, '');
      box.appendChild(make('p', 'widget-label', widget.title || 'LOCAL TIME'));
      node = make('div', 'widget-clock');
      box.appendChild(node);
      tick = function () { node.textContent = timeLabel(new Date(), cfg); };
      tick(); interval = window.setInterval(tick, 1000); intervals.push(interval);
      return box;
    }
    if (widget.type === 'date') {
      box = baseWidget(widget, '');
      box.appendChild(make('p', 'widget-label', widget.title || 'TODAY'));
      date = make('div', 'widget-date'); day = make('div', 'widget-date-sub');
      box.appendChild(date); box.appendChild(day);
      tick = function () { var now = new Date(); date.textContent = dateLabel(now, { weekday: 'long', month: 'long', day: 'numeric' }); day.textContent = dateLabel(now, { year: 'numeric' }).toUpperCase(); };
      tick(); return box;
    }
    if (widget.type === 'announcement') {
      box = baseWidget(widget, ''); box.appendChild(make('div', 'widget-announcement', cfg.text || '')); return box;
    }
    if (widget.type === 'notes') {
      box = baseWidget(widget, ''); box.appendChild(make('div', 'widget-note', cfg.text || '')); return box;
    }
    if (widget.type === 'photo') {
      box = baseWidget(widget, 'widget-photo');
      if (typeof cfg.url === 'string' && cfg.url.indexOf('/media/') === 0) {
        node = make('img'); node.src = cfg.url; node.alt = cfg.caption || widget.title || 'Display photo'; box.appendChild(node);
      } else {
        box.appendChild(make('div', 'photo-placeholder', cfg.url ? 'Use a local /media/ image URL' : 'Upload a photo in the administration dashboard'));
      }
      if (cfg.caption) box.appendChild(make('div', 'photo-caption', cfg.caption));
      return box;
    }
    if (widget.type === 'calendar') {
      box = baseWidget(widget, '');
      var now = new Date();
      box.appendChild(make('div', 'calendar-today', dateLabel(now, { weekday: 'long', month: 'long', day: 'numeric' })));
      var list = make('div', 'event-list');
      var events = Array.isArray(cfg.events) ? cfg.events.slice(0) : [];
      events = events.filter(function (event) { return event && event.date && event.title && String(event.date) >= now.getFullYear() + '-' + ('0' + (now.getMonth() + 1)).slice(-2) + '-' + ('0' + now.getDate()).slice(-2); });
      events.sort(function (a, b) { return String(a.date) < String(b.date) ? -1 : (String(a.date) > String(b.date) ? 1 : 0); });
      events = events.slice(0, 6);
      if (!events.length) list.appendChild(make('div', 'event-title', 'No upcoming events configured.'));
      events.forEach(function (ev) {
        var row = make('div', 'event-row');
        var evDate = new Date(String(ev.date) + 'T12:00:00');
        row.appendChild(make('div', 'event-day', dateLabel(evDate, { month: 'short', day: 'numeric' }).toUpperCase()));
        row.appendChild(make('div', 'event-title', ev.title)); list.appendChild(row);
      });
      box.appendChild(list); return box;
    }
    if (widget.type === 'weather') {
      box = baseWidget(widget, '');
      box.appendChild(make('p', 'widget-label', cfg.city || widget.title || 'WEATHER'));
      var top = make('div', 'weather-top');
      var icon = make('div', 'weather-icon', '☼'); var temp = make('div', 'weather-temp', '—°');
      top.appendChild(icon); top.appendChild(temp); box.appendChild(top);
      var details = make('div', 'weather-details', 'Loading weather…'); box.appendChild(details);
      if (isFinite(Number(cfg.latitude)) && isFinite(Number(cfg.longitude)) && cfg.city !== 'Set location') {
        xhrJson('/api/weather?latitude=' + encodeURIComponent(cfg.latitude) + '&longitude=' + encodeURIComponent(cfg.longitude), function (err, data) {
          if (err || !data.current) { details.textContent = 'Weather unavailable — check server connection and coordinates.'; return; }
          var code = Number(data.current.weather_code);
          var icons = { 0:'☀', 1:'🌤', 2:'⛅', 3:'☁', 45:'≋', 48:'≋', 51:'☂', 61:'☂', 63:'☂', 65:'☂', 71:'❄', 73:'❄', 75:'❄', 95:'ϟ' };
          icon.textContent = icons[code] || '☁'; temp.textContent = Math.round(Number(data.current.temperature_2m)) + '°';
          details.textContent = 'Feels ' + Math.round(Number(data.current.apparent_temperature)) + '° · Humidity ' + data.current.relative_humidity_2m + '%';
        });
      } else { details.textContent = 'Set city, latitude and longitude in widget settings.'; }
      return box;
    }
    box = baseWidget(widget, ''); box.appendChild(make('div', 'widget-note', 'Unsupported widget type.')); return box;
  }
  function loadDisplay() {
    var id = ++requestId;
    clearIntervals(); errorBox.className = 'display-error hidden';
    if (!token) { showError('This display URL is missing its device token.'); return; }
    xhrJson('/api/public/screens/' + encodeURIComponent(token) + '?legacy=1', function (err, data) {
      if (id !== requestId) return;
      if (err) { showError(err.message); return; }
      var screen = data.screen || {};
      var widgets = screen.widgets || [];
      document.title = (screen.name || 'MirrorForge') + ' - MirrorForge';
      root.innerHTML = '';
      if (!widgets.length) { root.appendChild(make('div', 'display-loading', 'This screen has no widgets yet. Add widgets in the administration dashboard.')); return; }
      widgets.forEach(function (widget) {
        var node = buildWidget(widget);
        node.setAttribute('data-grid-width', String(Math.max(1, Math.min(12, Number(widget.grid && widget.grid.w) || 6))));
        setWidgetWidth(node, widget);
        root.appendChild(node);
      });
    });
  }
  loadDisplay();
  window.setInterval(loadDisplay, 30000);
  window.addEventListener('resize', function () {
    var nodes = root.getElementsByClassName('display-widget');
    var i;
    for (i = 0; i < nodes.length; i += 1) {
      var gridWidth = 6;
      var dataId = nodes[i].getAttribute('data-grid-width');
      if (dataId) gridWidth = Number(dataId) || 6;
      var fake = { grid: { w: gridWidth } }; setWidgetWidth(nodes[i], fake);
    }
  });
}());
