import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {feature} from './vendor/topojson/topojson-client.js';
import {mountOpeningArtwork} from './opening-art.js';

const $ = id => document.getElementById(id);
const slides = [...document.querySelectorAll('.slide')];
const slideLabels = ['The consequences', 'What determines them?', 'One breakup', 'What remains unknown?'];
const initialParams = new URLSearchParams(location.search);
const presentMode = initialParams.get('mode') === 'present';
if (presentMode) {
  document.body.classList.add('presentation');
  document.body.classList.remove('review');
}
const horizon = 2920;
const earthRadius = 6371000;
const mu = 3.986004418e14;
const tau = Math.PI * 2;
const timelineStops = [[0, 0], [220, 2], [420, 30], [610, 365], [770, 730], [1000, horizon]];
let data, slide = 1, altitude = 550, day = 0, clockPos = 0;
let lastFrame = 0, scene3d, endHold = 0;
let factorBeat = 0, closingBeat = 0;
let comments = [], spotMode = false, showArchived = false, draft = null;

function dayText(value) {
  if (value < 1 / 240) return 'Event · 0 h';
  if (value < 2) return (value * 24).toFixed(value < .4 ? 1 : 0) + ' h after breakup';
  if (value < 365) return 'Day ' + Math.round(value);
  return 'Year ' + (value / 365).toFixed(1);
}
function clockToDay(value) {
  for (let i = 1; i < timelineStops.length; i++) {
    const [p1, d1] = timelineStops[i], [p0, d0] = timelineStops[i - 1];
    if (value <= p1) return d0 + (d1 - d0) * (value - p0) / (p1 - p0);
  }
  return horizon;
}
function dayToClock(value) {
  for (let i = 1; i < timelineStops.length; i++) {
    const [p1, d1] = timelineStops[i], [p0, d0] = timelineStops[i - 1];
    if (value <= d1) return p0 + (p1 - p0) * (value - d0) / (d1 - d0);
  }
  return 1000;
}
function showError(message) {
  $('error').hidden = false;
  $('error').textContent = message;
}
async function request(url, body) {
  const res = await fetch(url, {method: body ? 'POST' : 'GET',
    headers: body ? {'Content-Type': 'application/json'} : {},
    body: body ? JSON.stringify(body) : undefined, cache: 'no-store'});
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || 'Request failed ' + res.status);
  return result;
}
function revealCards() {
  document.querySelectorAll('.factorGrid .factor').forEach((card, index) => { card.hidden = index > factorBeat; });
  document.querySelectorAll('.closingGrid article').forEach((card, index) => { card.hidden = index > closingBeat; });
}
function navigate(n, fromDirection = 0) {
  const previousSlide = slide;
  slide = Math.max(1, Math.min(slides.length, n));
  if (slide === 2) factorBeat = fromDirection < 0 ? 2 : 0;
  if (slide === 4) closingBeat = fromDirection < 0 ? 1 : 0;
  revealCards();
  document.body.dataset.slide = String(slide);
  slides.forEach((el, index) => el.classList.toggle('active', index + 1 === slide));
  for (const button of $('reviewSteps').children)
    button.setAttribute('aria-current', Number(button.dataset.slide) === slide ? 'step' : 'false');
  if (slide === 3) {
    if (previousSlide !== 3) {endHold = 0; setClockPos(0);}
    $('demo').hidden = false;
    $('slot3').append($('demo'));
    requestAnimationFrame(() => { scene3d?.resize(); renderAll(); });
  } else {
    $('demo').hidden = true;
    $('stage').append($('demo'));
  }
  placePins();
}
function advance(direction) {
  if (slide === 2 && factorBeat + direction >= 0 && factorBeat + direction < 3) {
    factorBeat += direction; revealCards(); return;
  }
  if (slide === 4 && closingBeat + direction >= 0 && closingBeat + direction < 2) {
    closingBeat += direction; revealCards(); return;
  }
  navigate(slide + direction, direction);
}
function setupNavigation() {
  slideLabels.forEach((label, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = (index + 1) + ' · ' + label;
    button.dataset.slide = String(index + 1);
    button.onclick = () => navigate(index + 1);
    $('reviewSteps').append(button);
  });
  window.addEventListener('keydown', event => {
    if (event.target.closest('textarea,input,button,select,summary,iframe')) return;
    if (event.key === 'ArrowRight' || event.key === ' ') {
      event.preventDefault();
      advance(1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      advance(-1);
    }
  });
  for (const selector of ['.factors','.closing']) document.querySelector(selector).addEventListener('click', event => {
    if (!spotMode && !event.target.closest('button,a,input,select')) advance(1);
  });
  navigate(Number(initialParams.get('slide')) || 1);
}
function geographicPoint(lon, lat, radius) {
  const phi = lat * Math.PI / 180, theta = lon * Math.PI / 180;
  return new THREE.Vector3(radius * Math.cos(phi) * Math.cos(theta),
    radius * Math.cos(phi) * Math.sin(theta), radius * Math.sin(phi));
}
async function earthBorders() {
  const response = await fetch('./vendor/countries-50m.json');
  if (!response.ok) throw new Error('Earth geography unavailable');
  const topology = await response.json();
  const countries = feature(topology, topology.objects.countries).features;
  const points = [], seen = new Set();
  const key = p => p[0].toFixed(5) + ',' + p[1].toFixed(5);
  for (const country of countries) {
    const geometry = country.geometry;
    const rings = geometry.type === 'Polygon' ? geometry.coordinates
      : geometry.type === 'MultiPolygon' ? geometry.coordinates.flat() : [];
    for (const ring of rings) for (let i = 1; i < ring.length; i++) {
      const a = ring[i - 1], b = ring[i];
      const edge = [key(a), key(b)].sort().join('|');
      if (seen.has(edge)) continue;
      seen.add(edge);
      const first = geographicPoint(a[0], a[1], 1.003);
      const last = geographicPoint(b[0], b[1], 1.003);
      const angle = first.angleTo(last);
      if (angle > 25 * Math.PI / 180) continue;
      const steps = Math.max(1, Math.ceil(angle * 180 / Math.PI));
      let previous = first;
      for (let j = 1; j <= steps; j++) {
        const next = first.clone().lerp(last, j / steps).normalize().multiplyScalar(1.003);
        points.push(...previous.toArray(), ...next.toArray());
        previous = next;
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  return new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({
    color: 0x626262, transparent: true, opacity: .82, depthWrite: false
  }));
}
function findBracket(days, value) {
  let lo = 0, hi = days.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (days[mid] <= value) lo = mid;
    else hi = mid;
  }
  const next = Math.min(lo + 1, days.length - 1);
  return [lo, next, (value - days[lo]) / Math.max(1e-9, days[next] - days[lo])];
}
function fragmentPosition(fragment, bracket, value) {
  if (fragment.decayDay !== null && fragment.decayDay <= value) return null;
  const [i, j, f] = bracket, x = fragment.states[i], y = fragment.states[j];
  if (!x) return null;
  const state = x.map((number, k) => {
    if (y) return number + (y[k] - number) * f;
    // The last valid snapshot precedes reentry. Advance its Kepler phase
    // to the recorded reentry time instead of freezing the point in place.
    return k === 2 ? number + Math.sqrt(mu / Math.pow(x[0] * 1000, 3)) *
      (value - data.days[i]) * 86400 : number;
  });
  const a = state[0] * 1000, e = state[1];
  const meanAnomaly = ((state[2] % tau) + tau) % tau;
  let eccentricAnomaly = meanAnomaly;
  for (let k = 0; k < 6; k++)
    eccentricAnomaly -= (eccentricAnomaly - e * Math.sin(eccentricAnomaly) - meanAnomaly)
      / (1 - e * Math.cos(eccentricAnomaly));
  const trueAnomaly = Math.atan2(Math.sqrt(Math.max(0, 1 - e * e)) *
    Math.sin(eccentricAnomaly), Math.cos(eccentricAnomaly) - e);
  const radius = a * (1 - e * Math.cos(eccentricAnomaly));
  const argument = state[4] + trueAnomaly;
  const x0 = radius * Math.cos(argument), y0 = radius * Math.sin(argument) * fragment.cosI;
  const node = state[3], cn = Math.cos(node), sn = Math.sin(node);
  return {x: (cn * x0 - sn * y0) / earthRadius,
    y: (sn * x0 + cn * y0) / earthRadius,
    z: radius * Math.sin(argument) * Math.sqrt(1 - fragment.cosI ** 2) / earthRadius,
    altKm: (radius - earthRadius) / 1000};
}
function dotTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.beginPath(); ctx.arc(32, 32, 24, 0, tau); ctx.fillStyle = '#292722'; ctx.fill();
  ctx.beginPath(); ctx.arc(32, 32, 19, 0, tau); ctx.fillStyle = '#eaaa00'; ctx.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
function buildScene() {
  const host = $('globe3d'), scene = new THREE.Scene();
  scene.background = new THREE.Color('#fffcf6');
  const camera = new THREE.PerspectiveCamera(28, 1, .05, 100);
  camera.up.set(0, 0, 1);
  camera.position.set(1.05, -4.0, 2.9);
  camera.lookAt(0, 0, 0);
  const renderer = new THREE.WebGLRenderer({antialias: true, alpha: false, powerPreference: 'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.append(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = .07;
  controls.minDistance = 2.35;
  controls.maxDistance = 10;
  controls.enablePan = false;
  const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 96),
    new THREE.MeshBasicMaterial({color: 0xf7f7f7}));
  scene.add(earth);
  earthBorders().then(borders => {earth.add(borders); renderer.render(scene, camera);})
    .catch(error => console.warn('Globe borders unavailable', error));
  const positions = new Float32Array(data.model.fragmentCount * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setDrawRange(0, 0);
  const dots = new THREE.Points(geometry, new THREE.PointsMaterial({
    map: dotTexture(), transparent: true, alphaTest: .12, size: 1.8,
    sizeAttenuation: false, depthTest: true, depthWrite: false
  }));
  dots.frustumCulled = false;
  scene.add(dots);
  function resize() {
    const width = host.clientWidth, height = host.clientHeight;
    if (width < 2 || height < 2) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  }
  new ResizeObserver(() => resize()).observe(host);
  function update() {
    const scenario = data.scenarios[altitude], bracket = findBracket(data.days, day);
    const bins = Array(25).fill(0);
    let count = 0;
    for (const fragment of scenario.fragments) {
      const point = fragmentPosition(fragment, bracket, day);
      if (!point) continue;
      positions[count * 3] = point.x;
      positions[count * 3 + 1] = point.y;
      positions[count * 3 + 2] = point.z;
      count++;
      const index = Math.floor(point.altKm / 50);
      if (index >= 0 && index < bins.length) bins[index]++;
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.setDrawRange(0, count);
    $('survivors').textContent = count + ' / ' + data.model.fragmentCount;
    return bins;
  }
  let bins = [];
  return {resize, update: () => {bins = update();}, render: () => {
    controls.update(); renderer.render(scene, camera);
  }, getBins: () => bins};
}
function renderAll() {
  if (!scene3d) return;
  scene3d.update();
  if (slide === 3) scene3d.resize();
}
function syncTime() {
  const phases = [
    [220, '0–48 HOURS'],
    [420, 'DAYS 2–30'],
    [610, 'MONTHS 1–12'],
    [770, 'YEARS 1–2'],
    [Infinity, 'YEARS 2–8']
  ];
  $('timeScale').textContent = phases.find(([limit]) => clockPos < limit)[1];
  $('elapsedTime').textContent = dayText(day);
  document.querySelectorAll('.timeJump [data-day]').forEach((button, index, buttons) => {
    button.setAttribute('aria-pressed', String(index === buttons.length - 1 || day < Number(buttons[index + 1].dataset.day) ? day >= Number(button.dataset.day) : false));
  });
}
function setClockPos(value) {
  clockPos = Math.max(0, Math.min(1000, Number(value)));
  day = clockToDay(clockPos);
  syncTime(); renderAll();
}
function setDay(value) {
  day = Math.max(0, Math.min(horizon, Number(value)));
  clockPos = dayToClock(day);
  syncTime(); renderAll();
}
function setAltitude(value) {
  altitude = Number(value);
  for (const button of document.querySelectorAll('[data-alt]'))
    button.setAttribute('aria-pressed', String(Number(button.dataset.alt) === altitude));
  renderAll();
}
function setupPlayback() {
  for (const button of document.querySelectorAll('[data-alt]'))
    button.onclick = () => setAltitude(button.dataset.alt);
  document.querySelectorAll('.timeJump [data-day]').forEach(button => {
    button.onclick = () => {endHold = 0; setDay(button.dataset.day);};
  });
  setAltitude(550); setDay(0);
}
function tick(timestamp) {
  if (lastFrame && slide === 3) {
    const elapsed = Math.min(.1, (timestamp - lastFrame) / 1000);
    if (clockPos >= 1000) {
      endHold += elapsed;
      if (endHold >= 5) {endHold = 0; setClockPos(0);}
    } else {
      // One uninterrupted five-minute cycle: each time scale gets 48–69 seconds.
      clockPos = Math.min(1000, clockPos + elapsed * 1000 / 300);
      day = clockToDay(clockPos);
      syncTime();
      scene3d.update();
    }
  }
  lastFrame = timestamp;
  if (scene3d && slide === 3) scene3d.render();
  requestAnimationFrame(tick);
}
function commentSlide(item) {
  if (item.slide === 6 || item.slideTitle === 'What remains unknown?') return 4;
  if (item.slide === 4 || item.slide === 5) return 3;
  return Math.max(1, Math.min(4, item.slide));
}
const spotAliases = {
  'Altitude choices': 'Altitude selector',
  'Coordinated orbital demonstration': 'Debris cloud demonstration',
  'Debris cloud demonstration': 'Debris cloud demonstration',
  'Fragments remaining comparison': 'Debris and time indicator',
  'Four physical conditions': 'Three conditions',
  'Elapsed time': 'Timing'
};
function setupComments() {
  if (presentMode) return;
  $('spotButton').onclick = () => {
    spotMode = !spotMode;
    document.body.classList.toggle('spotMode', spotMode);
    $('spotButton').setAttribute('aria-pressed', String(spotMode));
  };
  $('commentsButton').onclick = () => {$('commentsDrawer').hidden = !$('commentsDrawer').hidden;};
  $('closeComments').onclick = () => {$('commentsDrawer').hidden = true;};
  $('cancelComment').onclick = () => {$('commentForm').hidden = true;};
  $('archivedToggle').onclick = () => {
    showArchived = !showArchived;
    $('archivedToggle').setAttribute('aria-pressed', String(showArchived));
    renderComments();
  };
  $('downloadComments').onclick = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({
      schema: 'fragmentation-comments-v1', comments}, null, 2)], {type: 'application/json'}));
    const a = document.createElement('a');
    a.href = url; a.download = 'fragmentation-comments.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  $('commentForm').onsubmit = async event => {
    event.preventDefault();
    try {
      const result = await request('/api/comments', {action: 'add', comment: {
        ...draft, text: $('commentText').value.trim()}});
      comments = result.comments;
      $('commentForm').hidden = true; $('commentText').value = '';
      spotMode = false; document.body.classList.remove('spotMode');
      $('spotButton').setAttribute('aria-pressed', 'false');
      renderComments();
    } catch (error) {alert(error.message);}
  };
  document.addEventListener('click', event => {
    if (!spotMode) return;
    if (event.target.closest('#reviewBar,#commentsDrawer')) return;
    const target = event.target.closest('[data-spot]') || slides[slide - 1];
    if (!target) return;
    event.preventDefault(); event.stopPropagation();
    const rect = target.getBoundingClientRect();
    draft = {slide, slideTitle: slideLabels[slide - 1],
      element: target.dataset.spot || 'Slide',
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
      altitude, day: Math.round(day)};
    $('commentLocation').textContent = 'Slide ' + slide + ' · ' + draft.element;
    $('commentsDrawer').hidden = false; $('commentForm').hidden = false;
    $('commentText').focus();
  }, true);
  window.addEventListener('resize', placePins);
}
function renderComments() {
  const open = comments.filter(x => x.status !== 'archived');
  const archived = comments.filter(x => x.status === 'archived');
  $('commentCount').textContent = String(open.length);
  $('archivedToggle').textContent = (showArchived ? 'Hide' : 'Show') +
    ' archived (' + archived.length + ')';
  $('commentList').replaceChildren();
  if (!open.length) {
    const p = document.createElement('p'); p.textContent = 'No new comments yet.';
    $('commentList').append(p);
  }
  for (const item of [...open, ...(showArchived ? archived : [])]) {
    const article = document.createElement('article'), jump = document.createElement('button');
    jump.textContent = 'Slide ' + commentSlide(item) + ' · ' + item.element +
      (item.status === 'archived' ? ' · Archived' : '');
    jump.onclick = () => {
      navigate(commentSlide(item));
      if (item.altitude) setAltitude(item.altitude);
      if (Number.isFinite(item.day)) setDay(item.day);
    };
    article.append(jump);
    const p = document.createElement('p'); p.textContent = item.text; article.append(p);
    const date = document.createElement('small');
    date.textContent = new Date(item.createdAt).toLocaleString(); article.append(date);
    $('commentList').append(article);
  }
  placePins();
}
function placePins() {
  const layer = $('spotPins');
  layer.replaceChildren();
  if (presentMode) return;
  let count = 0;
  for (const item of comments) {
    if (item.status === 'archived' || commentSlide(item) !== slide) continue;
    const spot = spotAliases[item.element] || item.element;
    const target = [...document.querySelectorAll('[data-spot]')].find(el =>
      el.dataset.spot === spot && el.getBoundingClientRect().width > 0) || slides[slide - 1];
    const rect = target.getBoundingClientRect();
    if (!rect.width || !rect.height) continue;
    const pin = document.createElement('button');
    pin.className = 'pin'; pin.textContent = String(++count); pin.title = item.text;
    pin.style.left = (rect.left + rect.width * item.x) + 'px';
    pin.style.top = (rect.top + rect.height * item.y) + 'px';
    pin.onclick = () => {$('commentsDrawer').hidden = false;};
    layer.append(pin);
  }
}
async function init() {
  try {
    const [model, commentDoc] = await Promise.all([
      request('./data.json'),
      presentMode ? Promise.resolve({comments: []}) : request('/api/comments')
    ]);
    data = model; comments = commentDoc.comments || [];
    if (data.schema !== 'espl-fragmentation-illustrative-v2')
      throw new Error('Model data version mismatch; regenerate data.json');
    scene3d = buildScene();
    setupNavigation(); setupPlayback(); setupComments(); renderComments();
    if ([300, 550, 850].includes(Number(initialParams.get('alt'))))
      setAltitude(Number(initialParams.get('alt')));
    if (initialParams.has('day') && Number.isFinite(Number(initialParams.get('day'))))
      setDay(Number(initialParams.get('day')));
    requestAnimationFrame(tick);
  } catch (error) {
    showError('Could not load fragmentation presentation: ' + error.message);
    console.error(error);
  }
}
mountOpeningArtwork().catch(error => console.warn("Opening artwork unavailable",error));
init();
