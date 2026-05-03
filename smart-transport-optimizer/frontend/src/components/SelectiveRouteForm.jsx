import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, Tooltip, LayersControl, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { GeoSearchControl, OpenStreetMapProvider } from 'leaflet-geosearch';
import 'leaflet-geosearch/dist/geosearch.css';
import { Play, MapPin, Trash2, Crosshair, Clock, Bus } from 'lucide-react';
import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon, shadowUrl: iconShadow, iconSize: [25, 41], iconAnchor: [12, 41]
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

const SelectiveRouteForm = ({ 
  routes, onRoutesChange, onOptimize, loading,
  mapView, setMapView, optimizeFor, setOptimizeFor
}) => {

  const handleMapClick = (latlng) => {
    const newStop = {
      id: Date.now(),
      lat: latlng.lat,
      lng: latlng.lng,
      name: `Stop #${routes.length + 1}`,
      target_time: 480, // Default 8:00 AM (just a placeholder for mapping)
      early_tolerance: 15,
      late_tolerance: 15,
      service_time: 5
    };
    onRoutesChange([...routes, newStop]);
  };

  const removeRoute = (id) => {
    onRoutesChange(routes.filter(r => r.id !== id));
  };

  const handleUpdate = (id, field, value) => {
    onRoutesChange(routes.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  // Local state for Frequency specifics
  const [numBuses, setNumBuses] = useState(5);
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("18:00");

  const convertToMinutes = (timeStr) => {
     if (!timeStr) return 0;
     const [h, m] = timeStr.split(':');
     return parseInt(h) * 60 + parseInt(m);
  };

  const handleFrequencyRun = () => {
    setOptimizeFor('frequency');
    const startMins = convertToMinutes(startTime);
    const endMins = convertToMinutes(endTime);
    // Overload the onOptimize call to handle our selective frequency parameters
    onOptimize({ num_buses: numBuses, start_time_minutes: startMins, end_time_minutes: endMins });
  };

  // Center map logically
  const mapCenter = routes.length > 0 ? [routes[0].lat, routes[0].lng] : [51.505, -0.09];

  return (
    <div className="flex-col gap-6" style={{ height: '100%', display: 'flex' }}>
      <div className="glass-panel" style={{ padding: '0', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', background: 'linear-gradient(90deg, rgba(139, 92, 246, 0.1), transparent)' }}>
          <h2 style={{ fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
             <Clock color="var(--accent-purple)" size={20} /> Selective Routing (Frequency Generator)
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '4px' }}>
            Draw a route sequence and input the number of buses to output an automated, anti-bunching Dispatch Timetable.
          </p>
        </div>

        {/* Operating Window Parameters */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
           <div>
             <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px', display: 'block' }}>Operational Start</label>
             <input type="time" className="input-field" value={startTime} onChange={e => setStartTime(e.target.value)} />
           </div>
           <div>
             <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px', display: 'block' }}>Operational End</label>
             <input type="time" className="input-field" value={endTime} onChange={e => setEndTime(e.target.value)} />
           </div>
           <div>
             <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px', display: 'block' }}>Total Buses to Deploy</label>
             <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
               <Bus size={18} color="var(--text-secondary)" />
               <input type="number" min="1" max="50" className="input-field" value={numBuses} onChange={e => setNumBuses(parseInt(e.target.value))} />
             </div>
           </div>
        </div>

        {/* The Map Input Area */}
        <div style={{ height: '320px', position: 'relative' }}>
          <MapContainer center={mapCenter} zoom={13} style={{ height: '100%', width: '100%', cursor: 'crosshair' }}>
            <MapClickHandler onMapClick={handleMapClick} />
            <LayersControl position="bottomright">
              <LayersControl.BaseLayer checked={mapView === 'Streets (Default)'} name="Streets (Default)">
                <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
              </LayersControl.BaseLayer>
              <LayersControl.BaseLayer checked={mapView === 'Satellite'} name="Satellite">
                <TileLayer url="http://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}" subdomains={['mt0', 'mt1', 'mt2', 'mt3']} maxZoom={20} />
              </LayersControl.BaseLayer>
            </LayersControl>
            <SearchField />
            <MapStateSync setMapView={setMapView} />
            {routes.map((route, i) => (
              <Marker key={route.id} position={[route.lat, route.lng]}>
                <Tooltip permanent direction="right" offset={[10, 0]} className="sequence-tooltip">Step {i+1}</Tooltip>
              </Marker>
            ))}
          </MapContainer>
          {routes.length === 0 && (
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'rgba(11, 15, 25, 0.8)', padding: '16px 24px', borderRadius: 'var(--radius-md)', zIndex: 1000, pointerEvents: 'none', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}>
              Map is empty. Click sequentially to draw the route path.
            </div>
          )}
        </div>

        <div style={{ padding: '24px', flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600 }}>Route Sequence</h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.05)', padding: '4px 10px', borderRadius: '12px' }}>{routes.length} stops drawn</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', flexGrow: 1, maxHeight: '200px', marginBottom: '24px' }}>
            {routes.map((route, idx) => (
              <div key={route.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ background: 'rgba(139, 92, 246, 0.2)', color: 'var(--accent-purple)', minWidth: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 'bold' }}>{idx+1}</div>
                  <input
                    type="text"
                    className="input-field"
                    style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', padding: '4px 8px', width: '100%', color: 'inherit', fontWeight: 'bold' }}
                    value={route.name || `Stop #${route.id}`}
                    onChange={(e) => handleUpdate(route.id, 'name', e.target.value)}
                    placeholder="Enter Stop Name..."
                  />
                </div>
                <button onClick={() => removeRoute(route.id)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}>
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            {routes.length === 0 && <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', textAlign: 'center', padding: '20px' }}>No stops defined. Click on the map.</p>}
          </div>

          <button 
            className="btn btn-primary" 
            style={{ width: '100%', padding: '14px', fontSize: '1rem', marginTop: 'auto', background: 'linear-gradient(135deg, var(--accent-purple), var(--accent-primary))' }} 
            onClick={handleFrequencyRun} 
            disabled={routes.length < 2 || loading}
          >
            {loading ? 'Crunching Numbers...' : <><Play size={18} /> Generate Selective Space Draft</>}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SelectiveRouteForm;
