import React, { useEffect } from 'react';
import { Trash2, Clock, Play, MapPin } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, Tooltip, useMap, LayersControl } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { GeoSearchControl, OpenStreetMapProvider } from 'leaflet-geosearch';
import 'leaflet-geosearch/dist/geosearch.css';
import L from 'leaflet';

// Fix Vite Leaflet Marker Bug
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

function MapClickHandler({ onMapClick }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng);
    },
  });
  return null;
}

function MapStateSync({ setMapView }) {
  useMapEvents({
    baselayerchange(e) {
      if (setMapView) setMapView(e.name);
    }
  });
  return null;
}

function SearchField() {
  const map = useMap();
  useEffect(() => {
    const provider = new OpenStreetMapProvider();
    const searchControl = new GeoSearchControl({
      provider: provider,
      style: 'bar',
      showMarker: false,
      retainZoomLevel: false,
      animateZoom: true,
      autoClose: true,
      searchLabel: 'Search for building, city, etc...',
      keepResult: true
    });
    map.addControl(searchControl);
    return () => map.removeControl(searchControl);
  }, [map]);
  return null;
}

const RouteForm = ({ routes, onRoutesChange, onOptimize, loading, optimizeFor, setOptimizeFor, mapView, setMapView }) => {
  const handleMapClick = (latlng) => {
    const newId = routes.length ? Math.max(...routes.map(r => r.id)) + 1 : 1;
    const newLocation = {
      id: newId,
      name: `Stop #${newId}`,
      lat: latlng.lat,
      lng: latlng.lng,
      target_time: 540, // 09:00 default
      early_tolerance: 15,
      late_tolerance: 15,
      service_time: 5
    };
    onRoutesChange([...routes, newLocation]);
  };

  const handleUpdate = (id, field, value) => {
    onRoutesChange(routes.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const handleRemove = (id) => {
    onRoutesChange(routes.filter(r => r.id !== id));
  };

  const formatTimeStr = (minutes) => {
    const h = Math.floor(minutes / 60);
    const m = Math.floor(minutes % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  };

  const parseTime = (timeString) => {
    if (!timeString) return 0;
    const [h, m] = timeString.split(':').map(Number);
    return h * 60 + m;
  };

  return (
    <div className="glass-panel flex-col" style={{ height: '100%', display: 'flex' }}>
      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <MapPin size={20} color="var(--accent-danger)" />
          Interactive Stops
        </h2>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '10px' }}>
          {routes.length} Locations
        </span>
      </div>

      <div style={{ height: '300px', width: '100%', borderBottom: '1px solid var(--border-color)' }}>
        <MapContainer center={[51.505, -0.09]} zoom={13} style={{ height: '100%', width: '100%' }}>
          <LayersControl position="bottomright">
            <LayersControl.BaseLayer checked={mapView === 'Streets (Default)'} name="Streets (Default)">
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
                url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
              />
            </LayersControl.BaseLayer>
            <LayersControl.BaseLayer checked={mapView === 'Satellite'} name="Satellite">
              <TileLayer
                attribution="&copy; Google Maps"
                url="http://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
                subdomains={['mt0', 'mt1', 'mt2', 'mt3']}
                maxZoom={20}
              />
            </LayersControl.BaseLayer>
          </LayersControl>
          <SearchField />
          <MapClickHandler onMapClick={handleMapClick} />
          <MapStateSync setMapView={setMapView} />
          {routes.map(r => (
            <Marker key={r.id} position={[r.lat, r.lng]}>
              <Tooltip permanent direction="bottom" offset={[0, 10]} opacity={0.85}>
                {r.name || `Stop #${r.id}`}
              </Tooltip>
              <Popup>{r.name || `Stop #${r.id}`}</Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      <div style={{ padding: '24px', flexGrow: 1, overflowY: 'auto' }}>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>Click anywhere on the map to add a new stop location.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {routes.map((route, idx) => (
            <div key={route.id} style={{ background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: 'var(--radius-md)', border: idx === routes.length - 1 ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ fontWeight: 600, color: idx === routes.length - 1 ? 'var(--accent-primary)' : 'var(--text-primary)', flexGrow: 1, marginRight: '16px' }}>
                  <input
                    type="text"
                    className="input-field"
                    style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', padding: '4px 8px', width: '100%', color: 'inherit', fontWeight: 'bold' }}
                    value={route.name || `Stop #${route.id}`}
                    onChange={(e) => handleUpdate(route.id, 'name', e.target.value)}
                    placeholder="Enter Stop Name..."
                  />
                  {idx === routes.length - 1 && <span style={{fontSize:'0.7rem', display:'block', marginTop:'4px', color:'var(--accent-primary)'}}>🏁 Final Destination</span>}
                </div>
                <button className="btn btn-secondary" style={{ padding: '6px' }} onClick={() => handleRemove(route.id)}>
                  <Trash2 size={16} color="var(--accent-danger)" />
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '4px', color: 'var(--text-secondary)' }}>Arrival Time</label>
                  <input type="time" className="input-field" value={formatTimeStr(route.target_time)} onChange={(e) => handleUpdate(route.id, 'target_time', parseTime(e.target.value))} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '4px', color: 'var(--text-secondary)' }}>Dwell Time (Mins)</label>
                  <input type="number" min="0" max="60" className="input-field" value={route.service_time} onChange={(e) => handleUpdate(route.id, 'service_time', parseInt(e.target.value)||0)} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '4px', color: 'var(--text-secondary)' }}>Max Early (Mins)</label>
                  <input type="number" min="0" max="120" className="input-field" value={route.early_tolerance} onChange={(e) => handleUpdate(route.id, 'early_tolerance', parseInt(e.target.value)||0)} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '4px', color: 'var(--text-secondary)' }}>Max Late (Mins)</label>
                  <input type="number" min="0" max="120" className="input-field" value={route.late_tolerance} onChange={(e) => handleUpdate(route.id, 'late_tolerance', parseInt(e.target.value)||0)} />
                </div>
              </div>
            </div>
          ))}
          {routes.length === 0 && (
            <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)', fontStyle: 'italic', background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-md)' }}>
              Map is empty. Click on the map above to drop pins and create stops.
            </div>
          )}
        </div>
      </div>
      
      <div style={{ padding: '20px 24px', borderTop: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.1)' }}>
        
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: 500 }}>
            Optimization Strategy
          </label>
          <div style={{ display: 'flex', gap: '8px', background: 'rgba(0,0,0,0.2)', padding: '6px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <button 
              className={`btn ${optimizeFor === 'punctuality' ? 'btn-primary' : ''}`}
              style={{ flex: 1, padding: '8px', fontSize: '0.85rem', background: optimizeFor === 'punctuality' ? 'var(--accent-primary)' : 'transparent', color: optimizeFor === 'punctuality' ? '#fff' : 'var(--text-secondary)' }}
              onClick={() => setOptimizeFor('punctuality')}
            >
              Strict Punctuality
            </button>
            <button 
              className={`btn ${optimizeFor === 'utilization' ? 'btn-primary' : ''}`}
              style={{ flex: 1, padding: '8px', fontSize: '0.85rem', background: optimizeFor === 'utilization' ? 'var(--accent-purple)' : 'transparent', color: optimizeFor === 'utilization' ? '#fff' : 'var(--text-secondary)' }}
              onClick={() => setOptimizeFor('utilization')}
            >
              Maximize Fleet Utilization
            </button>
          </div>
        </div>

        <button 
          className="btn btn-primary" 
          style={{ width: '100%', padding: '14px', fontSize: '1rem', background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-purple))' }}
          onClick={onOptimize}
          disabled={loading || routes.length === 0}
        >
          {loading ? 'Optimizing ILP Routing...' : <><Play size={18} /> Run Dispatch Solver</>}
        </button>
      </div>
    </div>
  );
};

export default RouteForm;
