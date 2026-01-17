const WebSocket = require('ws');

const ws = new WebSocket('wss://api.hyperliquid.xyz/ws');
const user = '0xdae4df7207feb3b350e4284c8efe5f7dac37f637';

ws.on('open', () => {
  console.log('Connected');
  
  // Subscribe to orderUpdates
  const msg = {
    method: "subscribe",
    subscription: {
      type: "orderUpdates",
      user: user
    }
  };
  console.log('Sending subscribe:', JSON.stringify(msg));
  ws.send(JSON.stringify(msg));
});

ws.on('message', (data) => {
  console.log('Received:', data.toString());
});

ws.on('error', (err) => {
  console.error('Error:', err);
});

ws.on('close', () => {
  console.log('Closed');
});
