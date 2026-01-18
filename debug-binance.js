const Binance = require('binance-api-node').default;
const config = require('config');

// Load config to get keys, or just use dummy if library allows
// The library might throw if keys are missing
const binanceConfig = config.get('binance');
const client = Binance({
  apiKey: binanceConfig.apiKey,
  apiSecret: binanceConfig.apiSecret,
});

console.log('Available futures methods:');
const methods = Object.keys(client).filter(k => k.startsWith('futures'));
console.log(methods);

if (client.futuresPositionSideDual) {
    console.log('futuresPositionSideDual exists');
} else {
    console.log('futuresPositionSideDual DOES NOT exist');
}
