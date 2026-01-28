# Fix Plan: Dashboard Stats Check-In Null Bug

## TL;DR

> **Quick Summary**: Fix bug where `/api/dashboard/stats` returns `check_in: null` even after user just checked in, while `recent_logs` correctly shows the check-in time.
>
> **Deliverables**:
>
> - Fixed `get_dashboard_stats` handler with correct date filtering
> - Debug logging to verify query behavior
>
> **Estimated Effort**: Quick
> **Parallel Execution**: NO - single task

---

## Context

### Bug Report

```json
{
  "check_in": null, // BUG: Should show "08:12"
  "check_out": null,
  "recent_logs": [
    {
      "date": "2026-01-28",
      "check_in": "08:12", // This works correctly!
      "check_out": null,
      "status": "Hadir"
    }
  ]
}
```

### Root Cause Analysis

1. **`recent_logs` query** - NO date filter, finds all user's records → WORKS
2. **Today's stats query** - HAS date filter → FAILS to find records

The date filter is incorrectly calculated or the query structure is wrong.

### Suspected Issues

1. **Timezone boundary calculation** - Converting WIB day boundaries to UTC might be off
2. **Query execution** - The filter might not match how MongoDB stores the timestamp
3. **Cursor iteration** - `while let Ok(Some(att))` silently exits on error

---

## Work Objectives

### Core Objective

Fix the date filter logic so `check_in` and `check_out` correctly return today's attendance times.

### Concrete Deliverables

- `apps/vexis-api/src/handlers/dashboard.rs` - Fixed handler

### Definition of Done

- [x] After check-in, `/api/dashboard/stats` returns `check_in` with correct time
- [x] After check-out, `/api/dashboard/stats` returns `check_out` with correct time
- [x] Times are displayed in WIB (UTC+7) format

### Must Have

- Correct date boundary calculation (WIB day start/end → UTC)
- Proper error handling for cursor iteration

### Must NOT Have

- Breaking changes to response structure
- Hardcoded dates

---

## TODOs

- [x] 1. Debug and Fix Date Filter Logic

  **What to do**:
  1. Read current `apps/vexis-api/src/handlers/dashboard.rs`
  2. Identify the exact issue with date filtering
  3. Fix the logic:
     - Use simpler approach: calculate WIB day boundaries directly
     - Ensure UTC conversion is correct (WIB = UTC+7, so 00:00 WIB = 17:00 UTC previous day)
  4. Add debug println to verify timestamps (temporary)
  5. Test and verify

  **Key Fix Strategy**:

  Instead of complex timezone conversions, use direct calculation:

  ```rust
  // Get current time in WIB
  let now_utc = Utc::now();
  let wib_offset = chrono::Duration::hours(7);

  // Calculate today's date in WIB
  let now_wib = now_utc + wib_offset;
  let today_date = now_wib.date_naive();

  // Calculate WIB day boundaries in UTC
  // 00:00 WIB = 17:00 UTC previous day
  // 23:59 WIB = 16:59 UTC same day
  let start_of_day_wib = today_date.and_hms_opt(0, 0, 0).unwrap();
  let end_of_day_wib = today_date.and_hms_opt(23, 59, 59).unwrap();

  // Convert to UTC by subtracting 7 hours
  let start_utc = (start_of_day_wib - wib_offset).and_utc();
  let end_utc = (end_of_day_wib - wib_offset).and_utc();
  ```

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **References**:
  - `apps/vexis-api/src/handlers/dashboard.rs` - Current implementation
  - `apps/vexis-api/src/handlers/attendance.rs` - Working date logic reference

  **Acceptance Criteria**:
  - [x] `cargo check` passes
  - [x] After restart, check-in appears in `check_in` field
  - [x] Time is displayed in WIB format (e.g., "08:12")

---

## Commit Strategy

| After Task | Message                                             | Files                   |
| ---------- | --------------------------------------------------- | ----------------------- |
| 1          | `fix(api): correct date filter for dashboard stats` | `handlers/dashboard.rs` |

---

## Success Criteria

### Verification Commands

```bash
# 1. Restart API server
cargo run

# 2. Login and check-in
# 3. Call GET /api/dashboard/stats
# 4. Verify check_in is NOT null
```

### Final Checklist

- [ ] `check_in` shows correct WIB time after check-in
- [ ] `check_out` shows correct WIB time after check-out
- [ ] `recent_logs` still works correctly
