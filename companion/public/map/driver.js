import { createArrivalMap } from './arrival-map.js';
import { validateGuide } from './guide.js';
const status = document.getElementById('map-status');
try {
  const view = createArrivalMap(document.getElementById('map'), { driver: true, onStatus: message => { status.textContent = message; } });
  // Embedded Android WebView can resolve vh to zero during its initial Compose measure.
  // Use the measured viewport again when native layout or the visit changes.
  let viewport = '';
  function layout() {
    const next = `${window.innerWidth}:${window.innerHeight}`;
    if (next === viewport) return;
    viewport = next; document.body.style.height = `${window.innerHeight}px`; view.resize();
  }
  window.arriveMap = { render(payload) { layout(); view.render(payload.venue, validateGuide(payload.guide, payload.venue), payload.state); view.updateVehicle(payload.vehicle); }, resize: layout };
  window.addEventListener('resize', layout);
  requestAnimationFrame(layout);
} catch { status.textContent = '지도를 열지 못했어요. 앱을 다시 열어 주세요.'; }
