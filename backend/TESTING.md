# LumiMD Backend Testing Guide

## Testing Approaches

### 0. Unit Test Suite ✅

Run the Jest-powered unit suite (no external services required):

```bash
npm test
```

Current coverage focuses on security-sensitive helpers (encryption utilities, JWT helpers) plus service-level auth and provider flows (register/login/refresh, provider CRUD/delete guardrails).

#### Continuous Integration

Every push and pull request triggers `npm test -- --runInBand` via `.github/workflows/backend-tests.yml`, so keep the suite green before opening PRs.

### 1. Automated Test Scripts ✅

We have comprehensive test scripts that validate all functionality:

#### Test All New Features
```bash
./test-new-features.sh
```
Tests: User Profile, Medical Profile, Action Items, Trusted Access

#### Test Complete Workflow
```bash
./test-full-workflow.sh
```
Tests: Auth → Provider → Visit → Audio Upload → AI Processing

#### Test S3 Integration
```bash
node test-s3.js
```
Tests: File upload, download, signed URLs, deletion

### 2. Manual API Testing with curl

#### Authentication Flow
```bash
# Register
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePass123",
    "firstName": "Test",
    "lastName": "User",
    "dateOfBirth": "1990-01-01"
  }'

# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePass123"
  }'

# Save the access token for subsequent requests
export TOKEN="your_access_token_here"
```

#### User Profile
```bash
# Get profile
curl -X GET http://localhost:3000/api/users/profile \
  -H "Authorization: Bearer $TOKEN"

# Update profile
curl -X PUT http://localhost:3000/api/users/profile \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Updated",
    "lastName": "Name"
  }'

# Get statistics
curl -X GET http://localhost:3000/api/users/statistics \
  -H "Authorization: Bearer $TOKEN"
```

#### Providers
```bash
# Create provider
curl -X POST http://localhost:3000/api/providers \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Dr. Smith",
    "specialty": "Cardiology",
    "practice": "City Hospital"
  }'

# List providers
curl -X GET http://localhost:3000/api/providers \
  -H "Authorization: Bearer $TOKEN"
```

#### Visits & Audio Upload
```bash
# Start visit
curl -X POST http://localhost:3000/api/visits/start \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "providerId": "provider-id-here",
    "visitDate": "2025-10-10T10:00:00Z",
    "visitType": "IN_PERSON"
  }'

# Upload audio (requires actual audio file)
curl -X POST http://localhost:3000/api/visits/visit-id/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "audio=@/path/to/audio.m4a"

# Get visit summary
curl -X GET http://localhost:3000/api/visits/visit-id/summary \
  -H "Authorization: Bearer $TOKEN"
```

#### Medical Profile
```bash
# Add condition
curl -X POST http://localhost:3000/api/medical/conditions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Hypertension",
    "diagnosedDate": "2023-01-15"
  }'

# Add medication
curl -X POST http://localhost:3000/api/medical/medications \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Lisinopril",
    "dosage": "10mg",
    "frequency": "Once daily",
    "prescribedDate": "2023-01-15"
  }'

# Add allergy
curl -X POST http://localhost:3000/api/medical/allergies \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "allergen": "Penicillin",
    "severity": "MODERATE"
  }'

# Add emergency contact
curl -X POST http://localhost:3000/api/medical/emergency-contacts \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Jane Doe",
    "relationship": "Spouse",
    "phone": "+1555999888",
    "isPrimary": true
  }'
```

#### Action Items
```bash
# Create action item
curl -X POST http://localhost:3000/api/action-items \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "visitId": "visit-id-here",
    "type": "FOLLOW_UP_APPOINTMENT",
    "description": "Schedule follow-up in 3 months",
    "dueDate": "2026-01-10"
  }'

# List action items
curl -X GET "http://localhost:3000/api/action-items?completed=false" \
  -H "Authorization: Bearer $TOKEN"

# Get statistics
curl -X GET http://localhost:3000/api/action-items/statistics \
  -H "Authorization: Bearer $TOKEN"

# Mark complete
curl -X POST http://localhost:3000/api/action-items/item-id/complete \
  -H "Authorization: Bearer $TOKEN"
```

#### Trusted Access
```bash
# Invite trusted user
curl -X POST http://localhost:3000/api/trusted-access/invite \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "trustedUserEmail": "family@example.com",
    "accessLevel": "VIEW_ONLY",
    "relationship": "Family Member"
  }'

# List granted access
curl -X GET http://localhost:3000/api/trusted-access/granted \
  -H "Authorization: Bearer $TOKEN"

# List received access
curl -X GET http://localhost:3000/api/trusted-access/received \
  -H "Authorization: Bearer $TOKEN"

# Get shared visits
curl -X GET http://localhost:3000/api/trusted-access/shared-visits \
  -H "Authorization: Bearer $TOKEN"

# Update access level
curl -X PUT http://localhost:3000/api/trusted-access/access-id \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "accessLevel": "VIEW_AND_EDIT"
  }'

# Revoke access
curl -X DELETE http://localhost:3000/api/trusted-access/access-id \
  -H "Authorization: Bearer $TOKEN"
```

### 3. Using Postman or Insomnia

Import the API into Postman/Insomnia for visual testing:

1. Create a new collection called "LumiMD"
2. Set up environment variables:
   - `base_url`: http://localhost:3000/api
   - `access_token`: (save from login response)
3. Add requests organized by feature
4. Use collection variables for IDs

### 4. Testing Checklist

Before moving to mobile development, verify:

#### ✅ Authentication
- [ ] User registration works
- [ ] Login returns valid tokens
- [ ] Token refresh works
- [ ] Logout invalidates tokens
- [ ] Protected routes require authentication

#### ✅ User Profile
- [ ] Get profile returns user data
- [ ] Update profile modifies user info
- [ ] Statistics are accurate
- [ ] Profile photo upload to S3 works

#### ✅ Providers
- [ ] Create provider succeeds
- [ ] List providers returns user's providers
- [ ] Search providers works
- [ ] Update/delete provider works

#### ✅ Visits
- [ ] Start visit creates record
- [ ] Audio upload to S3 succeeds
- [ ] AI transcription works (Whisper)
- [ ] AI summarization works (GPT-4)
- [ ] Entity extraction works
- [ ] Visit status updates properly
- [ ] Get summary returns AI results

#### ✅ Medical Profile
- [ ] Conditions CRUD works
- [ ] Medications CRUD works
- [ ] Allergies CRUD works
- [ ] Emergency contacts CRUD works
- [ ] Primary contact logic works

#### ✅ Action Items
- [ ] Create action item works
- [ ] List with filters works
- [ ] Statistics are accurate
- [ ] Mark complete works
- [ ] Update/delete works

#### ✅ Trusted Access
- [ ] Invite by email works
- [ ] List granted/received works
- [ ] Access level updates work
- [ ] Revoke access works
- [ ] Shared visits visible
- [ ] Cannot grant self-access
- [ ] Duplicate prevention works

#### ✅ Security
- [ ] Rate limiting triggers
- [ ] CORS configured properly
- [ ] Audit logging works
- [ ] Error messages don't leak sensitive info
- [ ] Input validation catches bad data

#### ✅ Data Integrity
- [ ] PHI data encrypted at rest
- [ ] Files stored securely in S3
- [ ] Cascade deletes work
- [ ] Timestamps accurate
- [ ] UUIDs generated properly

### 5. Load Testing (Optional)

For production readiness, test with load:

```bash
# Install Apache Bench
brew install apache-bench

# Test login endpoint
ab -n 100 -c 10 -p login.json -T application/json \
  http://localhost:3000/api/auth/login

# Test authenticated endpoint
ab -n 100 -c 10 -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/users/profile
```

### 6. Error Testing

Test error handling:

```bash
# Invalid credentials
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "wrong@example.com", "password": "wrong"}'

# Missing required fields
curl -X POST http://localhost:3000/api/providers \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": ""}'

# Invalid token
curl -X GET http://localhost:3000/api/users/profile \
  -H "Authorization: Bearer invalid_token"

# Resource not found
curl -X GET http://localhost:3000/api/visits/nonexistent-id \
  -H "Authorization: Bearer $TOKEN"
```

## Test Data

The test scripts automatically create test data:
- Test users with unique emails (timestamp-based)
- Sample providers
- Sample medical records
- Sample action items
- Trusted access relationships

## Database Inspection

Check database directly:

```bash
# Connect to PostgreSQL
psql -U tylermcanally -d lumimd

# View tables
\dt

# Check user count
SELECT COUNT(*) FROM "User";

# Check recent visits
SELECT * FROM "Visit" ORDER BY "createdAt" DESC LIMIT 5;

# Check audit logs
SELECT * FROM "AuditLog" ORDER BY "timestamp" DESC LIMIT 10;
```

## Logs

Check application logs:

```bash
# Server logs are output to console
# In production, check:
tail -f logs/app.log
tail -f logs/error.log
```

## Next Steps

Once all tests pass:
1. ✅ Backend API fully functional
2. ✅ All features tested
3. ✅ Security verified
4. ✅ Ready for mobile development

**You're ready to build the iOS app!** 🚀
