import React from 'react';
import { Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography, Box, Chip } from '@mui/material';

const TradeHistory = ({ trades }) => {
  return (
    <Paper sx={{ display: 'flex', flexDirection: 'column', height: 400 }}>
      <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Typography variant="h6">Recent Trades</Typography>
      </Box>
      <TableContainer sx={{ flexGrow: 1 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>Time</TableCell>
              <TableCell>Symbol</TableCell>
              <TableCell>Side</TableCell>
              <TableCell align="right">Size</TableCell>
              <TableCell align="right">Price</TableCell>
              <TableCell align="right">Latency</TableCell>
              <TableCell>Type</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {!trades || trades.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                  No recent trades
                </TableCell>
              </TableRow>
            ) : (
              trades.map((trade, index) => (
                <TableRow key={index} hover>
                  <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                    {new Date(trade.recordedAt).toLocaleTimeString()}
                  </TableCell>
                  <TableCell sx={{ fontWeight: 'bold', fontSize: '0.75rem' }}>{trade.symbol}</TableCell>
                  <TableCell>
                    <Chip 
                      label={trade.side === 'B' ? 'BUY' : 'SELL'} 
                      color={trade.side === 'B' ? 'success' : 'error'} 
                      size="small" 
                      sx={{ height: 20, fontSize: '0.65rem' }} 
                    />
                  </TableCell>
                  <TableCell align="right" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                    {parseFloat(trade.size).toFixed(4)}
                  </TableCell>
                  <TableCell align="right" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                    {parseFloat(trade.price).toFixed(2)}
                  </TableCell>
                  <TableCell align="right" sx={{ fontFamily: 'monospace', fontSize: '0.75rem', color: trade.latency > 1000 ? 'warning.main' : 'text.secondary' }}>
                    {trade.latency}ms
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                    {trade.type}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
};

export default TradeHistory;
