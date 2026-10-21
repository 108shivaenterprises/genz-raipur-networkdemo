import React from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, PieChart, Pie, Cell, CartesianGrid } from 'recharts';

/** v20 — dashboard charts live in their own file so the dashboard numbers paint before the chart library arrives. */
export const DealStageChart: React.FC<{ data: any[]; tooltip: React.ReactElement; volumeName: string; countName: string }> = ({ data, tooltip, volumeName, countName }) => (
  <ResponsiveContainer width="100%" height="100%">
    <BarChart data={data} margin={{ top: 10, right: 30, left: -10, bottom: 25 }}>
      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
      <XAxis dataKey="stage" tick={{ fontSize: 11, fill: '#64748b' }} angle={-20} textAnchor="end" interval={0} />
      <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(val) => (val >= 100000 ? `${(val / 100000).toFixed(0)}L` : String(val))} />
      <YAxis yAxisId="right" orientation="right" allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(val) => `${val}`} />
      <Tooltip content={tooltip} />
      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
      <Bar yAxisId="left" dataKey="brokerageVolume" name={volumeName} fill="#0f172a" radius={[4, 4, 0, 0]} />
      <Bar yAxisId="right" dataKey="dealsCount" name={countName} fill="#f59e0b" radius={[4, 4, 0, 0]} />
    </BarChart>
  </ResponsiveContainer>
);

export const CommissionPie: React.FC<{ data: { name: string; value: number; color: string }[]; tooltip: React.ReactElement }> = ({ data, tooltip }) => (
  <ResponsiveContainer width="100%" height="100%">
    <PieChart>
      <Pie data={data} cx="50%" cy="50%" innerRadius={48} outerRadius={75} paddingAngle={4} dataKey="value">
        {data.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
      </Pie>
      <Tooltip content={tooltip} />
    </PieChart>
  </ResponsiveContainer>
);

export const LocalityChart: React.FC<{ data: any[]; tooltip: React.ReactElement; valueName: string; countName: string }> = ({ data, tooltip, valueName, countName }) => (
  <ResponsiveContainer width="100%" height="100%">
    <BarChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
      <XAxis dataKey="locality" tick={{ fontSize: 11, fill: '#64748b' }} />
      <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(val) => `${(val / 10000000).toFixed(1)} Cr`} />
      <Tooltip content={tooltip} />
      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
      <Bar dataKey="valuation" name={valueName} fill="#10b981" radius={[4, 4, 0, 0]} />
      <Bar dataKey="count" name={countName} fill="#3b82f6" radius={[4, 4, 0, 0]} />
    </BarChart>
  </ResponsiveContainer>
);
