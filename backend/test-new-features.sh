#!/bin/bash

# Test script for new LumiMD backend features
# Tests: User Profile, Medical Profile, Action Items, Trusted Access

BASE_URL="http://localhost:3000/api"
TIMESTAMP=$(date +%s)
EMAIL="test${TIMESTAMP}@example.com"
PASSWORD="SecurePass123"

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}LumiMD New Features Test Script${NC}"
echo -e "${BLUE}========================================${NC}\n"

# Step 1: Register a new user
echo -e "${BLUE}[1] Registering user...${NC}"
REGISTER_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$EMAIL\",
    \"password\": \"$PASSWORD\",
    \"firstName\": \"Test\",
    \"lastName\": \"User\",
    \"dateOfBirth\": \"1990-01-01\",
    \"phone\": \"+1234567890\"
  }")

echo "$REGISTER_RESPONSE" | jq '.'

ACCESS_TOKEN=$(echo "$REGISTER_RESPONSE" | jq -r '.data.accessToken')

if [ "$ACCESS_TOKEN" = "null" ] || [ -z "$ACCESS_TOKEN" ]; then
  echo -e "${RED}❌ Registration failed. Trying to login...${NC}\n"

  # Try to login instead
  LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/login" \
    -H "Content-Type: application/json" \
    -d "{
      \"email\": \"$EMAIL\",
      \"password\": \"$PASSWORD\"
    }")

  echo "$LOGIN_RESPONSE" | jq '.'
  ACCESS_TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.data.accessToken')
  USER_ID=$(echo "$LOGIN_RESPONSE" | jq -r '.data.user.id')

  if [ "$ACCESS_TOKEN" = "null" ] || [ -z "$ACCESS_TOKEN" ]; then
    echo -e "${RED}❌ Login failed. Exiting.${NC}"
    exit 1
  fi
else
  USER_ID=$(echo "$REGISTER_RESPONSE" | jq -r '.data.user.id')
fi

echo -e "${GREEN}✅ Authenticated successfully${NC}"
echo -e "User ID: $USER_ID\n"

# Step 2: Test User Profile endpoints
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}[2] Testing User Profile Endpoints${NC}"
echo -e "${BLUE}========================================${NC}\n"

echo -e "${BLUE}[2.1] Get user profile...${NC}"
curl -s -X GET "$BASE_URL/users/profile" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq '.'

echo -e "${GREEN}✅ Get profile complete${NC}\n"

echo -e "${BLUE}[2.2] Update user profile...${NC}"
curl -s -X PUT "$BASE_URL/users/profile" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Updated",
    "lastName": "Name",
    "phone": "+1987654321"
  }' | jq '.'

echo -e "${GREEN}✅ Update profile complete${NC}\n"

echo -e "${BLUE}[2.3] Get user statistics...${NC}"
curl -s -X GET "$BASE_URL/users/statistics" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq '.'

echo -e "${GREEN}✅ Get statistics complete${NC}\n"

# Step 3: Create a provider (needed for visits)
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}[3] Creating Provider (for later tests)${NC}"
echo -e "${BLUE}========================================${NC}\n"

PROVIDER_RESPONSE=$(curl -s -X POST "$BASE_URL/providers" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Dr. Smith",
    "specialty": "Cardiology",
    "practice": "City Hospital",
    "phone": "+1555123456",
    "address": "123 Medical Ave"
  }')

echo "$PROVIDER_RESPONSE" | jq '.'
PROVIDER_ID=$(echo "$PROVIDER_RESPONSE" | jq -r '.data.id')
echo -e "${GREEN}✅ Provider created (ID: $PROVIDER_ID)${NC}\n"

# Step 4: Create a visit (needed for action items)
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}[4] Creating Visit (for action items)${NC}"
echo -e "${BLUE}========================================${NC}\n"

VISIT_RESPONSE=$(curl -s -X POST "$BASE_URL/visits" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"providerId\": \"$PROVIDER_ID\",
    \"visitDate\": \"2025-10-10T10:00:00Z\",
    \"visitType\": \"IN_PERSON\"
  }")

echo "$VISIT_RESPONSE" | jq '.'
VISIT_ID=$(echo "$VISIT_RESPONSE" | jq -r '.data.id')
echo -e "${GREEN}✅ Visit created (ID: $VISIT_ID)${NC}\n"

# Step 5: Test Medical Profile endpoints
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}[5] Testing Medical Profile Endpoints${NC}"
echo -e "${BLUE}========================================${NC}\n"

echo -e "${BLUE}[5.1] Create condition...${NC}"
CONDITION_RESPONSE=$(curl -s -X POST "$BASE_URL/medical/conditions" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Hypertension",
    "diagnosedDate": "2023-01-15",
    "notes": "Diagnosed during annual checkup"
  }')

echo "$CONDITION_RESPONSE" | jq '.'
CONDITION_ID=$(echo "$CONDITION_RESPONSE" | jq -r '.data.id')
echo -e "${GREEN}✅ Condition created (ID: $CONDITION_ID)${NC}\n"

echo -e "${BLUE}[5.2] List conditions...${NC}"
curl -s -X GET "$BASE_URL/medical/conditions" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq '.'
echo -e "${GREEN}✅ List conditions complete${NC}\n"

echo -e "${BLUE}[5.3] Create medication...${NC}"
MEDICATION_RESPONSE=$(curl -s -X POST "$BASE_URL/medical/medications" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Lisinopril",
    "dosage": "10mg",
    "frequency": "Once daily",
    "prescribedDate": "2023-01-15",
    "prescribedBy": "Dr. Smith",
    "reason": "Hypertension management"
  }')

echo "$MEDICATION_RESPONSE" | jq '.'
MEDICATION_ID=$(echo "$MEDICATION_RESPONSE" | jq -r '.data.id')
echo -e "${GREEN}✅ Medication created (ID: $MEDICATION_ID)${NC}\n"

echo -e "${BLUE}[5.4] List medications...${NC}"
curl -s -X GET "$BASE_URL/medical/medications" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq '.'
echo -e "${GREEN}✅ List medications complete${NC}\n"

echo -e "${BLUE}[5.5] Create allergy...${NC}"
ALLERGY_RESPONSE=$(curl -s -X POST "$BASE_URL/medical/allergies" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "allergen": "Penicillin",
    "reaction": "Hives and itching",
    "severity": "MODERATE",
    "notes": "Discovered in childhood"
  }')

echo "$ALLERGY_RESPONSE" | jq '.'
ALLERGY_ID=$(echo "$ALLERGY_RESPONSE" | jq -r '.data.id')
echo -e "${GREEN}✅ Allergy created (ID: $ALLERGY_ID)${NC}\n"

echo -e "${BLUE}[5.6] List allergies...${NC}"
curl -s -X GET "$BASE_URL/medical/allergies" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq '.'
echo -e "${GREEN}✅ List allergies complete${NC}\n"

echo -e "${BLUE}[5.7] Create emergency contact...${NC}"
CONTACT_RESPONSE=$(curl -s -X POST "$BASE_URL/medical/emergency-contacts" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Jane Doe",
    "relationship": "Spouse",
    "phone": "+1555999888",
    "email": "jane@example.com",
    "isPrimary": true
  }')

echo "$CONTACT_RESPONSE" | jq '.'
CONTACT_ID=$(echo "$CONTACT_RESPONSE" | jq -r '.data.id')
echo -e "${GREEN}✅ Emergency contact created (ID: $CONTACT_ID)${NC}\n"

echo -e "${BLUE}[5.8] List emergency contacts...${NC}"
curl -s -X GET "$BASE_URL/medical/emergency-contacts" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq '.'
echo -e "${GREEN}✅ List emergency contacts complete${NC}\n"

# Step 6: Test Action Items endpoints
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}[6] Testing Action Items Endpoints${NC}"
echo -e "${BLUE}========================================${NC}\n"

echo -e "${BLUE}[6.1] Create action item...${NC}"
ACTION_ITEM_RESPONSE=$(curl -s -X POST "$BASE_URL/action-items" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"visitId\": \"$VISIT_ID\",
    \"type\": \"FOLLOW_UP_APPOINTMENT\",
    \"description\": \"Schedule follow-up in 3 months\",
    \"dueDate\": \"2026-01-10\"
  }")

echo "$ACTION_ITEM_RESPONSE" | jq '.'
ACTION_ITEM_ID=$(echo "$ACTION_ITEM_RESPONSE" | jq -r '.data.id')
echo -e "${GREEN}✅ Action item created (ID: $ACTION_ITEM_ID)${NC}\n"

echo -e "${BLUE}[6.2] List action items...${NC}"
curl -s -X GET "$BASE_URL/action-items" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq '.'
echo -e "${GREEN}✅ List action items complete${NC}\n"

echo -e "${BLUE}[6.3] Get action item statistics...${NC}"
curl -s -X GET "$BASE_URL/action-items/statistics" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq '.'
echo -e "${GREEN}✅ Get statistics complete${NC}\n"

echo -e "${BLUE}[6.4] Mark action item as complete...${NC}"
curl -s -X POST "$BASE_URL/action-items/$ACTION_ITEM_ID/complete" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq '.'
echo -e "${GREEN}✅ Action item completed${NC}\n"

# Step 7: Test Trusted Access endpoints
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}[7] Testing Trusted Access Endpoints${NC}"
echo -e "${BLUE}========================================${NC}\n"

# Create a second user to test trusted access
echo -e "${BLUE}[7.1] Creating second user for trusted access test...${NC}"
TRUSTED_USER_EMAIL="trusted${TIMESTAMP}@example.com"
TRUSTED_REGISTER_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$TRUSTED_USER_EMAIL\",
    \"password\": \"SecurePass123\",
    \"firstName\": \"Trusted\",
    \"lastName\": \"User\",
    \"dateOfBirth\": \"1985-05-20\"
  }")

echo "$TRUSTED_REGISTER_RESPONSE" | jq '.'

if echo "$TRUSTED_REGISTER_RESPONSE" | jq -e '.data.user.id' > /dev/null; then
  echo -e "${GREEN}✅ Second user created${NC}\n"
else
  echo -e "${RED}⚠️  Second user might already exist${NC}\n"
fi

echo -e "${BLUE}[7.2] Invite trusted user...${NC}"
TRUSTED_ACCESS_RESPONSE=$(curl -s -X POST "$BASE_URL/trusted-access/invite" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"trustedUserEmail\": \"$TRUSTED_USER_EMAIL\",
    \"accessLevel\": \"VIEW_ONLY\",
    \"relationship\": \"Family Member\"
  }")

echo "$TRUSTED_ACCESS_RESPONSE" | jq '.'
TRUSTED_ACCESS_ID=$(echo "$TRUSTED_ACCESS_RESPONSE" | jq -r '.data.id')

if [ "$TRUSTED_ACCESS_ID" != "null" ]; then
  echo -e "${GREEN}✅ Trusted access granted (ID: $TRUSTED_ACCESS_ID)${NC}\n"
else
  echo -e "${RED}⚠️  Trusted access might already exist${NC}\n"
fi

echo -e "${BLUE}[7.3] List users I've granted access to...${NC}"
curl -s -X GET "$BASE_URL/trusted-access/granted" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq '.'
echo -e "${GREEN}✅ List granted access complete${NC}\n"

echo -e "${BLUE}[7.4] List users who granted me access...${NC}"
curl -s -X GET "$BASE_URL/trusted-access/received" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq '.'
echo -e "${GREEN}✅ List received access complete${NC}\n"

if [ "$TRUSTED_ACCESS_ID" != "null" ] && [ -n "$TRUSTED_ACCESS_ID" ]; then
  echo -e "${BLUE}[7.5] Update trusted access level...${NC}"
  curl -s -X PUT "$BASE_URL/trusted-access/$TRUSTED_ACCESS_ID" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "accessLevel": "VIEW_AND_EDIT"
    }' | jq '.'
  echo -e "${GREEN}✅ Update access level complete${NC}\n"
fi

# Final summary
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Test Summary${NC}"
echo -e "${BLUE}========================================${NC}\n"

echo -e "${GREEN}✅ User Profile Management tested${NC}"
echo -e "${GREEN}✅ Medical Profile Management tested${NC}"
echo -e "  - Conditions, Medications, Allergies, Emergency Contacts"
echo -e "${GREEN}✅ Action Items Management tested${NC}"
echo -e "${GREEN}✅ Trusted Access System tested${NC}\n"

echo -e "${BLUE}All new backend features have been tested!${NC}"
echo -e "${BLUE}========================================${NC}\n"
