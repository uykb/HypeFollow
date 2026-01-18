import React from 'react';
import { 
  Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, 
  Typography, Box, Grid, Card, CardContent, Divider, useTheme, useMediaQuery 
} from '@mui/material';

const PositionCard = ({ position }) => {
  const pnl = parseFloat(position.unrealizedProfit);
  const isProfit = pnl >= 0;

  return (
    <Card sx={{ mb: 2 }}>
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 'bold', color: 'text.primary' }}>
            {position.symbol}
          </Typography>
          <Typography 
            variant="h6" 
            sx={{ fontWeight: 'bold', color: isProfit ? 'success.main' : 'error.main' }}
          >
            {pnl.toFixed(2)}
          </Typography>
        </Box>
        <Divider sx={{ my: 1 }} />
          <Grid container spacing={1}>
            <Grid item xs={6}>
              <Typography variant="caption" color="text.secondary">Amount</Typography>
              <Typography variant="body2">{parseFloat(position.amount).toFixed(3)}</Typography>
            </Grid>
            <Grid item xs={6}>
              <Typography variant="caption" color="text.secondary">Entry</Typography>
              <Typography variant="body2">{parseFloat(position.entryPrice).toFixed(2)}</Typography>
            </Grid>
            <Grid item xs={6}>
              <Typography variant="caption" color="text.secondary">Mark</Typography>
              <Typography variant="body2">{parseFloat(position.markPrice).toFixed(2)}</Typography>
            </Grid>
            <Grid item xs={6}>
              <Typography variant="caption" color="text.secondary">Liq Price</Typography>
              <Typography variant="body2" sx={{ color: 'warning.main' }}>
                {parseFloat(position.liquidationPrice) > 0 ? parseFloat(position.liquidationPrice).toFixed(2) : '--'}
              </Typography>
            </Grid>
          </Grid>
        </CardContent>
      </Card>
    );
  };
  
  const PositionsList = ({ positions }) => {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  
    if (!positions || positions.length === 0) {
      return (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography color="text.secondary">No active positions</Typography>
        </Paper>
      );
    }
  
    if (isMobile) {
      return (
        <Box>
           <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">Binance Positions</Typography>
              <Typography variant="caption" sx={{ bgcolor: 'background.paper', px: 1, py: 0.5, borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
                  {positions.length} Active
              </Typography>
           </Box>
          {positions.map((p) => (
            <PositionCard key={p.symbol} position={p} />
          ))}
        </Box>
      );
    }
  
    return (
      <Paper sx={{ overflow: 'hidden' }}>
        <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography variant="h6">Binance Positions</Typography>
        </Box>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Symbol</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell align="right">Entry</TableCell>
                <TableCell align="right">Mark Price</TableCell>
                <TableCell align="right">Liq Price</TableCell>
                <TableCell align="right">PnL (USDT)</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {positions.map((p) => {
                 const pnl = parseFloat(p.unrealizedProfit);
                 const liqPrice = parseFloat(p.liquidationPrice);
                 return (
                  <TableRow key={p.symbol} hover>
                      <TableCell component="th" scope="row" sx={{ fontWeight: 'bold' }}>{p.symbol}</TableCell>
                      <TableCell align="right" sx={{ fontFamily: 'monospace' }}>{parseFloat(p.amount).toFixed(3)}</TableCell>
                      <TableCell align="right" sx={{ fontFamily: 'monospace' }}>{parseFloat(p.entryPrice).toFixed(2)}</TableCell>
                      <TableCell align="right" sx={{ fontFamily: 'monospace' }}>{parseFloat(p.markPrice).toFixed(2)}</TableCell>
                      <TableCell align="right" sx={{ fontFamily: 'monospace', color: 'warning.main' }}>
                        {liqPrice > 0 ? liqPrice.toFixed(2) : '--'}
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 'bold', color: pnl >= 0 ? 'success.main' : 'error.main' }}>
                      {pnl.toFixed(2)}
                      </TableCell>
                  </TableRow>
                 );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    );
  };
  
  export default PositionsList;
