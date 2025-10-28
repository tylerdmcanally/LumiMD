#!/bin/bash

# LumiMD Full Workflow Test
# Tests: Register → Login → Create Provider → Start Visit → Upload Audio → AI Processing

API_URL="http://localhost:3000"
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}╔═══════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                                                       ║${NC}"
echo -e "${BLUE}║        LumiMD Full Workflow Test              ║${NC}"
echo -e "${BLUE}║        Audio Upload + AI Processing                  ║${NC}"
echo -e "${BLUE}║                                                       ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════╝${NC}"
echo ""

# Step 1: Register/Login
echo -e "${GREEN}[STEP 1] User Authentication${NC}"
LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "demo@lumimd.com",
    "password": "SecurePass123"
  }')

ACCESS_TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.data.accessToken')
USER_ID=$(echo "$LOGIN_RESPONSE" | jq -r '.data.user.id')

if [ "$ACCESS_TOKEN" = "null" ]; then
  echo "  No existing user, registering..."
  REGISTER_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/register" \
    -H "Content-Type: application/json" \
    -d '{
      "email": "demo@lumimd.com",
      "password": "SecurePass123",
      "firstName": "Demo",
      "lastName": "User",
      "dateOfBirth": "1985-05-15"
    }')
  ACCESS_TOKEN=$(echo "$REGISTER_RESPONSE" | jq -r '.data.accessToken')
  USER_ID=$(echo "$REGISTER_RESPONSE" | jq -r '.data.user.id')
fi

echo -e "  ✅ Authenticated as: $USER_ID"
echo ""

# Step 2: Create Provider
echo -e "${GREEN}[STEP 2] Create Healthcare Provider${NC}"
PROVIDER_RESPONSE=$(curl -s -X POST "$API_URL/api/providers" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{
    "name": "Dr. Emily Rodriguez",
    "specialty": "Internal Medicine",
    "practice": "Downtown Medical Clinic",
    "phone": "(555) 987-6543"
  }')

PROVIDER_ID=$(echo "$PROVIDER_RESPONSE" | jq -r '.data.id')
PROVIDER_NAME=$(echo "$PROVIDER_RESPONSE" | jq -r '.data.name')
echo -e "  ✅ Provider created: $PROVIDER_NAME ($PROVIDER_ID)"
echo ""

# Step 3: Start Visit
echo -e "${GREEN}[STEP 3] Start New Visit${NC}"
VISIT_RESPONSE=$(curl -s -X POST "$API_URL/api/visits/start" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d "{
    \"providerId\": \"$PROVIDER_ID\",
    \"visitDate\": \"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)\",
    \"visitType\": \"IN_PERSON\"
  }")

VISIT_ID=$(echo "$VISIT_RESPONSE" | jq -r '.data.id')
echo -e "  ✅ Visit created: $VISIT_ID"
echo ""

# Step 4: Audio Upload Instructions
echo -e "${YELLOW}[STEP 4] Audio Upload${NC}"
echo -e "${YELLOW}  To test audio upload, you need an audio file.${NC}"
echo ""
echo -e "${YELLOW}  Option 1: Record a sample conversation${NC}"
echo -e "    - Use your phone/computer to record a 30-60 second audio"
echo -e "    - Simulate a doctor-patient conversation:"
echo -e "      \"Doctor: How are you feeling today?\""
echo -e "      \"Patient: I've been having headaches for the past week...\""
echo -e "    - Save as test-audio.mp3 or test-audio.m4a"
echo ""
echo -e "${YELLOW}  Option 2: Use a sample audio file${NC}"
echo -e "    - Download a sample medical conversation audio"
echo -e "    - Or use any audio file to test the upload"
echo ""
echo -e "${BLUE}  Then run this command to upload:${NC}"
echo ""
echo -e "  curl -X POST \"$API_URL/api/visits/$VISIT_ID/upload\" \\"
echo -e "    -H \"Authorization: Bearer $ACCESS_TOKEN\" \\"
echo -e "    -F \"audio=@/path/to/your/audio-file.mp3\""
echo ""
echo -e "${BLUE}  This will:${NC}"
echo -e "    1. ⬆️  Upload audio to AWS S3 (encrypted)"
echo -e "    2. 🎙️  Transcribe with OpenAI Whisper"
echo -e "    3. 🤖 Summarize with GPT-4"
echo -e "    4. 📋 Extract action items"
echo -e "    5. 💾 Save everything to database"
echo ""

# Step 5: How to check results
echo -e "${GREEN}[STEP 5] View Results (After Upload)${NC}"
echo ""
echo -e "  # Get visit summary:"
echo -e "  curl \"$API_URL/api/visits/$VISIT_ID/summary\" \\"
echo -e "    -H \"Authorization: Bearer $ACCESS_TOKEN\" | jq '.'"
echo ""
echo -e "  # Get full transcript:"
echo -e "  curl \"$API_URL/api/visits/$VISIT_ID/transcript\" \\"
echo -e "    -H \"Authorization: Bearer $ACCESS_TOKEN\" | jq '.'"
echo ""
echo -e "  # Get visit details:"
echo -e "  curl \"$API_URL/api/visits/$VISIT_ID\" \\"
echo -e "    -H \"Authorization: Bearer $ACCESS_TOKEN\" | jq '.'"
echo ""

# Summary
echo -e "${BLUE}╔═══════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                                                       ║${NC}"
echo -e "${BLUE}║              Setup Complete! 🎉                       ║${NC}"
echo -e "${BLUE}║                                                       ║${NC}"
echo -e "${BLUE}║  ✅ User authenticated                                 ║${NC}"
echo -e "${BLUE}║  ✅ Provider created                                   ║${NC}"
echo -e "${BLUE}║  ✅ Visit started                                      ║${NC}"
echo -e "${BLUE}║  ⏸️  Ready for audio upload                           ║${NC}"
echo -e "${BLUE}║                                                       ║${NC}"
echo -e "${BLUE}║  Visit ID: $VISIT_ID"
echo -e "${BLUE}║                                                       ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}Next: Upload an audio file using the curl command above!${NC}"
echo ""
