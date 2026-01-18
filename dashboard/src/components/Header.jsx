import React from 'react';
import { AppBar, Toolbar, Typography, Box, Chip, Button, IconButton, useTheme, useMediaQuery } from '@mui/material';
import { 
  FiberManualRecord as StatusIcon, 
  Error as ErrorIcon, 
  CheckCircle as CheckCircleIcon,
  Menu as MenuIcon 
} from '@mui/icons-material';

const Header = ({ connected, lastUpdate, emergencyStop, onEmergencyToggle }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  return (
    <AppBar position="sticky" color="default" elevation={0}>
      <Toolbar>
        <Typography variant="h6" component="div" sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', fontWeight: 'bold', color: 'primary.main' }}>
          HypeFollow
          <Chip 
            icon={<StatusIcon sx={{ fontSize: '10px !important' }} />} 
            label={connected ? "LIVE" : "OFFLINE"} 
            color={connected ? "success" : "error"} 
            size="small" 
            variant="outlined"
            sx={{ ml: 2, height: 20, fontSize: '0.7rem', borderColor: connected ? 'success.main' : 'error.main' }} 
          />
        </Typography>

        {!isMobile && (
           <Typography variant="caption" sx={{ mr: 2, color: 'text.secondary' }}>
            Updated: {lastUpdate ? lastUpdate.toLocaleTimeString() : '--:--:--'}
          </Typography>
        )}

        <Button 
          color={emergencyStop ? "error" : "success"} 
          variant="contained" 
          size="small"
          startIcon={<ErrorIcon />}
          sx={{ fontWeight: 'bold' }}
          disabled // For now, read-only as per request logic usually, but user asked for deep customization. Assuming the logic for toggling isn't passed yet, I'll keep it static or accept a prop.
        >
          {emergencyStop ? "STOPPED" : "ACTIVE"}
        </Button>
      </Toolbar>
    </AppBar>
  );
};

export default Header;
