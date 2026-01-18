import React from 'react';
import { Paper, Typography, Box } from '@mui/material';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const EquityChart = ({ data }) => {
  if (!data || data.length === 0) {
    return (
      <Paper sx={{ p: 2, height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography color="text.secondary">等待权益数据...</Typography>
      </Paper>
    );
  }

  // Format data for display
  const formattedData = data.map(d => ({
    ...d,
    time: new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  }));

  return (
    <Paper sx={{ p: 2, height: 350 }}>
      <Typography variant="h6" gutterBottom>24小时权益走势</Typography>
      <ResponsiveContainer width="100%" height="90%">
        <LineChart data={formattedData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
          <XAxis dataKey="time" stroke="#8b949e" fontSize={12} />
          
          {/* Left Axis: HL Equity */}
          <YAxis yAxisId="left" stroke="#58a6ff" fontSize={12} domain={['auto', 'auto']} />
          
          {/* Right Axis: BN Equity */}
          <YAxis yAxisId="right" orientation="right" stroke="#3fb950" fontSize={12} domain={['auto', 'auto']} />
          
          <Tooltip 
            contentStyle={{ backgroundColor: '#161b22', borderColor: '#30363d', color: '#c9d1d9' }}
            itemStyle={{ color: '#c9d1d9' }}
          />
          <Legend />
          
          <Line yAxisId="left" type="monotone" dataKey="hlEquity" name="Hyperliquid ($)" stroke="#58a6ff" dot={false} strokeWidth={2} />
          <Line yAxisId="right" type="monotone" dataKey="bnEquity" name="币安 ($)" stroke="#3fb950" dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </Paper>
  );
};

export default EquityChart;
