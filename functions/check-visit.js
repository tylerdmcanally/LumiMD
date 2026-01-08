const admin = require('firebase-admin');
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: 'lumimd-dev'
});
const db = admin.firestore();

async function main() {
  const visitId = process.argv[2] || 'S0vi8HW5yjz6HbUlAwQs';
  const doc = await db.collection('visits').doc(visitId).get();
  if (!doc.exists) {
    console.log('Visit not found:', visitId);
    return;
  }
  const data = doc.data();
  console.log('Visit ID:', visitId);
  console.log('Status:', data.status);
  console.log('Processing Status:', data.processingStatus);
  console.log('Created:', data.createdAt?.toDate?.() || data.createdAt);
  console.log('User ID:', data.userId);
  
  // If stuck in processing/transcribing, reset
  if (['processing', 'transcribing', 'transcription_pending'].includes(data.processingStatus)) {
    console.log('\n⚠️  Visit appears stuck. Resetting to pending...');
    await db.collection('visits').doc(visitId).update({
      processingStatus: 'pending',
      status: 'pending'
    });
    console.log('✅ Reset to pending. Cloud function should pick it up.');
  } else {
    console.log('\nVisit status looks okay:', data.processingStatus);
  }
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
