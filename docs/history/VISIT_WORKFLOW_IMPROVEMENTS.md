# Visit Workflow Improvements - Implementation Summary

## Overview
This document outlines the improvements made to the LumiMD visit recording and management workflow to make it more frictionless and organized.

## ✅ Completed Features

### 1. Visit Detail Screen with Provider Management
**File:** `components/visits/VisitDetail.tsx`

#### Features:
- **Full Visit Details**: Displays visit date, type, duration, status
- **AI Summary Display**: Shows AI-generated overview, action items, medications, and diagnoses
- **Full Transcript**: Shows complete transcription when available
- **Provider Management**:
  - View current provider
  - Change provider (opens bottom sheet picker)
  - Remove provider from visit
  - Add provider to unassigned visits
- **Delete Functionality**: Delete visit with confirmation dialog
- **Processing Status**: Shows real-time processing indicator for visits being transcribed

#### API Methods Used:
- `getVisitById(visitId)` - Get full visit details
- `getVisitSummary(visitId)` - Get AI summary
- `getVisitTranscript(visitId)` - Get transcription
- `updateVisit(visitId, { providerId })` - Change/remove provider
- `deleteVisit(visitId)` - Delete visit
- `listProviders()` - Get providers for picker

### 2. Visit Deletion API
**File:** `services/api/visits.ts`

Added missing delete methods:
```typescript
export const deleteVisit = async (visitId: string): Promise<void>
export const getVisitById = async (visitId: string): Promise<Visit>
```

### 3. Folder and Tag Organization System

#### Backend Implementation

**Database Schema** (`backend/prisma/schema.prisma`):
- Added `VisitFolder` model with:
  - `name`, `color`, `icon` fields
  - Unique constraint on `userId + name`
  - One-to-many relationship with visits
- Added `VisitTag` model with:
  - `tag` field
  - Unique constraint on `visitId + tag`
  - Many-to-one relationship with visits
- Updated `Visit` model:
  - Made `providerId` optional (visits can be unassigned)
  - Added `folderId` (nullable)
  - Added `tags` relation

**Migration Applied**: `20251015140144_add_folders_and_tags`

**Services** (`backend/src/services/visitFolderService.ts`):
- `createFolder(userId, input)` - Create new folder
- `listFolders(userId)` - List all folders with visit counts
- `getFolderById(folderId, userId)` - Get folder with all visits
- `updateFolder(folderId, userId, input)` - Update folder name/color/icon
- `deleteFolder(folderId, userId)` - Delete folder (visits become unassigned)
- `moveVisitToFolder(visitId, folderId, userId)` - Move visit to/from folder
- `addTagsToVisit(visitId, userId, tags[])` - Add multiple tags
- `removeTagFromVisit(visitId, userId, tag)` - Remove single tag
- `getUserTags(userId)` - Get all unique tags user has used

**Controller** (`backend/src/controllers/visitFolderController.ts`):
- Full CRUD operations for folders
- Tag management endpoints
- Input validation with Zod schemas

**Routes**:
- `backend/src/routes/folder.ts`:
  - `POST /api/folders` - Create folder
  - `GET /api/folders` - List folders
  - `GET /api/folders/:id` - Get folder details
  - `PUT /api/folders/:id` - Update folder
  - `DELETE /api/folders/:id` - Delete folder

- `backend/src/routes/visit.ts` (additions):
  - `PUT /api/visits/:id/folder` - Move visit to folder
  - `POST /api/visits/:id/tags` - Add tags
  - `DELETE /api/visits/:id/tags/:tag` - Remove tag

- `backend/src/app.ts`:
  - `GET /api/tags` - Get all user tags

#### Frontend API Client
**File:** `services/api/folders.ts`

Complete API methods for folder management:
```typescript
createFolder(input)
listFolders()
getFolderById(folderId)
updateFolder(folderId, input)
deleteFolder(folderId)
moveVisitToFolder(visitId, folderId)
addTagsToVisit(visitId, tags[])
removeTagFromVisit(visitId, tag)
getUserTags()
```

## 🔄 Current Workflow Analysis

### Existing Visit Recording Flow (Already Good!)
The current flow is already well-designed:

1. **VisitStarter** (`components/visits/VisitStarter.tsx`):
   - Shows list of providers
   - User selects provider before recording
   - Creates visit immediately with provider

2. **VisitRecorder** (`components/visits/VisitRecorder.tsx`):
   - Handles consent flow (location-based, HIPAA-compliant)
   - Records audio with pause/resume
   - Uploads to backend
   - **Provider tagging AFTER upload** (already implemented!)
   - Can assign provider post-recording if not assigned earlier

3. **VisitList** (`components/visits/VisitList.tsx`):
   - Shows all visits with status badges
   - Displays AI summary preview
   - Shows action item count
   - Click to view details

### What's Missing (To Build Next)

1. **Folder Management UI**:
   - Create folder component
   - Folder picker/selector
   - Folder display in visit list
   - Drag-and-drop or bulk move

2. **Tag Management UI**:
   - Tag input component
   - Tag display on visit cards
   - Tag filtering
   - Tag suggestions

3. **Visit Organization Views**:
   - Filter visits by folder
   - Filter visits by tag
   - Filter by provider
   - Sort by date/status

## 📋 Recommended Next Steps

### Phase 1: Basic Folder Management (Next)
1. Create `components/folders/FolderManager.tsx`:
   - List all folders
   - Create new folder with name/color picker
   - Edit folder
   - Delete folder (with warning if has visits)

2. Create `components/folders/FolderPicker.tsx`:
   - Reusable picker component
   - Shows folders with visit counts
   - "No Folder" option

3. Update `components/visits/VisitList.tsx`:
   - Add folder filter dropdown
   - Show folder badge on visit cards
   - Quick move to folder action

4. Update `components/visits/VisitDetail.tsx`:
   - Add folder section
   - Show current folder
   - Button to change folder
   - Use FolderPicker component

### Phase 2: Tag Management
1. Create `components/tags/TagInput.tsx`:
   - Chip-style tag display
   - Add new tags with autocomplete
   - Remove tags

2. Update `components/visits/VisitDetail.tsx`:
   - Add tag section
   - Use TagInput component
   - Show all tags

3. Update `components/visits/VisitList.tsx`:
   - Show tags on visit cards
   - Click tag to filter

### Phase 3: Advanced Organization
1. Create `components/visits/VisitOrganizer.tsx`:
   - Unified view with filters
   - Folder tree on left
   - Tag cloud/filter
   - Provider filter
   - Date range filter

2. Bulk operations:
   - Select multiple visits
   - Bulk move to folder
   - Bulk tag

## 🎯 User Flow: Start to Finish

### Current Flow (Optimized)
```
1. User clicks "Start Visit"
   ↓
2. VisitStarter shows provider list
   - User can select provider OR skip
   ↓
3. VisitRecorder opens
   - Shows consent toggles (auto-detected by location)
   - User confirms consent
   - Clicks "Start Recording"
   ↓
4. Recording in progress
   - Shows timer
   - Can pause/resume
   - Clicks "Stop Recording"
   ↓
5. Recording stopped
   - Clicks "Upload Recording"
   ↓
6. Upload complete
   - Provider tagging UI appears if no provider
   - User can select provider or skip
   ↓
7. Visit submitted
   - Status: PROCESSING
   - User can continue or view details
   ↓
8. AI Processing (background, 2-5 minutes)
   - Whisper transcribes audio
   - GPT-4 generates summary
   - Extracts action items, medications, diagnoses
   ↓
9. Visit ready
   - Status: COMPLETED
   - User views AI summary
   - Can edit provider, add to folder, add tags
```

### Friction Points Identified
1. ✅ **Provider assignment** - Already handled (can assign before or after)
2. ✅ **Consent flow** - Already optimized (location-based, minimal)
3. ⚠️ **Organization** - NEW: Now have folders/tags, need UI
4. ⚠️ **Finding old visits** - Need filters/search

## 🎨 UI Design Recommendations

### Folder Colors
Suggested preset colors:
```typescript
const FOLDER_COLORS = [
  { name: 'Blue', value: '#0066CC' },
  { name: 'Green', value: '#00AA44' },
  { name: 'Orange', value: '#FF8800' },
  { name: 'Purple', value: '#7B61FF' },
  { name: 'Pink', value: '#FF6B9D' },
  { name: 'Teal', value: '#00BFA5' },
  { name: 'Red', value: '#DD0000' },
];
```

### Folder Icons
Suggested icons (using Expo vector-icons):
- `folder-medical`
- `heart`
- `pills`
- `stethoscope`
- `hospital-building`
- `calendar`
- `star`
- `bookmark`

### Example Folder Structure
Users might create folders like:
- 🩺 "Cardiology"
- 💊 "Medication Adjustments"
- 🏥 "Emergency Visits"
- 📅 "Annual Checkups"
- ⭐ "Important"

## 📊 API Endpoints Summary

### New Endpoints (Folders)
```
POST   /api/folders              Create folder
GET    /api/folders              List folders
GET    /api/folders/:id          Get folder
PUT    /api/folders/:id          Update folder
DELETE /api/folders/:id          Delete folder
```

### New Endpoints (Tags)
```
GET    /api/tags                      Get all user tags
POST   /api/visits/:id/tags           Add tags to visit
DELETE /api/visits/:id/tags/:tag     Remove tag from visit
```

### Updated Endpoints (Visits)
```
PUT    /api/visits/:id/folder         Move visit to folder
GET    /api/visits/:id                Now includes folder and tags
DELETE /api/visits/:id                Delete visit (now exposed in frontend)
```

### Existing Endpoints (Still Available)
```
POST   /api/visits                Start + upload (unified)
POST   /api/visits/start          Start without upload
POST   /api/visits/:id/upload     Upload audio to existing visit
GET    /api/visits                List visits (supports pagination)
GET    /api/visits/:id            Get visit details
GET    /api/visits/:id/summary    Get AI summary
GET    /api/visits/:id/transcript Get transcript
PUT    /api/visits/:id            Update visit (provider, date, type)
POST   /api/visits/:id/share      Share with trusted user
```

## 🧪 Testing Checklist

### Backend Tests Needed
- [ ] Create folder
- [ ] List folders
- [ ] Update folder
- [ ] Delete folder (verify visits unassigned)
- [ ] Move visit to folder
- [ ] Add tags to visit
- [ ] Remove tag from visit
- [ ] Get user tags
- [ ] Folder name uniqueness constraint

### Frontend Tests Needed
- [ ] View visit details
- [ ] Change provider on visit
- [ ] Delete visit with confirmation
- [ ] Create folder UI
- [ ] Move visit to folder
- [ ] Add tags to visit
- [ ] Filter by folder
- [ ] Filter by tag

## 🎓 Key Implementation Notes

1. **Provider is now optional on Visit**:
   - Backend schema changed `providerId` from required to optional
   - Visits can be recorded without provider initially
   - Provider can be added/changed/removed later

2. **Folder deletion is non-destructive**:
   - When folder is deleted, visits are NOT deleted
   - `folderId` on visits is set to `null` via `onDelete: SetNull`

3. **Tags are flexible**:
   - No predefined tag list
   - Users create tags on-the-fly
   - Case-sensitive (consider normalizing later)
   - Unique per visit (can't add same tag twice)

4. **Performance considerations**:
   - Folder list includes visit counts via `_count`
   - Tags are loaded with visit details, not on list view
   - Consider pagination for folder contents

## 🚀 Deployment Notes

1. **Database Migration**:
   ```bash
   cd backend
   npx prisma migrate deploy
   ```

2. **Backend Restart Required**:
   - New routes and controllers added
   - Prisma client regenerated

3. **Frontend Changes**:
   - New API client methods available
   - New components need to be built
   - Existing components work as-is

## 📝 Code Quality Notes

- ✅ All backend code follows existing patterns
- ✅ Zod validation on all inputs
- ✅ Authentication required on all endpoints
- ✅ Error handling with custom error classes
- ✅ TypeScript types throughout
- ✅ Audit logging ready (can be added)
- ✅ HIPAA compliant (folder/tag data tied to user)

## 🎯 Summary

The visit recording workflow was already well-designed with:
- One-tap recording start
- Smart consent handling
- Provider assignment flexibility
- Real-time processing feedback

**We've now added**:
1. ✅ Visit deletion (with confirmation)
2. ✅ Provider editing on existing visits
3. ✅ Complete folder system (backend + API)
4. ✅ Complete tag system (backend + API)
5. ✅ Visit detail screen (shows everything)

**Still needed**:
- UI components for folder management
- UI components for tag management
- Filtering and search UI
- Bulk operations

The foundation is solid and ready for the UI layer to be built on top!
