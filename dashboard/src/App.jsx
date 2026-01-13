import React, { useState, useEffect, useMemo } from 'react';
import { 
  Box, Container, Grid, Paper, Typography, AppBar, Toolbar, 
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Card, CardContent, Chip, IconButton, Button, Switch, FormControlLabel,
  Divider, List, ListItem, ListItemText, Alert
} from '@mui/material';
import { 
  Refresh as RefreshIcon, 
  Error as ErrorIcon, 
  CheckCircle as CheckCircleIcon,
  FiberManualRecord as StatusIcon,
  TrendingUp, TrendingDown, AccountBalance, Speed
} from '@mui/icons-material';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip,
  LineChart, Line, XAxis, YAxis, CartesianGrid
} from 'recharts';

const API_BASE = window.location.origin;
const WS_URL = window.location.origin.replace(/^http/, 'ws');

function App() {
  const [snapshot, setSnapshot] = useState(null);
  const [logs, setLogs] = useState([]);
  const [connected, setConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);

  useEffect(() => {
    let ws;
    let reconnectTimer;

    const connect = () => {
      ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        setConnected(true);
        console.log('Connected to monitor WS');
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'snapshot' || msg.type === 'update') {
          setSnapshot(msg.data);
          setLastUpdate(new Date());
        } else if (msg.type === 'logs') {
          setLogs(msg.data);
        } else if (msg.type === 'log') {
          setLogs(prev => [msg.data, ...prev].slice(0, 100));
        }
      };

      ws.onclose = () => {
        setConnected(false);
        console.log('Monitor WS closed');
        reconnectTimer = setTimeout(connect, 3000);
      };

      ws.onerror = (err) => {
        console.error('WS error', err);
        ws.close();
      };
    };

    connect();

    return () => {
      if (ws) ws.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, []);

  if (!snapshot) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column' }}>
        <Typography variant="h5" gutterBottom>HypeFollow Monitoring</Typography>
        <Typography color="textSecondary">Waiting for data...</Typography>
      </Box>
    );
  }

  const { stats, accounts, mappings, config } = snapshot;

  return (
    <Box sx={{ flexGrow: 1, pb: 4 }}>
      <AppBar position="static" sx={{ mb: 3, bgcolor: 'background.paper', color: 'text.primary' }}>
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1, display: 'flex', alignItems: 'center' }}>
            HypeFollow Monitor
            <Chip 
              icon={<StatusIcon sx={{ fontSize: '12px !important' }} />} 
              label={connected ? "Live" : "Disconnected"} 
              color={connected ? "success" : "error"} 
              size="small" 
              sx={{ ml: 2 }} 
            />
          </Typography>
          <Typography variant="body2" sx={{ mr: 2 }} color="textSecondary">
            Last Update: {lastUpdate?.toLocaleTimeString()}
          </Typography>
          <Button 
            color={config.emergencyStop ? "error" : "success"} 
            variant="contained" 
            size="small"
            startIcon={<ErrorIcon />}
          >
            {config.emergencyStop ? "EMERGENCY STOPPED" : "SYSTEM ACTIVE"}
          </Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl">
        <Grid container spacing={3}>
          {/* Summary Cards */}
          <Grid item xs={12} sm={6} md={3}>
            <StatCard title="Total Orders" value={stats.totalOrders} icon={<TrendingUp color="primary" />} />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard title="Total Fills" value={stats.totalFills} icon={<Speed color="secondary" />} />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard title="Binance Equity" value={`$${accounts.binance.equity.toFixed(2)}`} icon={<AccountBalance color="success" />} />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard title="System Uptime" value={`${Math.floor(stats.uptime / 3600)}h ${Math.floor((stats.uptime % 3600) / 60)}m`} icon={<CheckCircleIcon color="info" />} />
          </Grid>

          {/* Account Details */}
          <Grid item xs={12} md={8}>
            <Paper sx={{ p: 2, mb: 3 }}>
              <Typography variant="h6" gutterBottom>Binance Positions</Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Symbol</TableCell>
                      <TableCell align="right">Amount</TableCell>
                      <TableCell align="right">Entry</TableCell>
                      <TableCell align="right">Mark</TableCell>
                      <TableCell align="right">PnL</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {accounts.binance.positions.length === 0 ? (
                      <TableRow><TableCell colSpan={5} align="center">No active positions</TableCell></TableRow>
                    ) : accounts.binance.positions.map((p) => (
                      <TableRow key={p.symbol}>
                        <TableCell component="th" scope="row">{p.symbol}</TableCell>
                        <TableCell align="right">{parseFloat(p.amount).toFixed(3)}</TableCell>
                        <TableCell align="right">{parseFloat(p.entryPrice).toFixed(2)}</TableCell>
                        <TableCell align="right">{parseFloat(p.markPrice).toFixed(2)}</TableCell>
                        <TableCell align="right" sx={{ color: parseFloat(p.unrealizedProfit) >= 0 ? '#4caf50' : '#f44336' }}>
                          {parseFloat(p.unrealizedProfit).toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>

            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>Active Order Mappings</Typography>
              <TableContainer sx={{ maxHeight: 300 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>Hyperliquid OID</TableCell>
                      <TableCell>Binance Order ID</TableCell>
                      <TableCell>Symbol</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {mappings.length === 0 ? (
                      <TableRow><TableCell colSpan={3} align="center">No active mappings</TableCell></TableRow>
                    ) : mappings.map((m) => (
                      <TableRow key={m.hyperOid}>
                        <TableCell>{m.hyperOid}</TableCell>
                        <TableCell>{m.binanceOrderId}</TableCell>
                        <TableCell>{m.symbol}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Grid>

          {/* Sidebar */}
          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 2, mb: 3 }}>
              <Typography variant="h6" gutterBottom>Followed Users</Typography>
              {Object.entries(accounts.hyperliquid).map(([address, equity]) => (
                <Box key={address} sx={{ mb: 1, p: 1, borderRadius: 1, bgcolor: 'action.hover' }}>
                  <Typography variant="caption" color="textSecondary" sx={{ display: 'block' }}>
                    {address}
                  </Typography>
                  <Typography variant="body1">
                    Equity: <strong>${equity.toFixed(2)}</strong>
                  </Typography>
                </Box>
              ))}
              <Divider sx={{ my: 2 }} />
              <Typography variant="body2" color="textSecondary">
                Mode: <strong>{config.mode.toUpperCase()}</strong>
              </Typography>
            </Paper>

            <Paper sx={{ p: 2, height: 500, display: 'flex', flexDirection: 'column' }}>
              <Typography variant="h6" gutterBottom>System Logs</Typography>
              <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
                <List dense>
                  {logs.map((log, i) => (
                    <ListItem key={i} sx={{ px: 0, py: 0.5 }}>
                      <ListItemText 
                        primary={log.message}
                        secondary={`${new Date(log.timestamp).toLocaleTimeString()} - ${log.level}`}
                        primaryTypographyProps={{ variant: 'body2', color: log.level === 'error' ? 'error' : 'inherit' }}
                        secondaryTypographyProps={{ variant: 'caption' }}
                      />
                    </ListItem>
                  ))}
                </List>
              </Box>
            </Paper>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}

function StatCard({ title, value, icon }) {
  return (
    <Card sx={{ bgcolor: 'background.paper' }}>
      <CardContent sx={{ display: 'flex', alignItems: 'center', p: '16px !important' }}>
        <Box sx={{ mr: 2 }}>{icon}</Box>
        <Box>
          <Typography color="textSecondary" variant="caption" gutterBottom>
            {title}
          </Typography>
          <Typography variant="h6">
            {value}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
}

export default App;
