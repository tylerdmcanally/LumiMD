# LumiMD - Visit Management Architecture

## 📐 System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Mobile App (React Native/Expo)          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Features (src/features)             Shared (src/shared)         │
│  ├── home/HomeScreen                 ├── components/            │
│  ├── visits/{List,Detail,Recorder}   │   ├── ui/icon-symbol     │
│  ├── booking/AppointmentBooking      │   ├── themed-text/view   │
│  ├── appointments/MyAppointments     │   └── parallax-scroll    │
│  ├── providers/ProviderSearch        ├── hooks/use-*            │
│  └── facilities/FacilityResults      ├── context/AuthContext    │
│                                      └── services/api/*         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                               ↓ HTTP/REST
┌─────────────────────────────────────────────────────────────────┐
│                    Backend API (Node.js/Express)                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Routes                                                          │
│  ├── /api/visits                    Core Features              │
│  │   ├── POST /                     ├── Authentication (JWT)   │
│  │   ├── GET /                      ├── HIPAA Compliance       │
│  │   ├── POST /:id/upload           ├── Audit Logging          │
│  │   ├── PUT /:id                   ├── Rate Limiting          │
│  │   ├── DELETE /:id                ├── Encryption (AES-256)   │
│  │   ├── PUT /:id/folder 🆕        └── Input Validation (Zod)  │
│  │   └── POST /:id/tags 🆕                                     │
│  │                                                               │
│  ├── /api/folders 🆕                                            │
│  │   ├── POST /                                                 │
│  │   ├── GET /                                                  │
│  │   ├── GET /:id                                               │
│  │   ├── PUT /:id                                               │
│  │   └── DELETE /:id                                            │
│  │                                                               │
│  ├── /api/providers                                             │
│  │   └── [CRUD operations]                                      │
│  │                                                               │
│  └── /api/tags 🆕                                               │
│      └── GET /                                                   │
│                                                                  │
│  Controllers                         Services                   │
│  ├── visitController                ├── visitService           │
│  ├── visitFolderController 🆕       ├── visitFolderService 🆕  │
│  └── providerController             ├── openaiService          │
│                                      ├── s3Service              │
│                                      └── authService            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                               ↓ Prisma ORM
┌─────────────────────────────────────────────────────────────────┐
│                   Database (PostgreSQL)                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Tables                                                          │
│  ├── users                          Relationships               │
│  ├── visits                          ├── User → Visit (1:N)    │
│  ├── visit_folders 🆕                ├── User → Folder (1:N)   │
│  ├── visit_tags 🆕                   ├── Visit → Folder (N:1)  │
│  ├── providers                       ├── Visit → Tags (1:N)    │
│  ├── action_items                    ├── Visit → Provider (N:1)│
│  ├── conditions                      └── Visit → ActionItem (1:N)│
│  ├── medications                                                │
│  └── audit_logs                                                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│                    External Services                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ├── OpenAI Whisper API (Transcription)                        │
│  ├── OpenAI GPT-4 API (Summarization)                          │
│  └── AWS S3 (Audio Storage, Encrypted)                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Frontend Directory Layout (Updated)

- `app/` – Expo Router route tree containing navigation groups.
- `src/features/` – domain-driven screens and experience modules (visits, booking, providers, etc.).
- `src/shared/` – reusable building blocks including UI components, hooks, context, services, and configuration.

## 🗄️ Database Schema (Simplified)

```
┌──────────────┐       ┌─────────────────┐       ┌──────────────┐
│    User      │       │  VisitFolder 🆕 │       │   Provider   │
├──────────────┤       ├─────────────────┤       ├──────────────┤
│ id (PK)      │──┐    │ id (PK)         │    ┌─│ id (PK)      │
│ email        │  │    │ userId (FK)     │◄───┘ │ userId (FK)  │
│ firstName    │  │    │ name            │      │ name         │
│ lastName     │  │    │ color           │      │ specialty    │
│ ...          │  │    │ icon            │      │ ...          │
└──────────────┘  │    └─────────────────┘      └──────────────┘
                  │                                      ▲
                  │    ┌─────────────────┐              │
                  │    │     Visit       │              │
                  └───►├─────────────────┤              │
                       │ id (PK)         │              │
                       │ userId (FK)     │              │
                       │ providerId (FK) ├──────────────┘
                       │ folderId (FK) 🆕│◄─────────────┐
                       │ visitDate       │              │
                       │ status          │              │
                       │ audioFileUrl    │       ┌──────┴────────┐
                       │ transcription   │       │ From Folder   │
                       │ summary         │       └───────────────┘
                       └─────────────────┘
                              │ 1
                              │
                              │ N
                       ┌──────▼──────────┐
                       │  VisitTag 🆕    │
                       ├─────────────────┤
                       │ id (PK)         │
                       │ visitId (FK)    │
                       │ tag             │
                       │ createdAt       │
                       └─────────────────┘
```

## 🔄 Visit Lifecycle State Machine

```
┌──────────────┐
│  RECORDING   │ ◄─── User starts recording
└──────┬───────┘
       │ Recording saved
       ▼
┌──────────────┐
│  UPLOADING   │ ◄─── Audio file uploading to S3
└──────┬───────┘
       │ Upload complete
       ▼
┌──────────────┐
│  PROCESSING  │ ◄─── AI transcription & summarization
└──────┬───────┘
       │ AI complete
       ▼
┌──────────────┐
│  COMPLETED   │ ◄─── Visit ready, summary available
└──────────────┘
       │ (Optional)
       │ Error occurs
       ▼
┌──────────────┐
│    FAILED    │ ◄─── Processing error
└──────────────┘

At any point (except RECORDING):
  - User can change provider
  - User can add to folder
  - User can add tags
  - User can delete visit
```

## 🏗️ Folder Organization Model

```
User's Visits
├── 📁 Cardiology (color: #0066CC)
│   ├── Visit: Dr. Smith - Jan 15, 2025
│   ├── Visit: Dr. Smith - Feb 20, 2025
│   └── Visit: Dr. Jones - Mar 5, 2025
│
├── 📁 Annual Checkups (color: #00AA44)
│   └── Visit: Dr. Williams - Jan 3, 2025
│
├── 📁 Emergency (color: #DD0000)
│   └── Visit: ER - Dec 25, 2024
│
└── 📂 No Folder (uncategorized)
    └── Visit: Dr. Taylor - Mar 15, 2025
```

## 🏷️ Tag System Model

```
Visit: "Dr. Smith - Cardiology - Jan 15, 2025"
Tags: ["important", "follow-up", "medication-change"]

Visit: "Dr. Williams - Annual Checkup - Jan 3, 2025"
Tags: ["routine", "clean-bill-of-health"]

Visit: "ER - Emergency - Dec 25, 2024"
Tags: ["emergency", "important", "chest-pain"]

User's All Tags (unique):
  ["important", "follow-up", "medication-change", "routine",
   "clean-bill-of-health", "emergency", "chest-pain"]
```

## 🔐 Security & Compliance Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Security Layers                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Transport Security                                       │
│     └── HTTPS/TLS (encryption in transit)                   │
│                                                              │
│  2. Authentication                                           │
│     └── JWT tokens (access + refresh)                       │
│                                                              │
│  3. Authorization                                            │
│     └── User owns data (visits/folders/tags)                │
│                                                              │
│  4. Data Encryption                                          │
│     ├── PHI encrypted at rest (AES-256-GCM)                 │
│     └── S3 server-side encryption                           │
│                                                              │
│  5. Audit Logging (HIPAA)                                   │
│     └── All PHI access logged                               │
│                                                              │
│  6. Rate Limiting                                            │
│     └── Prevent abuse/DDoS                                  │
│                                                              │
│  7. Input Validation                                         │
│     └── Zod schemas on all inputs                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## 📊 Data Flow: Record Visit

```
Mobile App                Backend                 AI Services
    │                        │                        │
    │ 1. Start Recording     │                        │
    ├───────────────────────►│                        │
    │                        │ Create Visit (RECORDING)
    │◄───────────────────────┤                        │
    │                        │                        │
    │ 2. Stop Recording      │                        │
    │ (Audio in memory)      │                        │
    │                        │                        │
    │ 3. Upload Audio        │                        │
    ├───────────────────────►│                        │
    │                        │ Upload to S3           │
    │                        ├───────────────────────►│
    │                        │                        │
    │                        │ Update: UPLOADING      │
    │◄───────────────────────┤                        │
    │                        │                        │
    │ 4. (Wait...)          │                        │
    │                        │ 5. Transcribe (Whisper)│
    │                        ├───────────────────────►│
    │                        │ Update: PROCESSING     │
    │                        │                        │
    │                        │◄───────────────────────┤
    │                        │ Transcript             │
    │                        │                        │
    │                        │ 6. Summarize (GPT-4)   │
    │                        ├───────────────────────►│
    │                        │                        │
    │                        │◄───────────────────────┤
    │                        │ Summary + Action Items │
    │                        │                        │
    │                        │ Update: COMPLETED      │
    │                        │                        │
    │ 7. Refresh Visit List  │                        │
    ├───────────────────────►│                        │
    │◄───────────────────────┤                        │
    │ Visit with AI Summary  │                        │
    │                        │                        │
```

## 🎯 Feature Comparison: Before vs After

| Feature                      | Before | After |
|------------------------------|--------|-------|
| Record visit                 | ✅      | ✅     |
| View visit list              | ✅      | ✅     |
| View visit details           | ❌      | ✅ NEW |
| Assign provider before       | ✅      | ✅     |
| Assign provider after        | ✅      | ✅     |
| Change provider              | ❌      | ✅ NEW |
| Remove provider              | ❌      | ✅ NEW |
| Delete visit                 | ❌      | ✅ NEW |
| Create folders               | ❌      | ✅ NEW |
| Move visit to folder         | ❌      | ✅ NEW |
| Filter by folder             | ❌      | 🟡 API Ready |
| Add tags to visit            | ❌      | ✅ NEW |
| Filter by tags               | ❌      | 🟡 API Ready |
| View AI summary              | ✅      | ✅ Enhanced |
| View transcript              | ❌      | ✅ NEW |
| View action items            | ❌      | ✅ NEW |

Legend:
- ✅ = Implemented
- 🟡 = Backend ready, UI needed
- ❌ = Not available

## 🚀 Performance Characteristics

### API Response Times (Expected)
- List visits: < 200ms
- Get visit details: < 150ms
- List folders: < 100ms
- Create folder: < 200ms
- Move to folder: < 150ms
- Add tags: < 200ms
- Delete visit: < 300ms

### Database Indexes
```sql
-- Existing indexes
CREATE INDEX idx_visits_user_id ON visits(user_id);
CREATE INDEX idx_visits_provider_id ON visits(provider_id);
CREATE INDEX idx_visits_visit_date ON visits(visit_date);

-- New indexes (auto-created by Prisma)
CREATE INDEX idx_visits_folder_id ON visits(folder_id);
CREATE INDEX idx_visit_tags_visit_id ON visit_tags(visit_id);
CREATE UNIQUE INDEX idx_visit_folders_user_name ON visit_folders(user_id, name);
CREATE UNIQUE INDEX idx_visit_tags_visit_tag ON visit_tags(visit_id, tag);
```

## 📦 Bundle Size Impact

### Backend
- New files: ~1,500 lines of code
- New dependencies: None (uses existing Prisma)
- Bundle size change: +50KB compiled

### Frontend
- New components: ~800 lines (VisitDetail)
- New API services: ~200 lines (folders.ts)
- Bundle size change: +15KB minified

## 🎓 Key Design Decisions

1. **Folders are soft organizational** - Deleting a folder doesn't delete visits
2. **Tags are free-form** - No predefined list, user creates as needed
3. **Provider is optional** - Visits can exist without a provider
4. **Folder names must be unique per user** - Prevents confusion
5. **Tags are case-sensitive** - "Important" ≠ "important"
6. **One visit can have multiple tags** - But each tag only once
7. **Folder has color and icon** - For better visual organization

## 🔮 Future Enhancements

- **Smart Auto-foldering**: Suggest folder based on provider specialty
- **Tag Autocomplete**: Show existing tags as user types
- **Bulk Operations**: Select multiple visits, bulk move/tag
- **Folder Sharing**: Share entire folder with trusted user
- **Visit Search**: Full-text search across transcripts
- **Advanced Filters**: Combine folder + tag + date + provider
- **Folder Nesting**: Sub-folders for deeper organization
- **Tag Categories**: Group related tags (symptoms, procedures, etc.)
- **Visit Templates**: Pre-fill visit with common data
- **Export**: Export folder/tag as PDF/CSV

---

**Architecture Version**: 2.0
**Last Updated**: October 15, 2025
**Status**: ✅ Production Ready (Backend), 🟡 UI Development Needed
