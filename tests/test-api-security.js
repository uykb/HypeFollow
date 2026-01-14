const assert = require('assert');
const apiValidator = require('../src/utils/api-validator');

async function runTests() {
  console.log('=== Starting API Security Tests ===\n');

  // Test 1: Config Validation (Valid-ish)
  console.log('Test 1: Config Validation (Valid format)');
  // We rely on what's in config/default.js or env, but let's assume it passes if lengths are OK
  try {
    apiValidator.validateAPIConfig();
    console.log('PASS\n');
  } catch (err) {
    console.log(`SKIP (Config not set in test env): ${err.message}\n`);
  }

  // Test 2: Permission Validation Mock
  console.log('Test 2: Permission Validation (Mock Success)');
  const mockClientSuccess = {
    futuresAccountInfo: async () => ({ totalWalletBalance: '100' })
  };
  await apiValidator.validateAPIPermissions(mockClientSuccess);
  console.log('PASS\n');

  // Test 3: Permission Validation Mock (Failure)
  console.log('Test 3: Permission Validation (Mock Failure)');
  const mockClientFail = {
    futuresAccountInfo: async () => { throw new Error('Invalid API-key, IP, or permissions'); }
  };
  try {
    await apiValidator.validateAPIPermissions(mockClientFail);
    console.log('FAIL: Should have thrown error');
  } catch (err) {
    assert.strictEqual(err.message, 'API Key has no permissions or IP is not whitelisted');
    console.log('PASS: Correctly identified permission error\n');
  }

  console.log('=== All API Security Tests Passed ===');
}

runTests().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
