#!/bin/bash

# Script to generate Firebase Admin SDK credentials for Vercel
PROJECT_ID="lumimd-dev"
SERVICE_ACCOUNT="firebase-adminsdk@${PROJECT_ID}.iam.gserviceaccount.com"
KEY_FILE="./firebase-admin-key.json"

echo "🔥 Generating Firebase Admin SDK credentials for Vercel..."
echo ""
echo "Project: $PROJECT_ID"
echo "Service Account: $SERVICE_ACCOUNT"
echo ""

# Check if gcloud is authenticated
echo "📝 Creating service account key using gcloud..."
/Users/tylermcanally/Desktop/LumiMD/bash/google-cloud-sdk/bin/gcloud iam service-accounts keys create "$KEY_FILE" \
    --iam-account="$SERVICE_ACCOUNT" \
    --project="$PROJECT_ID"

if [ ! -f "$KEY_FILE" ]; then
    echo "❌ Failed to create service account key"
    echo ""
    echo "Possible issues:"
    echo "  - Service account doesn't exist"
    echo "  - Not authenticated with gcloud"
    echo "  - Insufficient permissions"
    echo ""
    echo "Try running: gcloud auth login"
    exit 1
fi

echo "✅ Service account key created"
echo ""

# Extract values from JSON using Python (more reliable than grep)
echo "📋 Extracting credentials for Vercel environment variables:"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

python3 << 'PYTHON_SCRIPT'
import json

with open('./firebase-admin-key.json', 'r') as f:
    data = json.load(f)

print("FIREBASE_PROJECT_ID=" + data['project_id'])
print("")
print("FIREBASE_CLIENT_EMAIL=" + data['client_email'])
print("")
print("FIREBASE_PRIVATE_KEY=")
print(data['private_key'])
PYTHON_SCRIPT

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📝 Next Steps:"
echo "  1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables"
echo "  2. Add the three variables above (copy the entire value for each)"
echo "  3. For FIREBASE_PRIVATE_KEY, include the entire key with:"
echo "     -----BEGIN PRIVATE KEY-----"
echo "     ...content..."
echo "     -----END PRIVATE KEY-----"
echo "  4. Save and redeploy"
echo ""
echo "🔒 Security:"
echo "   - The key file has been saved to: $KEY_FILE"
echo "   - DO NOT commit this file to git"
echo "   - It has been added to .gitignore"
echo ""

# Add to .gitignore if not already there
if ! grep -q "firebase-admin-key.json" .gitignore 2>/dev/null; then
    echo "firebase-admin-key.json" >> .gitignore
    echo "✅ Added firebase-admin-key.json to .gitignore"
fi

echo "✨ Done!"
