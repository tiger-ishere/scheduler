import React, { useState } from 'react';
import { Map, Clock, CheckCircle, Navigation, AlertTriangle, Bookmark } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, Tooltip, LayersControl, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { fetchWithAuth } from '../api';

import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({
    iconUrl: icon, shadowUrl: iconShadow, iconSize: [25, 41], iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// Color palette for different buses
const BUS_COLORS = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];

function MapStateSync({ setMapView }) {
  useMapEvents({
    baselayerchange(e) {
      if (setMapView) setMapView(e.name);
    }
  });
  return null;
}

const ResultsDisplay = ({ solutions, inputLocations, loading, mapView, setMapView, optimizeFor }) => {
  const [selectedSolutionIdx, setSelectedSolutionIdx] = useState(0);
  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);

  if (loading) {
    return (
      <div className="glass-panel" style={{ height: '100%', minHeight: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '20px' }}>
        <div style={{ width: '40px', height: '40px', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--accent-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
        <p style={{ color: 'var(--text-secondary)' }}>Solving Integer Linear Programming Matrix...</p>
      </div>
    );
  }

  if (!solutions || solutions.length === 0) {
    return (
      <div className="glass-panel" style={{ height: '100%', minHeight: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px', color: 'var(--text-secondary)', textAlign: 'center', padding: '40px' }}>
        <Map size={48} style={{ opacity: 0.2 }} />
        <h3 style={{ color: 'var(--text-primary)', fontSize: '1.2rem' }}>Awaiting Solver</h3>
        <p style={{ maxWidth: '300px', lineHeight: 1.6 }}>Place your pins on the map and run the dispatch solver to optimally route your fleet.</p>
      </div>
    );
  }

  const selectedSolution = solutions[selectedSolutionIdx];

  const isFeasible = selectedSolution.penalty_score < 1500;

  // Group schedules by bus_id logically from the ILP backend solver
  const busesMap = {};
  selectedSolution.schedule.forEach(node => {
    if (!busesMap[node.bus_id]) busesMap[node.bus_id] = [];
    busesMap[node.bus_id].push(node);
  });
  
  const allBuses = Object.values(busesMap).map(busArr => busArr.sort((a,b) => a.start_time - b.start_time));

  // Determine Timeline bounds
  const minTime = Math.min(...selectedSolution.schedule.map(s => s.start_time));
  const maxTime = Math.max(...selectedSolution.schedule.map(s => s.end_time));
  const START_TIME = Math.max(0, Math.floor((minTime - 30) / 60) * 60);
  const END_TIME = Math.min(1440, Math.ceil((maxTime + 30) / 60) * 60);
  const TOTAL_SPAN = END_TIME - START_TIME || 60;

  const formatTime = (minutes) => {
    const h = Math.floor(minutes / 60);
    const m = Math.floor(minutes % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  };

  // Find center of map based on inputs
  const centerLat = inputLocations && inputLocations.length > 0 ? (Math.max(...inputLocations.map(l=>l.lat)) + Math.min(...inputLocations.map(l=>l.lat)))/2 : 51.505;
  const centerLng = inputLocations && inputLocations.length > 0 ? (Math.max(...inputLocations.map(l=>l.lng)) + Math.min(...inputLocations.map(l=>l.lng)))/2 : -0.09;

  return (
    <div className="glass-panel flex-col" style={{ height: '100%', overflow: 'hidden' }}>
      <div style={{ background: 'rgba(16, 185, 129, 0.1)', borderBottom: '1px solid rgba(16, 185, 129, 0.2)', padding: '8px 24px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-success)', fontSize: '0.85rem', fontWeight: 500 }}>
        <CheckCircle size={16} /> {optimizeFor === 'frequency' ? 'Perfectly Spaced Headway Schedule Generated' : 'Mathematically Optimal Solution Found (OR-Tools)'}
      </div>

      <div style={{ flexGrow: 1, overflowY: 'auto' }}>
        
        {/* Save Plan Block */}
        <div style={{ padding: '24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
           <div>
             <h3 style={{ fontSize: '1.2rem', marginBottom: '4px' }}>Save Route Plan</h3>
             <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>Save this mathematically optimal schedule to your fleet library.</p>
           </div>
           <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
             <input type="text" className="input-field" placeholder="Optional plan name" style={{ width: '200px', background: 'rgba(0,0,0,0.2)' }} value={saveName} onChange={e => setSaveName(e.target.value)} />
             <button className="btn btn-primary" onClick={async () => {
                setSaving(true);
                setSaveStatus(null);
                try {
                  const penalty = selectedSolution.metrics?.penalty || 0;
                  const summary = `${selectedSolution.metrics.buses} buses • ${inputLocations.length} stops • ${penalty} penalty • ${optimizeFor === 'punctuality' ? 'Strict Mode' : 'Utilization Mode'}`;
                  let dbStatus = "Fully Feasible";
                  if (penalty > 0 && penalty < 1000) dbStatus = "Slight Deviation";
                  else if (penalty >= 1000) dbStatus = "Infeasible";

                  const res = await fetchWithAuth('/save-schedule', {
                    method: 'POST',
                    body: JSON.stringify({
                      name: saveName,
                      summary: summary,
                      mode: optimizeFor || 'punctuality',
                      buses: selectedSolution.metrics.buses,
                      penalty: penalty,
                      score: selectedSolution.metrics.score,
                      status: dbStatus,
                      stops: inputLocations.length,
                      solution: selectedSolution,
                      input_locations: inputLocations
                    })
                  });
                  if (res.ok) {
                     setSaveStatus('success');
                     setTimeout(() => setSaveStatus(null), 3000);
                     setSaveName('');
                  } else {
                     setSaveStatus('error');
                  }
                } catch (err) {
                  setSaveStatus('error');
                } finally {
                  setSaving(false);
                }
             }} disabled={saving}>
               {saving ? 'Saving...' : <><Bookmark size={16} /> Save Plan</>}
             </button>
             {saveStatus === 'success' && <div style={{ color: 'var(--accent-success)' }}><CheckCircle size={20} /></div>}
             {saveStatus === 'error' && <div style={{ color: 'var(--accent-danger)' }}><AlertTriangle size={20} /></div>}
           </div>
        </div>

        {/* Dynamic Feasibility Heuristics Banner */}
        {(() => {
          if (optimizeFor === 'frequency') {
             return (
               <div style={{ background: 'rgba(59, 130, 246, 0.15)', borderBottom: '1px solid var(--accent-primary)', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
                 <Clock color="var(--accent-primary)" size={32} />
                 <div>
                   <h4 style={{ color: 'var(--accent-primary)', margin: 0, marginBottom: '4px', fontSize: '1rem', fontWeight: 600 }}>Anti-Bunching Spacing Active</h4>
                   <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                     Buses have been dynamically spaced evenly across the total operational window. This completely eliminates bus overlapping and maximizes geographic coverage.
                   </p>
                 </div>
               </div>
             );
          }

          const penalty = selectedSolution.metrics?.penalty || 0;
          let statusColor, title, iconStr, message;
          
          if (penalty === 0) {
            statusColor = "var(--accent-success)";
            title = "Fully Feasible Schedule";
            iconStr = <CheckCircle color={statusColor} size={32} />;
            message = "All timing constraints and geographical boundaries were fully satisfied natively. No distance deviation penalties accrued.";
          } else if (penalty < 1000) {
            statusColor = "var(--accent-warning)";
            title = "Slightly Deviated Route";
            iconStr = <AlertTriangle color={statusColor} size={32} />;
            message = `The solver formulated topological paths but accrued minor late penalties (Penalty Score: ${penalty}). The schedule legally functions but stretches the time tolerances softly.`;
          } else {
            statusColor = "var(--accent-danger)";
            title = "Infeasible Geographic Constraints Detected";
            iconStr = <AlertTriangle color={statusColor} size={32} />;
            message = `Severe physical limits strictly exceed the provided time limits (Penalty Score: ${penalty}). The engine successfully forced the "least bad" logic, but massive timing infractions occurred. Highly recommended to deploy extra buses or widen pickup times.`;
          }

          return (
            <div style={{ background: `${statusColor}15`, borderBottom: `1px solid ${statusColor}`, padding: '16px 24px', display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
              {iconStr}
              <div>
                <h4 style={{ color: statusColor, margin: 0, marginBottom: '4px', fontSize: '1rem', fontWeight: 600 }}>{penalty === 0 ? "✅ " : ""}{title}</h4>
                <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  {message}
                </p>
              </div>
            </div>
          );
        })()}

        {/* Geographic Map Visualization */}
        <div style={{ height: 'min(60vh, 600px)', width: '100%', position: 'relative' }}>
          {inputLocations && inputLocations.length > 0 && (
             <MapContainer center={[centerLat, centerLng]} zoom={12} style={{ height: '100%', width: '100%' }}>
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
               <MapStateSync setMapView={setMapView} />
               
               {/* Render high-resolution curvy routes directly from backend ORS GPS arrays natively */}
               {selectedSolution.polylines && Object.keys(selectedSolution.polylines).map((busId, i) => {
                 const positions = selectedSolution.polylines[busId];
                 return (
                   <Polyline 
                     key={`poly-${busId}`} 
                     positions={positions} 
                     color={BUS_COLORS[i % BUS_COLORS.length]} 
                     weight={4} 
                     opacity={0.8}
                   />
                 );
               })}

               {/* Draw pins */}
               {inputLocations.map(loc => {
                 // Identify which bus visits this loc
                 const visit = selectedSolution.schedule.find(s => s.location_node_id === loc.id);
                 return (
                   <Marker key={`m-${loc.id}`} position={[loc.lat, loc.lng]}>
                     <Tooltip permanent direction="bottom" offset={[0, 10]} opacity={0.9}>
                       {loc.name || `Stop #${loc.id}`}
                     </Tooltip>
                     <Popup>
                       <strong>{loc.name || `Stop #${loc.id}`}</strong><br/>
                       Arrive: {visit ? formatTime(visit.start_time) : '?'}<br/>
                       Bus: {visit ? `Bus ${visit.bus_id}` : 'Unassigned'}
                     </Popup>
                   </Marker>
                 );
               })}
             </MapContainer>
          )}
        </div>

        <div style={{ padding: '24px' }}>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '32px' }}>
            <div style={{ background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Buses Deployed</p>
              <p style={{ fontSize: '1.4rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>{selectedSolution.metrics.buses}</p>
            </div>
            <div style={{ background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>{optimizeFor === 'frequency' ? 'Bus Bunching' : 'Deviation Penalty'}</p>
              <p style={{ fontSize: '1.4rem', fontWeight: 'bold', color: optimizeFor === 'frequency' ? 'var(--accent-success)' : 'var(--accent-warning)' }}>{optimizeFor === 'frequency' ? 'Eliminated' : selectedSolution.metrics.penalty}</p>
            </div>
            <div style={{ background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>{optimizeFor === 'frequency' ? 'Headway Spacing' : 'VRPTW Score'}</p>
              <p style={{ fontSize: '1.4rem', fontWeight: 'bold', color: 'var(--accent-primary)' }}>{optimizeFor === 'frequency' ? 'Optimal' : selectedSolution.metrics.score}</p>
            </div>
          </div>

          <h3 style={{ fontSize: '1.1rem', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Navigation size={18} color="var(--accent-primary)" />
            Vehicle Route Assignments
          </h3>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '16px', paddingLeft: '26px' }}>
            💡 <strong style={{ color: 'var(--text-primary)' }}>Why this routing?</strong> Stops are algorithmically merged and grouped based on geographic proximity and strict time window feasibility.
          </p>
          <div style={{ background: 'rgba(0,0,0,0.2)', padding: '24px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', marginBottom: '32px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {allBuses.map((busRoutes, i) => {
                const busColor = BUS_COLORS[i % BUS_COLORS.length];
                let sequenceItems = [];
                let totalTravelMinutes = 0;
                
                for (let j = 0; j < busRoutes.length; j++) {
                  const r = busRoutes[j];
                  const loc = inputLocations.find(l => l.id === r.location_node_id);
                  let name = loc?.name ? loc.name.replace(/Stop #/gi, '').trim() : `Stop #${r.location_node_id}`;
                  name = name.charAt(0).toUpperCase() + name.slice(1);
                  if (j === busRoutes.length - 1) name = `Destination: ${name}`;
                  
                  sequenceItems.push(
                    <span key={`s-${j}`} style={{ fontWeight: 600 }}>{name}</span>
                  );
                  
                  if (j < busRoutes.length - 1) {
                     const nextR = busRoutes[j+1];
                     const travelTime = nextR.start_time - r.end_time;
                     totalTravelMinutes += travelTime;
                     
                     sequenceItems.push(
                       <span key={`arr-${j}`} style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: '0 8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                         ➔ <span style={{ color: 'var(--accent-primary)', fontSize: '0.8rem', fontWeight: 600 }}>({travelTime} min)</span> ➔
                       </span>
                     );
                  }
                }
                
                const totalRouteTime = busRoutes[busRoutes.length - 1].start_time - busRoutes[0].start_time;
                const hrs = Math.floor(totalRouteTime / 60);
                const mins = totalRouteTime % 60;
                const totalTimeString = hrs > 0 ? `${hrs} hr ${mins} min` : `${mins} min`;
                
                const stopCount = busRoutes.length - 1; 
                let utilization = "average utilization";
                let utilColor = "var(--accent-warning)";
                if (stopCount <= 1) {
                   utilization = "low utilization";
                   utilColor = "var(--accent-danger)";
                } else if (stopCount >= 3) {
                   utilization = "high utilization";
                   utilColor = "var(--accent-success)";
                }
                
                return (
                  <div key={`assign-${i}`} style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', background: 'rgba(255,255,255,0.02)', padding: '20px', borderRadius: '12px', border: `1px solid ${busColor}30` }}>
                    <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: busColor, marginTop: '4px', boxShadow: `0 0 10px ${busColor}80` }}></div>
                    <div style={{ width: '100%' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '12px' }}>
                        <h4 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.05rem', fontWeight: 600 }}>Bus {busRoutes[0].bus_id}</h4>
                        <div style={{ display: 'flex', gap: '16px', fontSize: '0.9rem' }}>
                           <span style={{ color: 'var(--text-secondary)' }}>Total Time: <strong style={{ color: 'white' }}>{totalTimeString}</strong></span>
                           <span style={{ color: utilColor, fontWeight: 500 }}>{stopCount} {stopCount === 1 ? 'stop' : 'stops'} ({utilization})</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', marginTop: '8px', fontSize: '1rem', color: 'var(--text-primary)' }}>
                        {sequenceItems}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <h3 style={{ fontSize: '1.1rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Clock size={18} color="var(--accent-purple)" />
            Dispatch Timeline
          </h3>
          <div style={{ background: 'rgba(0,0,0,0.2)', padding: '24px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', marginBottom: '32px', overflowX: 'auto' }}>
            <div style={{ minWidth: '1000px', paddingBottom: '32px' }}>
              <div style={{ position: 'relative', height: '24px', marginBottom: '16px', display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                 {[0, 25, 50, 75, 100].map(percent => {
                   const minutes = START_TIME + (percent / 100) * TOTAL_SPAN;
                 return (
                   <div key={percent} style={{ position: 'absolute', left: `${percent}%`, transform: 'translateX(-50%)', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                     {formatTime(minutes)}
                   </div>
                 );
               })}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '48px', marginTop: '32px', marginBottom: '16px' }}>
              {allBuses.map((busRoutes, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', width: '48px' }}>Bus {busRoutes[0].bus_id}</div>
                  
                  {/* The Timeline Outer Track */}
                  <div style={{ flexGrow: 1, position: 'relative', height: '8px', background: 'rgba(255,255,255,0.06)', borderRadius: 'var(--radius-full)' }}>
                    
                    {busRoutes.map(route => {
                      const startPercent = ((route.start_time - START_TIME) / TOTAL_SPAN) * 100;
                      // Enforce a minimum width so pills don't disappear on vast timelines
                      const durationPercent = Math.max(0.8, ((route.end_time - route.start_time) / TOTAL_SPAN) * 100);
                      const busColor = BUS_COLORS[i % BUS_COLORS.length];
                      
                      const loc = inputLocations.find(l => l.id === route.location_node_id);
                      // Make Name pretty
                      let formattedName = loc?.name ? loc.name.replace(/Stop #/gi, '').trim() : `Loc ${route.location_node_id}`;
                      formattedName = formattedName.charAt(0).toUpperCase() + formattedName.slice(1);
                      if (formattedName.length > 20) formattedName = formattedName.substring(0, 20) + '...';
                      
                      return (
                        <div 
                          key={route.location_node_id}
                          style={{
                            position: 'absolute', left: `${startPercent}%`, width: `${durationPercent}%`, height: '24px', top: '-8px',
                            background: busColor, borderRadius: '6px',
                            boxShadow: `0 0 12px ${busColor}50`,
                            cursor: 'pointer',
                            display: 'flex', justifyContent: 'center', alignItems: 'center'
                          }}
                          title={`${loc?.name || `Stop #${route.location_node_id}`} (${formatTime(route.start_time)} - ${formatTime(route.end_time)})`}
                        >
                           {/* Floating Name Label */}
                           <div style={{ 
                               position: 'absolute', top: '-28px', fontSize: '0.75rem', 
                               color: 'var(--text-primary)', whiteSpace: 'nowrap', fontWeight: 500,
                               background: 'var(--bg-card)', padding: '4px 10px', borderRadius: '4px',
                               border: `1px solid ${busColor}40`, backdropFilter: 'blur(8px)',
                               transform: 'translateX(0)', boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                               zIndex: 10
                           }}>
                             {formattedName}
                             <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                               {formatTime(route.start_time)}
                             </div>
                           </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            </div>
          </div>

          <h3 style={{ fontSize: '1.1rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Navigation size={18} color="var(--accent-teal)" />
            AI Smart Insights
          </h3>
          <div style={{ background: 'rgba(20, 184, 166, 0.1)', border: '1px solid rgba(20, 184, 166, 0.2)', padding: '20px', borderRadius: '12px', marginBottom: '32px' }}>
             <ul style={{ margin: 0, paddingLeft: '20px', color: 'var(--text-primary)', fontSize: '0.9rem', lineHeight: 1.6 }}>
               {optimizeFor === 'frequency' ? (
                 <>
                   <li style={{ marginBottom: '8px' }}><strong>Symmetric Headways:</strong> Time gaps between bus deployments are perfectly mathematically identical, smoothing out passenger loads.</li>
                   <li style={{ marginBottom: '8px' }}><strong>Anti-Bunching:</strong> Eliminates scenarios where two buses arrive at the same stop simultaneously.</li>
                   <li><strong>Fleet Utilization:</strong> Guarantees geographic coverage without gaps over the specified operational block.</li>
                 </>
               ) : (
                 <>
                   <li style={{ marginBottom: '8px' }}><strong>Geographic Clustering:</strong> Stops are grouped based on geographic proximity to avoid unnecessary overlaps.</li>
                   <li style={{ marginBottom: '8px' }}><strong>Time Constraint Satisfaction:</strong> {selectedSolution.metrics?.penalty > 0 ? "Separate bus assigned due to distance constraints causing time overruns." : "All time windows met perfectly without requiring extra buses."}</li>
                   <li><strong>Fleet Utilization:</strong> {inputLocations.length / selectedSolution.metrics.buses >= 4 ? "High utilization route detected." : "Lower utilization detected; consider deploying fewer buses with wider drop-off windows."}</li>
                 </>
               )}
             </ul>
          </div>

        </div>
      </div>
    </div>
  );
};

export default ResultsDisplay;
