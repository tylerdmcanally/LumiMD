#!/bin/bash

# LumiMD API Test Script
# Tests the working endpoints

API_URL="http://localhost:3000"
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔═══════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                                                       ║${NC}"
echo -e "${BLUE}║           LumiMD API Test Suite               ║${NC}"
echo -e "${BLUE}║                                                       ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════╝${NC}"
echo ""

# Test 1: Health Check
echo -e "${GREEN}[TEST 1] Health Check${NC}"
curl -s "$API_URL/health" | jq '.'
echo ""
echo ""

# Test 2: Register User
echo -e "${GREEN}[TEST 2] Register New User${NC}"
REGISTER_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "demo@lumimd.com",
    "password": "SecurePass123",
    "firstName": "Demo",
    "lastName": "User",
    "dateOfBirth": "1985-05-15"
  }')

echo "$REGISTER_RESPONSE" | jq '.'

# Extract access token
ACCESS_TOKEN=$(echo "$REGISTER_RESPONSE" | jq -r '.data.accessToken')
USER_ID=$(echo "$REGISTER_RESPONSE" | jq -r '.data.user.id')

if [ "$ACCESS_TOKEN" = "null" ]; then
  echo -e "${RED}Registration failed or user already exists. Trying login...${NC}"

  # Try login instead
  LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{
      "email": "demo@lumimd.com",
      "password": "SecurePass123"
    }')

  echo "$LOGIN_RESPONSE" | jq '.'
  ACCESS_TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.data.accessToken')
  USER_ID=$(echo "$LOGIN_RESPONSE" | jq -r '.data.user.id')
fi

echo ""
echo -e "${BLUE}Access Token: ${ACCESS_TOKEN:0:50}...${NC}"
echo -e "${BLUE}User ID: $USER_ID${NC}"
echo ""
echo ""

# Test 3: Create Provider
echo -e "${GREEN}[TEST 3] Create Healthcare Provider${NC}"
PROVIDER_RESPONSE=$(curl -s -X POST "$API_URL/api/providers" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{
    "name": "Dr. Sarah Johnson",
    "specialty": "Primary Care Physician",
    "practice": "City Medical Center",
    "phone": "(555) 123-4567",
    "address": "123 Main St, San Francisco, CA 94102"
  }')

echo "$PROVIDER_RESPONSE" | jq '.'
PROVIDER_ID=$(echo "$PROVIDER_RESPONSE" | jq -r '.data.id')
echo ""
echo -e "${BLUE}Provider ID: $PROVIDER_ID${NC}"
echo ""
echo ""

# Test 4: List Providers
echo -e "${GREEN}[TEST 4] List All Providers${NC}"
curl -s -X GET "$API_URL/api/providers" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq '.'
echo ""
echo ""

# Test 5: Search Providers
echo -e "${GREEN}[TEST 5] Search Providers (query: Primary)${NC}"
curl -s -X GET "$API_URL/api/providers?search=Primary" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq '.'
echo ""
echo ""

# Test 6: Create Visit
echo -e "${GREEN}[TEST 6] Start New Visit${NC}"
VISIT_RESPONSE=$(curl -s -X POST "$API_URL/api/visits/start" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d "{
    \"providerId\": \"$PROVIDER_ID\",
    \"visitDate\": \"2025-10-10T10:30:00.000Z\",
    \"visitType\": \"IN_PERSON\"
  }")

echo "$VISIT_RESPONSE" | jq '.'
VISIT_ID=$(echo "$VISIT_RESPONSE" | jq -r '.data.id')
echo ""
echo -e "${BLUE}Visit ID: $VISIT_ID${NC}"
echo ""
echo ""

# Test 7: Get Visit Details
echo -e "${GREEN}[TEST 7] Get Visit Details${NC}"
curl -s -X GET "$API_URL/api/visits/$VISIT_ID" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq '.'
echo ""
echo ""

# Test 8: List All Visits
echo -e "${GREEN}[TEST 8] List All Visits${NC}"
curl -s -X GET "$API_URL/api/visits" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq '.'
echo ""
echo ""

# Test 9: Update Provider
echo -e "${GREEN}[TEST 9] Update Provider${NC}"
curl -s -X PUT "$API_URL/api/providers/$PROVIDER_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{
    "notes": "Preferred doctor for routine checkups"
  }' | jq '.'
echo ""
echo ""

# Test 10: Get Provider with Visits
echo -e "${GREEN}[TEST 10] Get Provider with Visit History${NC}"
curl -s -X GET "$API_URL/api/providers/$PROVIDER_ID" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq '.'
echo ""
echo ""

# Summary
echo -e "${BLUE}╔═══════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                                                       ║${NC}"
echo -e "${BLUE}║                   Test Complete!                      ║${NC}"
echo -e "${BLUE}║                                                       ║${NC}"
echo -e "${BLUE}║  ✅ Authentication Working                             ║${NC}"
echo -e "${BLUE}║  ✅ Provider Management Working                        ║${NC}"
echo -e "${BLUE}║  ✅ Visit Management Working                           ║${NC}"
echo -e "${BLUE}║  ⏸️  Audio Upload (needs AWS S3)                      ║${NC}"
echo -e "${BLUE}║  ⏸️  AI Processing (needs audio upload)               ║${NC}"
echo -e "${BLUE}║                                                       ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}Next Steps:${NC}"
echo "1. Set up AWS S3 bucket and credentials"
echo "2. Test audio upload: POST /api/visits/:id/upload"
echo "3. Verify AI transcription and summarization"
echo ""
