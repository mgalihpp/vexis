# Implementation Plan: Attendance Dashboard (Feature 2)

## TL;DR

> **Quick Summary**: Implement the main Dashboard for the Vexis Attendance System, providing users with a summary of their attendance status, recent logs, and a real-time clock.
>
> **Deliverables**:
>
> - Backend: `Attendance` model and migration (if applicable).
> - Backend: `/api/dashboard/stats` endpoint.
> - Frontend: Dashboard Page (`/dashboard`) with status cards and activity feed.
> - Frontend: Integration with existing auth flow.
>
> **Estimated Effort**: Short
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: Backend Model → Backend API → Frontend UI

---

## Context

### Original Request

The user wants to implement "Feature 2" (Dashboard/Home) first in the attendance system.

### Interview Summary

**Key Discussions**:

- **Priority**: Dashboard first.
- **Geofencing**: Single location (Headquarters).
- **Face Auth**: Server-side verification (logic exists in `face.rs`).
- **Testing**: Manual verification only for now.

### Metis Review (Internal)

**Identified Gaps** (addressed):

- **Model Missing**: `Attendance` model must be created first.
- **Data Display**: Dashboard should show earliest check-in and latest check-out for the current day.
- **Empty State**: Handle cases where no attendance records exist.

---

## Work Objectives

### Core Objective

Build a functional dashboard that serves as the home screen for employees, displaying their real-time attendance status.

### Concrete Deliverables

- `apps/vexis-api/src/models/attendance.rs`: Structs for attendance logs.
- `apps/vexis-api/src/handlers/dashboard.rs`: Handler for dashboard statistics.
- `apps/vexis-web/src/pages/dashboard/dashboard-page.tsx`: Main UI component.
- `apps/vexis-web/src/lib/api.ts`: API client update for dashboard.

### Definition of Done

- [ ] User can log in and see the Dashboard.
- [ ] Dashboard shows "Belum Absen" if no logs exist today.
- [ ] Dashboard shows check-in time if the user has checked in.
- [ ] Recent logs list shows the last 5 attendance activities.

### Must Have

- Real-time clock/date display.
- Greeting with user's name.
- Today's status cards (Masuk, Pulang, Total Jam).
- Responsive layout (Mobile-friendly).

### Must NOT Have (Guardrails)

- Actual "Check-in" button functionality (GPS/Face verification) - this belongs to Feature 1.
- Administrative reporting (Feature 5).

---

## Verification Strategy

### Test Decision

- **Infrastructure exists**: NO
- **User wants tests**: NO
- **QA approach**: Manual verification

### Manual QA Procedures

**By Deliverable Type:**

| Type            | Verification Tool | Procedure                                                                       |
| --------------- | ----------------- | ------------------------------------------------------------------------------- |
| **Frontend/UI** | Browser           | Navigate to `/dashboard`, verify layout, clock, and greeting.                   |
| **API/Backend** | curl              | `curl -X GET http://localhost:8000/api/dashboard/stats` - verify JSON response. |
| **Data Flow**   | Browser           | Verify that mock data in DB appears correctly on the UI.                        |

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
├── Task 1: Create Attendance Model & Register in Backend
└── Task 2: Implement Dashboard UI Layout (Frontend)

Wave 2 (After Wave 1):
├── Task 3: Implement Dashboard Stats API (Backend)
└── Task 4: Connect Frontend to Dashboard API

Critical Path: Task 1 → Task 3 → Task 4
```

---

## TODOs

- [ ] 1. Create Attendance Model & Register in Backend

  **What to do**:
  - Define `Attendance` struct in `apps/vexis-api/src/models/attendance.rs`.
  - Fields: `user_id`, `timestamp`, `type` (In/Out), `location` (Point), `face_verified` (bool).
  - Register module in `models/mod.rs`.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: [`rust-master`]
  - **Reason**: Standard Rust struct definition and module registration.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 3

  **References**:
  - `apps/vexis-api/src/models/user.rs`: Reference for MongoDB serialization/deserialization.

  **Acceptance Criteria**:
  - [ ] `apps/vexis-api/src/models/attendance.rs` exists.
  - [ ] `cargo build` succeeds.

- [ ] 2. Implement Dashboard UI Layout (Frontend)

  **What to do**:
  - Create `apps/vexis-web/src/pages/dashboard/dashboard-page.tsx`.
  - Add Header with Greeting ("Halo, [Name]").
  - Add Real-time Clock component.
  - Add Status Cards (grid of 3: Masuk, Pulang, Total Jam).
  - Add Recent Activity Table/List.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]
  - **Reason**: Requires UI layout and component composition using Tailwind.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 4

  **References**:
  - `apps/vexis-web/src/components/ui/card.tsx`: Use for status cards.
  - `apps/vexis-web/src/pages/profile/profile-page.tsx`: Layout reference.

  **Acceptance Criteria**:
  - [ ] UI is visible at `/dashboard`.
  - [ ] Layout is responsive.

- [ ] 3. Implement Dashboard Stats API (Backend)

  **What to do**:
  - Create `apps/vexis-api/src/handlers/dashboard.rs`.
  - Implement `get_dashboard_stats` function.
  - Logic: Query `Attendance` collection for current user's logs for today.
  - Return: `{ check_in: Option<DateTime>, check_out: Option<DateTime>, recent_logs: Vec<Attendance> }`.
  - Register route in `routes/mod.rs` as `GET /api/dashboard/stats`.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`rust-master`]
  - **Reason**: Requires MongoDB aggregation or filtering logic.

  **Parallelization**:
  - **Can Run In Parallel**: NO (Depends on Task 1)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 4

  **References**:
  - `apps/vexis-api/src/handlers/user.rs`: Reference for DB querying patterns.

  **Acceptance Criteria**:
  - [ ] `GET /api/dashboard/stats` returns 200 OK.
  - [ ] JSON schema matches expectations.

- [ ] 4. Connect Frontend to Dashboard API

  **What to do**:
  - Add `getDashboardStats` to `apps/vexis-web/src/lib/api.ts`.
  - Use `useEffect` or a data fetching hook in `DashboardPage` to fetch stats.
  - Replace static mock data with API data.
  - Handle loading and error states.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: [`frontend-ui-ux`]
  - **Reason**: Integration task between API and UI.

  **Parallelization**:
  - **Can Run In Parallel**: NO (Depends on Task 2, 3)
  - **Parallel Group**: Wave 2

  **Acceptance Criteria**:
  - [ ] Dashboard shows real data from DB (or empty state if none).

---

## Commit Strategy

| After Task | Message                                         | Files                                              |
| ---------- | ----------------------------------------------- | -------------------------------------------------- |
| 1          | `feat(api): add attendance model`               | `models/attendance.rs`, `models/mod.rs`            |
| 2          | `feat(web): implement dashboard layout`         | `pages/dashboard/dashboard-page.tsx`               |
| 3          | `feat(api): implement dashboard stats endpoint` | `handlers/dashboard.rs`, `routes/mod.rs`           |
| 4          | `feat(web): connect dashboard to api`           | `lib/api.ts`, `pages/dashboard/dashboard-page.tsx` |

---

## Success Criteria

### Verification Commands

```bash
# Verify Backend
curl -X GET http://localhost:8000/api/dashboard/stats -H "Authorization: Bearer <token>"

# Verify Frontend
# Open browser at http://localhost:5173/dashboard
```

### Final Checklist

- [ ] Greeting shows logged-in user name.
- [ ] Real-time clock updates every second.
- [ ] Status cards show correct information based on DB logs.
- [ ] Recent logs list is populated correctly.
