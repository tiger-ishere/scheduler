import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Bookmark, LogOut, Bus } from 'lucide-react';
import { removeAuthToken, getUserContext } from '../api';

const Sidebar = () => {
  const user = getUserContext();

  const handleLogout = () => {
    removeAuthToken();
    window.location.href = '/login';
  };

  return (
    <div className="glass-panel" style={{ width: '260px', height: '100vh', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border-color)', borderRadius: 0, zIndex: 100 }}>
      <div style={{ padding: '24px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-purple))', padding: '10px', borderRadius: '12px', boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)' }}>
          <Bus size={24} color="white" />
        </div>
        <div>
           <h1 className="text-gradient" style={{ fontSize: '1.2rem', margin: 0, fontWeight: 700 }}>SmartFleet</h1>
           <span style={{fontSize: '0.7rem', color: 'var(--text-secondary)'}}>Optimization Engine</span>
        </div>
      </div>

      <nav style={{ padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: '8px', flexGrow: 1 }}>
        <p style={{fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-secondary)', marginBottom: '8px', paddingLeft: '8px', fontWeight: 600}}>Menu</p>
        <NavLink to="/" className={({isActive}) => isActive ? "nav-link active" : "nav-link"} end>
          <Home size={18} /> Interactive Dispatch
        </NavLink>
        <NavLink to="/saved" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>
          <Bookmark size={18} /> Saved Plans
        </NavLink>
      </nav>

      <div style={{ padding: '20px', borderTop: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ minWidth: '36px', height: '36px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent-purple), var(--accent-primary))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }}>
            {user?.name?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div style={{ overflow: 'hidden' }}>
            <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{user?.name || 'User'}</p>
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{user?.email || 'email@example.com'}</p>
          </div>
        </div>
        <button onClick={handleLogout} className="btn" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center', padding: '10px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--accent-danger)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
          <LogOut size={16} /> Secure Logout
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
