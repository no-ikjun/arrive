import { coordinate } from './guide.js';

// Only public venue points reach this component: no tokens, session IDs, or live positions.
export function createArrivalMap(element, { driver = false, onStatus = () => {} } = {}) {
  if (!window.L) throw new Error('Map library unavailable');
  const map = L.map(element, { zoomControl: false, scrollWheelZoom: false, maxZoom: 19, minZoom: 15,
    zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false });
  element.setAttribute('aria-label', '하차 지점, 주차장과 건물 입구 지도');
  L.control.zoom({ position: 'topright', zoomInTitle: '지도 확대', zoomOutTitle: '지도 축소' }).addTo(map);
  L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);
  map.attributionControl.setPrefix(false);
  const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, keepBuffer: 1,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
  }).addTo(map);
  let failures = 0;
  tiles.on('loading', () => { failures = 0; });
  tiles.on('tileerror', () => { failures++; onStatus('배경 지도를 불러오지 못했어요. 인터넷 연결을 확인하세요.'); });
  tiles.on('load', () => { if (!failures) onStatus(''); });
  const points = L.layerGroup().addTo(map);
  let bounds = null, key = '';
  function fit() { if (bounds?.isValid()) map.fitBounds(bounds, { padding: driver ? [70, 70] : [48, 48], maxZoom: 18, animate: false }); }
  const Fit = L.Control.extend({ options: { position: 'topright' }, onAdd() {
    const button = L.DomUtil.create('button', 'map-fit'); button.type = 'button'; button.textContent = '전체';
    button.setAttribute('aria-label', '모든 장소 보기'); L.DomEvent.disableClickPropagation(button);
    L.DomEvent.on(button, 'click', fit); return button;
  }}); new Fit().addTo(map);
  function marker(place, label, kind, selected = false, tooltip = false) {
    if (!coordinate(place?.coordinate)) return;
    const node = document.createElement('span'); node.className = `place-pin ${kind}${selected ? ' selected' : ''}`;
    node.textContent = label;
    const m = L.marker([place.coordinate.latitude, place.coordinate.longitude], {
      title: place.name, alt: place.name,
      icon: L.divIcon({ html: node, className: 'place-marker', iconSize: [42, 42], iconAnchor: [21, 21] }),
    }).addTo(points);
    const text = document.createElement('span'); text.textContent = place.name;
    m.bindTooltip(text, { permanent: tooltip, direction: kind === 'entrance' ? 'bottom' : 'top', offset: [0, kind === 'entrance' ? 24 : -24], className: 'place-label' });
    bounds.extend(m.getLatLng());
  }
  return {
    render(venue, guide, state) {
      const nextKey = JSON.stringify([venue.venueId, venue.catalogVersion, guide?.guideVersion, state.stage, state.parkingId, state.excludedParkingIds]);
      if (key === nextKey) return;
      key = nextKey; points.clearLayers(); bounds = L.latLngBounds([]);
      const beforeParking = ['PLANNED', 'TO_DROPOFF'].includes(state.stage);
      marker(venue.dropoff, '하차', 'dropoff', driver && beforeParking, true);
      if (guide) marker(guide.entrance, '입구', 'entrance', !driver || !beforeParking && state.stage !== 'TO_PARKING', true);
      venue.parkingCandidates.forEach((p, i) => {
        const excluded = state.excludedParkingIds?.includes(p.id), selected = p.id === state.parkingId;
        if (driver || selected) marker(p, `P${i + 1}`, excluded ? 'excluded' : 'parking', selected && state.stage === 'TO_PARKING', false);
      });
      // No straight-line "walking route": geometry is not yet field-verified.
      map.invalidateSize(); fit();
    },
    resize() { map.invalidateSize(); fit(); },
    destroy() { map.remove(); },
  };
}
