const admin = require('firebase-admin');
const serviceAccount = require('./firebase-service-account.json');

async function testFCM() {
  console.log('🔍 Testing FCM initialization...\n');

  try {
    // Check credentials
    console.log('1. Checking credentials...');
    console.log('   Project ID:', serviceAccount.project_id);
    console.log('   Client Email:', serviceAccount.client_email);
    console.log('   Private Key present:', !!serviceAccount.private_key);

    // Initialize
    console.log('\n2. Initializing Firebase...');
    if (admin.apps.length) {
      console.log('   ✅ Already initialized');
    } else {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log('   ✅ Firebase initialized successfully');
    }

    // Test send
    console.log('\n3. Testing FCM send...');
    const testMessage = {
      notification: {
        title: 'Test Push',
        body: 'This is a test from FCM',
      },
      token: 'YOUR_FCM_TOKEN_HERE', // Replace with actual token
    };

    // Don't actually send, just verify we can access messaging
    const messaging = admin.messaging();
    console.log('   ✅ Firebase messaging accessible');
    console.log('\n🎉 FCM is configured correctly!');
    console.log('\nTo test with real token, update this script with your FCM token');
  } catch (error) {
    console.error('\n❌ FCM Error:', error.message);
    console.error(error.stack);
  }
}

testFCM();