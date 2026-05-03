import React from 'react';
import { Bus, GaugeCircle, Target, TrendingUp } from 'lucide-react';

const StatCard = ({ title, value, subtitle, icon, color }) => (
  <div className="glass-panel" style={{ padding: '24px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
    <div>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 500, marginBottom: '8px' }}>{title}</p>
      <h3 style={{ fontSize: '2rem', fontWeight: 700, margin: '0 0 4px', color: 'var(--text-primary)' }}>{value}</h3>
      {subtitle && <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{subtitle}</p>}
    </div>
    <div style={{ background: `rgba(${color}, 0.15)`, padding: '12px', borderRadius: '12px', color: `rgb(${color})` }}>
      {icon}
    </div>
  </div>
);

const Dashboard = ({ solutions, loading }) => {
  if (loading) {
    return (
      <div className="grid-cards">
        {[1, 2, 3].map(i => (
          <div key={i} className="glass-panel" style={{ padding: '24px', minHeight: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: '30px', height: '30px', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--accent-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
          </div>
        ))}
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const bestSolution = solutions && solutions.length > 0 ? solutions[0] : null;

  return (
    <div className="grid-cards">
      <StatCard 
        title="Fleet Efficiency" 
        value={bestSolution ? bestSolution.metrics.buses : '-'} 
        subtitle="Buses Required (Min)" 
        icon={<Bus size={24} />} 
        color="59, 130, 246" // primary
      />
      <StatCard 
        title="Timing Penalty" 
        value={bestSolution ? bestSolution.metrics.penalty : '-'} 
        subtitle="Total schedule deviation" 
        icon={<Target size={24} />} 
        color="239, 68, 68" // danger
      />
      <StatCard 
        title="Optimization Score" 
        value={bestSolution ? bestSolution.metrics.score : '-'} 
        subtitle="Lower is better" 
        icon={<TrendingUp size={24} />} 
        color="16, 185, 129" // success
      />
    </div>
  );
};

export default Dashboard;
