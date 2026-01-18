import React from 'react';
import { Paper, List, ListItem, ListItemText, Typography, Box, Chip } from '@mui/material';

const LogsPanel = ({ logs }) => {
  return (
    <Paper sx={{ display: 'flex', flexDirection: 'column', height: 500 }}>
      <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6">System Logs</Typography>
        <Typography variant="caption" color="text.secondary">{logs.length} entries</Typography>
      </Box>
      <Box sx={{ flexGrow: 1, overflow: 'auto', p: 1, bgcolor: '#0d1117' }}>
        <List dense disablePadding>
          {logs.map((log, i) => (
            <ListItem 
                key={i} 
                sx={{ 
                    borderLeft: '2px solid', 
                    borderColor: log.level === 'error' ? 'error.main' : (log.level === 'warn' ? 'warning.main' : 'info.main'),
                    mb: 0.5,
                    bgcolor: 'background.paper',
                    borderRadius: '0 4px 4px 0',
                    '&:hover': { bgcolor: 'action.hover' }
                }}
            >
              <ListItemText 
                primary={
                    <Box component="span" sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem', mr: 1, wordBreak: 'break-all' }}>
                            {log.message}
                        </Typography>
                    </Box>
                }
                secondary={
                    <Box component="span" sx={{ display: 'flex', alignItems: 'center', mt: 0.5 }}>
                        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', fontSize: '0.7rem' }}>
                            {new Date(log.timestamp).toLocaleTimeString()}
                        </Typography>
                        <Typography variant="caption" sx={{ ml: 1, textTransform: 'uppercase', fontSize: '0.65rem', fontWeight: 'bold', color: log.level === 'error' ? 'error.main' : 'text.secondary' }}>
                            {log.level}
                        </Typography>
                    </Box>
                }
              />
            </ListItem>
          ))}
        </List>
      </Box>
    </Paper>
  );
};

export default LogsPanel;
