'use strict';
const root = document.getElementById('display-root');
const errorBox = document.getElementById('display-error');
const token = location.pathname.split('/').filter(Boolean).pop() || '';
let currentScreen;
const clockIntervals = new Set();
const element = (tag, className, text) => { const item = document.createElement(tag); if (className) item.className = className; if (text !== undefined) item.textContent = text; return item; };
function error(message) { errorBox.textContent = message; errorBox.classList.remove('hidden'); root.innerHTML = ''; }
function weatherLabel(code) {
  if (code === 0) return 'Clear sky'; if ([1,2,3].includes(code)) return 'Partly cloudy'; if ([45,48].includes(code)) return 'Fog';
  if ([51,53,55,56,57].includes(code)) return 'Drizzle'; if ([61,63,65,66,67,80,81,82].includes(code)) return 'Rain';
  if ([71,73,75,77,85,86].includes(code)) return 'Snow'; if ([95,96,99].includes(code)) return 'Thunderstorm'; return 'Current conditions';
}
function baseWidget(widget, css) { const box = element('article', `display-widget ${css || ''}`); box.dataset.widgetId = widget.id; if (widget.title && !['clock','date'].includes(widget.type)) box.append(element('p','widget-label',widget.title)); return box; }
function buildWidget(widget) {
  const cfg = widget.config || {};
  if (widget.type === 'clock') {
    const box = baseWidget(widget, 'widget-clock-card'); const label = element('p','widget-label',widget.title || 'LOCAL TIME'); const clock = element('div','widget-clock'); box.append(label, clock);
    const tick = () => { const now = new Date(); clock.textContent = now.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit',second:cfg.showSeconds?'2-digit':undefined,hour12:cfg.format24===false}); };
    tick(); const intervalId = setInterval(tick, 1000); clockIntervals.add(intervalId); return box;
  }
  if (widget.type === 'date') {
    const box = baseWidget(widget, 'widget-date-card'); box.append(element('p','widget-label',widget.title || 'TODAY'));
    const date = element('div','widget-date'); const day = element('div','widget-date-sub');
    const tick = () => { const now=new Date(); date.textContent=now.toLocaleDateString(cfg.locale||undefined,{weekday:'long',month:'long',day:'numeric'}); day.textContent=now.toLocaleDateString(cfg.locale||undefined,{year:'numeric'}).toUpperCase(); };
    tick(); box.append(date,day); return box;
  }
  if (widget.type === 'announcement') { const box=baseWidget(widget,''); box.append(element('div','widget-announcement',cfg.text || '')); return box; }
  if (widget.type === 'notes') { const box=baseWidget(widget,''); box.append(element('div','widget-note',cfg.text || '')); return box; }
  if (widget.type === 'photo') {
    const box=element('article','display-widget widget-photo');
    if (typeof cfg.url === 'string' && cfg.url.startsWith('/media/')) { const img=element('img'); img.src=cfg.url; img.alt=cfg.caption||widget.title||'Display photo'; box.append(img); }
    else { const placeholder=element('div','photo-placeholder'); placeholder.append(element('span','','▧'),element('div','',cfg.url?'Use a local /media/ path':'Upload a photo in Server settings')); box.append(placeholder); }
    if(cfg.caption){ const caption=element('div','photo-caption',cfg.caption); box.append(caption); } return box;
  }
  if (widget.type === 'calendar') {
    const box=baseWidget(widget,''); const today=new Date(); box.append(element('div','calendar-today',today.toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'})));
    const list=element('div','event-list'); const events=Array.isArray(cfg.events)?cfg.events.filter(e=>e&&e.date&&e.title&&String(e.date)>=today.toISOString().slice(0,10)).sort((a,b)=>String(a.date).localeCompare(String(b.date))).slice(0,6):[];
    if(!events.length) list.append(element('div','no-events','No upcoming events configured. Add events in this widget’s JSON settings.'));
    for(const ev of events){const row=element('div','event-row');row.append(element('div','event-day',new Date(`${ev.date}T12:00:00`).toLocaleDateString(undefined,{month:'short',day:'numeric'}).toUpperCase()),element('div','event-title',ev.title));list.append(row);} box.append(list); return box;
  }
  if (widget.type === 'weather') {
    const box=baseWidget(widget,''); const city=element('p','widget-label',cfg.city||widget.title||'WEATHER'); const top=element('div','weather-top');top.append(element('div','weather-icon','☼'),element('div','weather-temp','—°')); const details=element('div','weather-details','Loading weather…');box.append(city,top,details);
    if(Number.isFinite(Number(cfg.latitude))&&Number.isFinite(Number(cfg.longitude))&&cfg.city!=='Set location') {
      fetch(`/api/weather?latitude=${encodeURIComponent(cfg.latitude)}&longitude=${encodeURIComponent(cfg.longitude)}`).then(r=>r.json()).then(data=>{
        if(!data.current) throw new Error(data.error||'Weather unavailable');
        top.querySelector('.weather-icon').textContent=({0:'☀',1:'🌤',2:'⛅',3:'☁',45:'≋',48:'≋',51:'☂',61:'☂',63:'☂',65:'☂',71:'❄',73:'❄',75:'❄',95:'ϟ'})[data.current.weather_code]||'☁';
        top.querySelector('.weather-temp').textContent=`${Math.round(data.current.temperature_2m)}°`;
        details.textContent=`${weatherLabel(data.current.weather_code)}  ·  Feels ${Math.round(data.current.apparent_temperature)}°  ·  Humidity ${data.current.relative_humidity_2m}%`;
      }).catch(()=>{details.textContent='Weather unavailable — check server connection and coordinates.';});
    } else { details.textContent='Set city, latitude and longitude in widget settings.'; }
    return box;
  }
  const fallback=baseWidget(widget,'');fallback.append(element('div','widget-note','Unsupported widget type.'));return fallback;
}
async function load() {
  for (const intervalId of clockIntervals) clearInterval(intervalId);
  clockIntervals.clear();
  try {
    const response=await fetch(`/api/public/screens/${encodeURIComponent(token)}`,{cache:'no-store'});
    const data=await response.json(); if(!response.ok)throw new Error(data.error||'Could not load display.');
    currentScreen=data.screen;document.title=`${currentScreen.name} · MirrorForge`;root.innerHTML='';
    if(!currentScreen.widgets.length){root.append(element('div','display-loading','This screen has no widgets yet. Add widgets from the administration dashboard.'));return;}
    currentScreen.widgets.forEach(w=>{const box=buildWidget(w);const width=Math.max(1,Math.min(12,Number(w.grid?.w)||6));const height=Math.max(1,Math.min(8,Number(w.grid?.h)||2));box.style.gridColumn=`span ${width}`;box.style.gridRow=`span ${height}`;root.append(box);});
  } catch(err) { error(err.message); }
}
document.getElementById('display-fullscreen').addEventListener('click',async()=>{try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();else await document.exitFullscreen();}catch{}});
load();setInterval(load,30000);
