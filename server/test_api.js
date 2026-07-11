// Node 18+ supports native global fetch, no import needed.

const PORT = 3001;
const BASE_URL = `http://localhost:${PORT}`;

async function runTests() {
  console.log('🧪 Starting Stadium AI Copilot Integration Tests...\n');

  try {
    // Test 1: Fetch gate status
    console.log('1. Fetching gate status...');
    const statusRes = await fetch(`${BASE_URL}/api/gate-status`);
    if (!statusRes.ok) throw new Error('Gate status endpoint failed');
    const statusData = await statusRes.json();
    console.log('✅ Gate Status Success! Sample Data:', JSON.stringify(statusData, null, 2));

    // Test 2: Send navigation question
    console.log('\n2. Testing Fan Chat (Navigation Question)...');
    const navRes = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Where is the nearest bathroom?' })
    });
    if (!navRes.ok) throw new Error('Navigation Chat failed');
    const navData = await navRes.json();
    console.log('✅ Navigation Chat Success!');
    console.log('   Agent Used:', navData.agent_used);
    console.log('   Reply:', navData.reply);

    // Test 3: Send wait times question
    console.log('\n3. Testing Fan Chat (Crowd Question)...');
    const crowdRes = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Which gate has the shortest queue right now?' })
    });
    if (!crowdRes.ok) throw new Error('Crowd Chat failed');
    const crowdData = await crowdRes.json();
    console.log('✅ Crowd Chat Success!');
    console.log('   Agent Used:', crowdData.agent_used);
    console.log('   Reply:', crowdData.reply);

    // Test 4: Send Spanish translation question
    console.log('\n4. Testing Fan Chat (Spanish Language Question)...');
    const langRes = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '¿Dónde está la Puerta C?', language: 'Spanish' })
    });
    if (!langRes.ok) throw new Error('Language Chat failed');
    const langData = await langRes.json();
    console.log('✅ Language Chat Success!');
    console.log('   Agent Used:', langData.agent_used);
    console.log('   Reply:', langData.reply);

    // Test 5: Fetch active staff alerts
    console.log('\n5. Fetching active staff alerts...');
    const alertRes = await fetch(`${BASE_URL}/api/staff-alerts`);
    if (!alertRes.ok) throw new Error('Staff Alerts endpoint failed');
    const alertData = await alertRes.json();
    console.log('✅ Staff Alerts Success! Active Alerts Count:', alertData.length);
    if (alertData.length > 0) {
      console.log('   Sample Alert Message:', alertData[0].message);
    }

    console.log('\n🎉 All endpoints successfully integrated and verified!');
  } catch (error) {
    console.error('\n❌ Test failed with error:', error.message);
  }
}

// Small delay to make sure server is up
setTimeout(runTests, 1500);
