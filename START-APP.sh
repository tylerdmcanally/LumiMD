#!/bin/bash

echo "🚀 Starting LumiMD Mobile App..."
echo ""
echo "This will open the Expo development server."
echo ""

cd mobile

echo "📦 Checking dependencies..."
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

echo ""
echo "✨ Starting Expo..."
echo ""
echo "Once started, you can:"
echo "  • Press 'i' to open iOS Simulator"
echo "  • Press 'a' to open Android Emulator"
echo "  • Scan QR code with Expo Go app on your phone"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

npm start


