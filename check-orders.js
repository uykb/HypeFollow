const axios = require('axios');

async function checkOpenOrders() {
  const user = '0xdae4df7207feb3b350e4284c8efe5f7dac37f637';
  const url = 'https://api.hyperliquid.xyz/info';
  
  try {
    const response = await axios.post(url, {
      type: "openOrders",
      user: user
    });
    
    console.log('Open Orders:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('Error fetching open orders:', error.message);
  }
}

checkOpenOrders();
