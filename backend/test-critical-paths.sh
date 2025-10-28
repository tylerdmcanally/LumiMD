#!/bin/bash

# Critical Path Testing for LumiMD Backend
# Tests the most important workflows before mobile development

BASE_URL="http://localhost:3000/api"
TIMESTAMP=$(date +%s)
EMAIL="critical${TIMESTAMP}@example.com"
PASSWORD="SecurePass123"

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

TESTS_PASSED=0
TESTS_FAILED=0

echo -e "${BLUE}╔════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   LumiMD Critical Path Testing         ║${NC}"
echo -e "${BLUE}║   Testing core workflows before mobile dev    ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════╝${NC}\n"

# Helper functions
pass_test() {
  echo -e "${GREEN}✓ PASS${NC} $1"
  TESTS_PASSED=$((TESTS_PASSED + 1))
}

fail_test() {
  echo -e "${RED}✗ FAIL${NC} $1"
  TESTS_FAILED=$((TESTS_FAILED + 1))
}

# Test 1: Server Health
echo -e "\n${YELLOW}[1/7] Server Health Check${NC}"
HEALTH=$(curl -s http://localhost:3000/health)
if echo "$HEALTH" | grep -q "success.*true"; then
  pass_test "Server is running"
else
  fail_test "Server health check failed"
  exit 1
fi

# Test 2: Authentication Flow
echo -e "\n${YELLOW}[2/7] Authentication Flow${NC}"

# Register
REGISTER=$(curl -s -X POST "$BASE_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$EMAIL\",
    \"password\": \"$PASSWORD\",
    \"firstName\": \"Test\",
    \"lastName\": \"User\",
    \"dateOfBirth\": \"1990-01-01\"
  }")

if echo "$REGISTER" | grep -q '"success":true'; then
  pass_test "User registration"
  TOKEN=$(echo "$REGISTER" | jq -r '.data.accessToken')
  USER_ID=$(echo "$REGISTER" | jq -r '.data.user.id')
else
  fail_test "User registration"
fi

# Login with same credentials
LOGIN=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$EMAIL\",
    \"password\": \"$PASSWORD\"
  }")

if echo "$LOGIN" | grep -q '"success":true'; then
  pass_test "User login"
else
  fail_test "User login"
fi

# Test protected route
PROFILE=$(curl -s -X GET "$BASE_URL/users/profile" \
  -H "Authorization: Bearer $TOKEN")

if echo "$PROFILE" | grep -q '"success":true'; then
  pass_test "Protected route authentication"
else
  fail_test "Protected route authentication"
fi

# Test 3: Medical Profile Management
echo -e "\n${YELLOW}[3/7] Medical Profile Management${NC}"

# Create condition
CONDITION=$(curl -s -X POST "$BASE_URL/medical/conditions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Diabetes Type 2",
    "diagnosedDate": "2024-01-01"
  }')

if echo "$CONDITION" | grep -q '"success":true'; then
  pass_test "Create medical condition"
  CONDITION_ID=$(echo "$CONDITION" | jq -r '.data.id')
else
  fail_test "Create medical condition"
fi

# Create medication
MEDICATION=$(curl -s -X POST "$BASE_URL/medical/medications" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Metformin",
    "dosage": "500mg",
    "frequency": "Twice daily",
    "prescribedDate": "2024-01-01"
  }')

if echo "$MEDICATION" | grep -q '"success":true'; then
  pass_test "Create medication"
else
  fail_test "Create medication"
fi

# Create allergy
ALLERGY=$(curl -s -X POST "$BASE_URL/medical/allergies" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "allergen": "Sulfa drugs",
    "severity": "SEVERE"
  }')

if echo "$ALLERGY" | grep -q '"success":true'; then
  pass_test "Create allergy"
else
  fail_test "Create allergy"
fi

# Test 4: Provider & Visit Workflow
echo -e "\n${YELLOW}[4/7] Provider & Visit Workflow${NC}"

# Create provider
PROVIDER=$(curl -s -X POST "$BASE_URL/providers" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Dr. Johnson",
    "specialty": "Endocrinology",
    "practice": "Metro Health"
  }')

if echo "$PROVIDER" | grep -q '"success":true'; then
  pass_test "Create provider"
  PROVIDER_ID=$(echo "$PROVIDER" | jq -r '.data.id')
else
  fail_test "Create provider"
fi

# Start visit
VISIT=$(curl -s -X POST "$BASE_URL/visits/start" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"providerId\": \"$PROVIDER_ID\",
    \"visitDate\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\",
    \"visitType\": \"IN_PERSON\"
  }")

if echo "$VISIT" | grep -q '"success":true'; then
  pass_test "Start visit"
  VISIT_ID=$(echo "$VISIT" | jq -r '.data.id')
else
  fail_test "Start visit"
fi

# List visits
VISITS=$(curl -s -X GET "$BASE_URL/visits" \
  -H "Authorization: Bearer $TOKEN")

if echo "$VISITS" | grep -q "$VISIT_ID"; then
  pass_test "List visits"
else
  fail_test "List visits"
fi

# Test 5: Action Items
echo -e "\n${YELLOW}[5/7] Action Items Management${NC}"

# Create action item
ACTION_ITEM=$(curl -s -X POST "$BASE_URL/action-items" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"visitId\": \"$VISIT_ID\",
    \"type\": \"LAB_WORK\",
    \"description\": \"Fasting glucose test\",
    \"dueDate\": \"2026-01-15\"
  }")

if echo "$ACTION_ITEM" | grep -q '"success":true'; then
  pass_test "Create action item"
  ACTION_ITEM_ID=$(echo "$ACTION_ITEM" | jq -r '.data.id')
else
  fail_test "Create action item"
fi

# Get statistics
STATS=$(curl -s -X GET "$BASE_URL/action-items/statistics" \
  -H "Authorization: Bearer $TOKEN")

if echo "$STATS" | grep -q '"pending":1'; then
  pass_test "Action item statistics"
else
  fail_test "Action item statistics"
fi

# Mark complete
COMPLETE=$(curl -s -X POST "$BASE_URL/action-items/$ACTION_ITEM_ID/complete" \
  -H "Authorization: Bearer $TOKEN")

if echo "$COMPLETE" | grep -q '"completed":true'; then
  pass_test "Complete action item"
else
  fail_test "Complete action item"
fi

# Test 6: Trusted Access Sharing
echo -e "\n${YELLOW}[6/7] Trusted Access Sharing${NC}"

# Create second user
TRUSTED_EMAIL="trusted${TIMESTAMP}@example.com"
TRUSTED_USER=$(curl -s -X POST "$BASE_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$TRUSTED_EMAIL\",
    \"password\": \"$PASSWORD\",
    \"firstName\": \"Trusted\",
    \"lastName\": \"User\",
    \"dateOfBirth\": \"1985-05-20\"
  }")

if echo "$TRUSTED_USER" | grep -q '"success":true'; then
  pass_test "Create second user for sharing"
  TRUSTED_USER_ID=$(echo "$TRUSTED_USER" | jq -r '.data.user.id')
else
  fail_test "Create second user for sharing"
fi

# Grant access
ACCESS=$(curl -s -X POST "$BASE_URL/trusted-access/invite" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"trustedUserEmail\": \"$TRUSTED_EMAIL\",
    \"accessLevel\": \"VIEW_ONLY\",
    \"relationship\": \"Family\"
  }")

if echo "$ACCESS" | grep -q '"success":true'; then
  pass_test "Grant trusted access"
  ACCESS_ID=$(echo "$ACCESS" | jq -r '.data.id')
else
  fail_test "Grant trusted access"
fi

# Update access level
UPDATE_ACCESS=$(curl -s -X PUT "$BASE_URL/trusted-access/$ACCESS_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "accessLevel": "VIEW_AND_EDIT"
  }')

if echo "$UPDATE_ACCESS" | grep -q '"accessLevel":"VIEW_AND_EDIT"'; then
  pass_test "Update access level"
else
  fail_test "Update access level"
fi

# Test 7: Data Integrity & Security
echo -e "\n${YELLOW}[7/7] Data Integrity & Security${NC}"

# Test invalid token
INVALID=$(curl -s -X GET "$BASE_URL/users/profile" \
  -H "Authorization: Bearer invalid_token")

if echo "$INVALID" | grep -q '"success":false'; then
  pass_test "Reject invalid token"
else
  fail_test "Reject invalid token"
fi

# Test missing auth
NO_AUTH=$(curl -s -X GET "$BASE_URL/users/profile")

if echo "$NO_AUTH" | grep -q '"success":false'; then
  pass_test "Require authentication"
else
  fail_test "Require authentication"
fi

# Test validation
BAD_DATA=$(curl -s -X POST "$BASE_URL/medical/conditions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": ""
  }')

if echo "$BAD_DATA" | grep -q '"success":false'; then
  pass_test "Input validation"
else
  fail_test "Input validation"
fi

# User isolation test - try to access other user's data
OTHER_TOKEN=$(echo "$TRUSTED_USER" | jq -r '.data.accessToken')
ISOLATION=$(curl -s -X GET "$BASE_URL/medical/conditions" \
  -H "Authorization: Bearer $OTHER_TOKEN")

# Should return empty array, not the first user's conditions
if echo "$ISOLATION" | grep -q '"data":\[\]'; then
  pass_test "User data isolation"
else
  fail_test "User data isolation"
fi

# Final Report
echo -e "\n${BLUE}╔════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║               Test Results                     ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════╝${NC}\n"

echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
echo -e "${RED}Failed: $TESTS_FAILED${NC}"
echo -e "Total:  $((TESTS_PASSED + TESTS_FAILED))\n"

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}╔════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║  ✓ All Critical Tests Passed!                 ║${NC}"
  echo -e "${GREEN}║  Backend is ready for mobile development      ║${NC}"
  echo -e "${GREEN}╚════════════════════════════════════════════════╝${NC}\n"
  exit 0
else
  echo -e "${RED}╔════════════════════════════════════════════════╗${NC}"
  echo -e "${RED}║  ✗ Some tests failed                          ║${NC}"
  echo -e "${RED}║  Please review errors before proceeding       ║${NC}"
  echo -e "${RED}╚════════════════════════════════════════════════╝${NC}\n"
  exit 1
fi
