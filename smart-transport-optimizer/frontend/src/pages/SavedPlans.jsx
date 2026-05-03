import React, { useState, useEffect } from 'react';
import { Bookmark, Trash2, Copy, Play, Loader, AlertTriangle } from 'lucide-react';
import { fetchWithAuth } from '../api';
import { useNavigate } from 'react-router-dom';

const SavedPlans = () => {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const fetchPlans = async () => {
    try {
      setLoading(true);
      const res = await fetchWithAuth('/schedules');
      if (!res.ok) throw new Error('Failed to fetch schedules');
      const data = await res.json();
      setPlans(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this plan?')) return;
    try {
      const res = await fetchWithAuth(`/schedule/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setPlans(plans.filter(p => p._id !== id));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDuplicate = async (id) => {
    try {
      const res = await fetchWithAuth(`/duplicate/${id}`, { method: 'POST' });
      if (res.ok) {
        fetchPlans();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleFavorite = async (id) => {
    try {
      const res = await fetchWithAuth(`/favorite/${id}`, { method: 'POST' });
      if (res.ok) {
         setPlans(plans.map(p => p._id === id ? { ...p, is_favorite: !p.is_favorite } : p));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleLoad = (plan) => {
     localStorage.setItem('load_plan', JSON.stringify(plan));
     navigate('/');
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'white' }}><Loader className="animate-spin" /></div>;

  return (
    <div className="animate-fade-in">
      <h2 className="text-gradient" style={{ fontSize: '1.8rem', letterSpacing: '-0.5px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '12px' }}>
         <Bookmark size={28} color="var(--accent-primary)" />
         Saved Plans
      </h2>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '32px' }}>Manage and analyze your saved fleet deployments.</p>

      {error && <div className="glass-panel" style={{ padding: '16px', color: 'var(--accent-danger)', marginBottom: '24px' }}>{error}</div>}

      {plans.length === 0 && !error ? (
        <div className="glass-panel" style={{ padding: '48px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <Bookmark size={48} style={{ opacity: 0.2, margin: '0 auto 16px' }} />
          <h3>No plans saved yet</h3>
          <p>Go to the Interactive Dispatch map to generate and save a fleet schedule.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '24px' }}>
          {plans.map(plan => (
            <div key={plan._id} className="glass-panel" style={{ padding: '24px', position: 'relative', border: plan.is_favorite ? '1px solid var(--accent-primary)' : '' }}>
               <div style={{ position: 'absolute', top: '16px', right: '16px', cursor: 'pointer', opacity: plan.is_favorite ? 1 : 0.3 }} onClick={() => handleToggleFavorite(plan._id)}>
                 <Bookmark size={24} fill={plan.is_favorite ? "var(--accent-primary)" : "none"} color={plan.is_favorite ? "var(--accent-primary)" : "var(--text-primary)"} />
               </div>
               
               <h3 style={{ fontSize: '1.2rem', marginBottom: '8px', paddingRight: '32px' }}>{plan.name}</h3>
               <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>{new Date(plan.created_at).toLocaleString()}</p>
               
               <div style={{ background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '8px', marginBottom: '16px', border: '1px solid var(--border-color)' }}>
                 <p style={{ fontWeight: 600, color: 'var(--accent-primary)', marginBottom: '4px', fontSize: '0.95rem' }}>{plan.summary}</p>
                 <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                   <span style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.05)', padding: '4px 8px', borderRadius: '20px' }}>{plan.mode === 'punctuality' ? 'Strict Mode' : 'Utilization Mode'}</span>
                   <span style={{ fontSize: '0.75rem', background: plan.penalty === 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)', color: plan.penalty === 0 ? 'var(--accent-success)' : 'var(--accent-warning)', padding: '4px 8px', borderRadius: '20px' }}>
                     {plan.status}
                   </span>
                 </div>
               </div>

               <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
                 <button className="btn btn-primary" style={{ flexGrow: 1, padding: '8px', fontSize: '0.9rem' }} onClick={() => handleLoad(plan)}>
                   <Play size={16} /> Load
                 </button>
                 <button className="btn btn-secondary" style={{ padding: '8px' }} onClick={() => handleDuplicate(plan._id)} title="Duplicate">
                   <Copy size={16} />
                 </button>
                 <button className="btn btn-secondary" style={{ padding: '8px', color: 'var(--accent-danger)' }} onClick={() => handleDelete(plan._id)} title="Delete">
                   <Trash2 size={16} />
                 </button>
               </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SavedPlans;
