import React from 'react';
import { Paper, Typography, Box, Divider, Avatar } from '@mui/material';
import { Person as PersonIcon } from '@mui/icons-material';

const FollowedUsers = ({ accounts, mode }) => {
  return (
    <Paper sx={{ p: 2, mb: 3 }}>
      <Typography variant="h6" gutterBottom>Followed Users</Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {Object.entries(accounts.hyperliquid).map(([address, equity]) => (
          <Box 
            key={address} 
            sx={{ 
                p: 1.5, 
                borderRadius: 1, 
                bgcolor: 'background.default', 
                border: '1px solid', 
                borderColor: 'divider',
                display: 'flex',
                alignItems: 'center'
            }}
          >
            <Avatar sx={{ width: 32, height: 32, mr: 1.5, bgcolor: 'primary.dark' }}>
                <PersonIcon fontSize="small" />
            </Avatar>
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {address}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                  Equity: ${equity.toFixed(2)}
                </Typography>
            </Box>
          </Box>
        ))}
      </Box>
      <Divider sx={{ my: 2 }} />
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="body2" color="text.secondary">Operating Mode</Typography>
        <Typography variant="body2" sx={{ fontWeight: 'bold', bgcolor: 'primary.dark', px: 1, borderRadius: 0.5, fontSize: '0.75rem' }}>
            {mode.toUpperCase()}
        </Typography>
      </Box>
    </Paper>
  );
};

export default FollowedUsers;
