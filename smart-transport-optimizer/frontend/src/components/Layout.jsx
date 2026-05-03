import React from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import { getAuthToken } from '../api';

const Layout = () => {
  const token = getAuthToken();
  if (!token) return <Navigate to="/login" replace />;

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden', background: 'var(--bg-gradient)' }}>
      <Sidebar />
      <div style={{ flexGrow: 1, overflowY: 'auto', padding: '32px' }}>
        <Outlet />
      </div>
    </div>
  );
};

export default Layout;
