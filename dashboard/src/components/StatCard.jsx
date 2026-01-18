import React from 'react';
import { Card, CardContent, Box, Typography, Avatar } from '@mui/material';
import { alpha } from '@mui/material/styles';

const StatCard = ({ title, value, icon, color = 'primary' }) => {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ display: 'flex', alignItems: 'center', p: 2, '&:last-child': { pb: 2 } }}>
        <Box sx={{ mr: 2 }}>
          <Avatar
            variant="rounded"
            sx={{
              bgcolor: (theme) => alpha(theme.palette[color].main, 0.1),
              color: (theme) => theme.palette[color].main,
              width: 48,
              height: 48,
            }}
          >
            {icon}
          </Avatar>
        </Box>
        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5, fontSize: '0.7rem' }}>
            {title}
          </Typography>
          <Typography variant="h6" component="div" sx={{ fontWeight: 'bold' }}>
            {value}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
};

export default StatCard;
