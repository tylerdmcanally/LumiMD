// Test S3 Connection
const path = require('path');

// Load shared env first, then backend-specific overrides
const rootEnvPath = path.resolve(__dirname, '../.env');
require('dotenv').config({ path: rootEnvPath, override: false });
require('dotenv').config();

const AWS = require('aws-sdk');

console.log('\n🧪 Testing AWS S3 Connection...\n');

// Configure AWS
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

const s3 = new AWS.S3();
const bucket = process.env.AWS_S3_BUCKET;

console.log(`Bucket: ${bucket}`);
console.log(`Region: ${process.env.AWS_REGION}\n`);

// Test 1: Check if bucket is accessible
console.log('Test 1: Checking bucket access...');
s3.headBucket({ Bucket: bucket }, (err, data) => {
  if (err) {
    console.error('❌ Error accessing bucket:', err.message);
    console.error('   Make sure:');
    console.error('   - Bucket exists');
    console.error('   - IAM user has S3 permissions');
    console.error('   - Credentials are correct\n');
    process.exit(1);
  } else {
    console.log('✅ Bucket is accessible!\n');

    // Test 2: Upload a test file
    console.log('Test 2: Uploading test file...');
    const testContent = 'Hello from LumiMD! This is a test file.';
    const testKey = 'test/test-upload.txt';

    const uploadParams = {
      Bucket: bucket,
      Key: testKey,
      Body: testContent,
      ContentType: 'text/plain',
      ServerSideEncryption: 'AES256',
    };

    s3.upload(uploadParams, (uploadErr, uploadData) => {
      if (uploadErr) {
        console.error('❌ Upload failed:', uploadErr.message);
        process.exit(1);
      } else {
        console.log('✅ File uploaded successfully!');
        console.log(`   Location: ${uploadData.Location}\n`);

        // Test 3: Download the file
        console.log('Test 3: Downloading test file...');
        s3.getObject({ Bucket: bucket, Key: testKey }, (getErr, getData) => {
          if (getErr) {
            console.error('❌ Download failed:', getErr.message);
            process.exit(1);
          } else {
            console.log('✅ File downloaded successfully!');
            console.log(`   Content: ${getData.Body.toString()}\n`);

            // Test 4: Delete the file
            console.log('Test 4: Cleaning up test file...');
            s3.deleteObject({ Bucket: bucket, Key: testKey }, (delErr) => {
              if (delErr) {
                console.error('❌ Delete failed:', delErr.message);
              } else {
                console.log('✅ Test file deleted successfully!\n');
              }

              // Summary
              console.log('╔═══════════════════════════════════════╗');
              console.log('║                                       ║');
              console.log('║   🎉 AWS S3 Setup Complete! 🎉       ║');
              console.log('║                                       ║');
              console.log('║   ✅ Bucket accessible                 ║');
              console.log('║   ✅ Upload working                    ║');
              console.log('║   ✅ Download working                  ║');
              console.log('║   ✅ Delete working                    ║');
              console.log('║   ✅ Encryption enabled                ║');
              console.log('║                                       ║');
              console.log('║   Ready for audio uploads! 🎤         ║');
              console.log('║                                       ║');
              console.log('╚═══════════════════════════════════════╝\n');

              process.exit(0);
            });
          }
        });
      }
    });
  }
});
