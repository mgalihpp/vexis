# Implementation Plan: Core Attendance (Check-in/Out)

## TL;DR

> **Quick Summary**: Implement the core attendance engine allowing users to check-in and check-out via GPS Geofencing and Face Recognition validation.
>
> **Deliverables**:
>
> - Backend: `POST /api/attendance/check` endpoint with validation logic.
> - Frontend: Attendance Page (`/attendance`) with camera and GPS integration.
> - Integration: Dashboard "Absen" button and real-time status updates.
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: Backend API → Frontend Page → Dashboard Integration

---

## Context

### Original Request

Implement Feature 1: Core Attendance (Check-in/Check-out).

### Interview Summary

**Key Discussions**:

- **Geofencing**: Single location (Headquarters) at Monas (-6.175392, 106.827153). Radius < 200m.
- **Face Recognition**: Server-side comparison. Threshold: 0.8.
- **Testing**: Manual verification only.

### Internal Analysis (Gaps Addressed)

- **Face Registration Check**: API will reject check-in if user has no saved face landmarks.
- **Double Check-in Protection**: API prevents multiple "In" or "Out" logs for the same day.
- **Error Transparency**: UI will specifically state if failure is due to Location or Face mismatch.
- **Server-Side Timestamp**: All attendance logs use server-time to prevent client-side spoofing.

---

## Work Objectives

### Core Objective

Enable users to record their presence securely using biometric and geographic validation.

### Concrete Deliverables

- `apps/vexis-api/src/handlers/attendance.rs`: Validation and storage logic.
- `apps/vexis-api/src/routes/attendance.rs`: API routing.
- `apps/vexis-web/src/pages/attendance/attendance-page.tsx`: Interactive attendance UI.
- `apps/vexis-web/src/lib/api.ts`: API client update for attendance check.

### Definition of Done

- [x] User can successfully "Check-in" when at Monas with matching face.
- [x] User can successfully "Check-out" after checking-in.
- [x] API rejects check-in if distance > 200m.
- [x] API rejects check-in if face similarity < 0.8.
- [x] Dashboard status updates immediately after action.

### Must Have

- Automated GPS fetching on the attendance page.
- Real-time face detection feedback.
- Clear success/error notifications (Sonner).
- Server-side validation of all data.

### Must NOT Have (Guardrails)

- Offline mode (GPS/Face requires connectivity).
- Multi-office support (Fixed to Monas for now).
- Manual override for GPS/Face failures.

---

## Verification Strategy

### Test Decision

- **Infrastructure exists**: YES (Cargo/Vitest)
- **User wants tests**: NO (Manual-only)
- **QA approach**: Exhaustive manual verification.

### Manual QA Procedures

| Type            | Verification Tool | Procedure                                                                         |
| --------------- | ----------------- | --------------------------------------------------------------------------------- |
| **Backend API** | curl              | Send `POST` with mock landmarks and coordinates. Verify status codes.             |
| **GPS Logic**   | Browser           | Use Chrome DevTools to spoof location (Monas vs Away). Verify geofence rejection. |
| **Face Logic**  | Camera            | Test with owner's face vs different person/photo. Verify similarity rejection.    |
| **Workflow**    | Browser           | Perform full In -> Dashboard -> Out -> Dashboard flow.                            |

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
├── Task 1: Implement Backend Attendance Check API
└── Task 2: Implement Frontend Attendance Page UI

Wave 2 (After Wave 1):
├── Task 3: Integrate API with Attendance Page
└── Task 4: Update Dashboard with Attendance Actions
```

---

## TODOs

- [x] 1. Implement Backend Attendance Check API

  **What to do**:
  - Create `apps/vexis-api/src/handlers/attendance.rs`.
  - Logic:
    1. Fetch user from DB (get stored face landmarks and office location).
    2. Validate GPS using `utils::geofence::is_within_geofence`.
    3. Validate Face using `utils::face::compare_landmarks`.
    4. Determine status (In/Out) based on existing logs for today.
    5. Save `Attendance` record.
  - Register route in `routes/mod.rs` as `POST /api/attendance/check`.

  **Recommended Agent Profile**:
  - **Category**: `ultrabrain`
  - **Skills**: [`rust-master`]
  - **Reason**: Requires careful logic handling for biometric and geographic validation.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 3

  **References**:
  - `apps/vexis-api/src/utils/geofence.rs`
  - `apps/vexis-api/src/utils/face.rs`
  - `apps/vexis-api/src/models/attendance.rs`

  **Acceptance Criteria**:
  - [x] `POST /api/attendance/check` returns 200 on valid data.
  - [x] Returns 400 with specific message on Geofence or Face failure.
  - [x] Returns 400 if user has no registered face landmarks.

- [x] 2. Implement Frontend Attendance Page UI

  **What to do**:
  - Create `apps/vexis-web/src/pages/attendance/attendance-page.tsx`.
  - Integrate `FaceCapture` component.
  - Implement auto-geolocation fetching on mount.
  - Add status indicators (GPS Active, Face Detected).
  - Add "Kirim Absensi" button.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]
  - **Reason**: Complex interaction between camera, GPS, and UI state.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 3

  **References**:
  - `apps/vexis-web/src/components/face/face-capture.tsx`
  - `apps/vexis-web/src/components/location/location-picker.tsx` (for logic reference)

  **Acceptance Criteria**:
  - [x] Camera stream is visible.
  - [x] GPS coordinates are fetched and displayed (mock/real).
  - [x] Page is responsive.

- [x] 3. Integrate API with Attendance Page

  **What to do**:
  - Add `checkAttendance` to `apps/vexis-web/src/lib/api.ts`.
  - Call API when "Kirim Absensi" is clicked.
  - Show success toast and redirect to Dashboard on success.
  - Show error toast with details on failure.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: [`frontend-ui-ux`]
  - **Reason**: Standard API integration.

  **Parallelization**:
  - **Can Run In Parallel**: NO (Depends on 1, 2)
  - **Parallel Group**: Wave 2

  **Acceptance Criteria**:
  - [x] Attendance is successfully recorded in DB.
  - [x] Error messages from server are displayed to user.

- [x] 4. Update Dashboard with Attendance Actions

  **What to do**:
  - Add "Absen Sekarang" button to `DashboardPage`.
  - Button only appears if user hasn't completed attendance (both In and Out).
  - Button redirects to `/attendance`.
  - Update Status Cards to use real-time data from Task 3.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]
  - **Reason**: UI refinement for better UX.

  **Parallelization**:
  - **Can Run In Parallel**: NO (Depends on 3)
  - **Parallel Group**: Wave 2

  **Acceptance Criteria**:
  - [x] Dashboard acts as the entry point for the attendance flow.

---

## Commit Strategy

| After Task | Message                                               | Files                                                       |
| ---------- | ----------------------------------------------------- | ----------------------------------------------------------- |
| 1          | `feat(api): implement attendance check endpoint`      | `handlers/attendance.rs`, `routes/attendance.rs`, `main.rs` |
| 2          | `feat(web): add attendance page layout`               | `attendance-page.tsx`, `App.tsx`                            |
| 3          | `feat(web): integrate attendance api`                 | `api.ts`, `attendance-page.tsx`                             |
| 4          | `feat(web): update dashboard with attendance actions` | `dashboard-page.tsx`                                        |

---

## Success Criteria

### Verification Commands

```bash
# Verify API
curl -X POST http://localhost:8000/api/attendance/check \
  -H "Authorization: Bearer <token>" \
  -d '{"lat": -6.175, "long": 106.827, "landmarks": [...]}'
```

### Final Checklist

- [x] GPS Rejection working.
- [x] Face Rejection working.
- [x] Check-in/Out status correctly persisted.
- [x] Dashboard updated.
