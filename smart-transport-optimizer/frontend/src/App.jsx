import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './components/Dashboard';
import RouteForm from './components/RouteForm';
import SelectiveRouteForm from './components/SelectiveRouteForm';
import ResultsDisplay from './components/ResultsDisplay';
import { Bus, Settings } from 'lucide-react';
import './index.css';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import SavedPlans from './pages/SavedPlans';
import { fetchWithAuth, wakeupServer } from './api';

function MainApp() {
  const [routes, setRoutes] = useState([]);
  const [optimizeFor, setOptimizeFor] = useState('punctuality');
  const [dispatchMode, setDispatchMode] = useState('demand');
  const [solutions, setSolutions] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [mapView, setMapView] = useState('Streets (Default)');

  useEffect(() => {
    const savedPlanStr = localStorage.getItem('load_plan');
    if (savedPlanStr) {
       try {
         const plan = JSON.parse(savedPlanStr);
         if (plan.solution) {
            setSolutions([plan.solution]);
         }
         if (plan.mode) setOptimizeFor(plan.mode);
         if (plan.input_locations && Array.isArray(plan.input_locations)) {
            setRoutes(plan.input_locations);
         }
         localStorage.removeItem('load_plan');
       } catch (err) {}
    }
  }, []);

  const handleRoutesChange = (newRoutes) => {
    setRoutes(newRoutes);
  };

  const handleOptimize = async (customParams = null) => {
    setLoading(true);
    setError(null);
    try {
      let endpoint = '/optimize';
      let bodyData = { locations: routes, num_vehicles: 20, optimize_for: optimizeFor };

      if (dispatchMode === 'frequency' && customParams) {
         endpoint = '/generate-frequency';
         bodyData = {
            locations: routes,
            num_buses: customParams.num_buses,
            start_time_minutes: customParams.start_time_minutes,
            end_time_minutes: customParams.end_time_minutes
         };
      }

      const response = await fetchWithAuth(endpoint, {
        method: 'POST',
        body: JSON.stringify(bodyData),
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      setSolutions(data.solutions);
    } catch (err) {
      console.error(err);
      setError('Failed to fetch optimize results. Is the backend running?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container relative" style={{ padding: 0, maxWidth: 'none' }}>
      <header className="flex justify-between items-center mb-8 animate-fade-in">
        <div className="flex items-center gap-4">
          <div style={{ background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-purple))', padding: '12px', borderRadius: '14px', boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)' }}>
            <Bus size={28} color="white" />
          </div>
          <div>
            <h1 className="text-gradient" style={{ fontSize: '1.8rem', letterSpacing: '-0.5px' }}>Smart Transport Optimizer</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '2px' }}>Intelligent Fleet Scheduling Platform</p>
          </div>
        </div>
        <button className="btn btn-secondary" onClick={() => { setRoutes([]); setSolutions(null); }}>
          <Settings size={18} />
          <span>Reset Interactive Map</span>
        </button>
      </header>

      <main className="grid flex-col gap-6">
        <section className="animate-fade-in" style={{ animationDelay: '0.1s' }}>
          <Dashboard solutions={solutions} loading={loading} />
        </section>
        
        <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
          <button className={`btn ${dispatchMode === 'demand' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => {setDispatchMode('demand'); setSolutions(null);}}>
            Demand Routing (ILP)
          </button>
          <button className={`btn ${dispatchMode === 'frequency' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => {setDispatchMode('frequency'); setSolutions(null);}}>
            Selective Routing (Frequency)
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(350px, 1fr) 2fr', gap: '24px', alignItems: 'start' }}>
          <section className="animate-fade-in custom-scrollbar" style={{ animationDelay: '0.2s', maxHeight: 'calc(100vh - 200px)', overflowY: 'auto', paddingRight: '8px' }}>
            {dispatchMode === 'demand' ? (
              <RouteForm 
                routes={routes} 
                onRoutesChange={handleRoutesChange} 
                onOptimize={handleOptimize}
                loading={loading}
                optimizeFor={optimizeFor}
                setOptimizeFor={setOptimizeFor}
                mapView={mapView}
                setMapView={setMapView}
              />
            ) : (
              <SelectiveRouteForm 
                routes={routes} 
                onRoutesChange={handleRoutesChange} 
                onOptimize={handleOptimize}
                loading={loading}
                optimizeFor={optimizeFor}
                setOptimizeFor={setOptimizeFor}
                mapView={mapView}
                setMapView={setMapView}
              />
            )}
          </section>
          
          <section className="animate-fade-in custom-scrollbar" style={{ animationDelay: '0.3s', maxHeight: 'calc(100vh - 200px)', overflowY: 'auto', paddingRight: '8px' }}>
            {error && (
              <div className="glass-panel" style={{ padding: '20px', borderColor: 'var(--accent-danger)', color: 'var(--accent-danger)' }}>
                {error}
              </div>
            )}
            <ResultsDisplay solutions={solutions} inputLocations={routes} loading={loading} mapView={mapView} setMapView={setMapView} optimizeFor={optimizeFor} />
          </section>
        </div>
      </main>
    </div>
  );
}

function App() {
  useEffect(() => {
    wakeupServer();
  }, []);

  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/" element={<Layout />}>
          <Route index element={<MainApp />} />
          <Route path="saved" element={<SavedPlans />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
