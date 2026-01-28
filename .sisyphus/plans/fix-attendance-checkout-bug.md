# Fix Plan: Check-Out Becomes Check-In Logic Bug

## TL;DR

> **Quick Summary**: Fix bug where checking out results in a new "In" record because the system fails to find the initial check-in due to timezone mismatch (UTC vs WIB).
>
> **Deliverables**:
>
> - Fixed `check_in_out` handler in `apps/vexis-api/src/handlers/attendance.rs`
> - Correct date boundary calculation using WIB (UTC+7)
>
> **Estimated Effort**: Quick
> **Parallel Execution**: NO - single task

---

## Context

### Bug Report

User reports: "When I try to check out, it creates another check-in instead."

### Root Cause Analysis

1. **Timezone Mismatch**: The current logic uses `Utc::now().date_naive()` to determine "today".
2. **The "Yesterday" Problem**:
   - 06:00 WIB (Check-in) = 23:00 UTC **Previous Day**.
   - 17:00 WIB (Check-out) = 10:00 UTC **Current Day**.
3. **Query Failure**:
   - When checking out, the system queries for logs on "Current Day" (UTC).
   - The Check-in (23:00 UTC previous day) is EXCLUDED.
   - System sees `None` for today's logs → defaults to "In".

---

## Work Objectives

### Core Objective

Ensure that "today's" check-in is found regardless of whether it happened in the previous UTC day (but same WIB day).

### Concrete Deliverables

- `apps/vexis-api/src/handlers/attendance.rs` - Fixed handler logic

### Definition of Done

- [x] Check-in at 06:00 WIB (23:00 UTC prev day) is found when checking out at 17:00 WIB.
- [x] Logic consistently uses WIB (UTC+7) for defining "Today".

---

## TODOs

- [x] 1. Fix Timezone Logic in Check-In/Out Handler

  **What to do**:
  1. Modify `apps/vexis-api/src/handlers/attendance.rs`.
  2. Implement the same date logic used in `dashboard.rs` fix:
     - `now_wib = now_utc + 7 hours`
     - `start_of_day_wib = now_wib date at 00:00:00`
     - `end_of_day_wib = now_wib date at 23:59:59`
     - Convert back to UTC for query.

  **Code Snippet**:

  ```rust
  // WIB Timezone (UTC+7)
  let now_utc = Utc::now();
  let wib_offset = chrono::Duration::hours(7);
  let now_wib = now_utc + wib_offset;
  let today_date = now_wib.date_naive();

  // Calculate WIB day boundaries
  let start_of_day_wib = today_date.and_hms_opt(0, 0, 0).expect("Invalid time");
  let end_of_day_wib = today_date.and_hms_opt(23, 59, 59).expect("Invalid time");

  // Convert to UTC for query
  let today_start = (start_of_day_wib - wib_offset).and_utc();
  let today_end = (end_of_day_wib - wib_offset).and_utc();
  ```

  **Acceptance Criteria**:
  - [ ] `cargo check` passes
  - [ ] Logic handles day crossover correctly (e.g., check-in before 07:00 WIB)

---

## Success Criteria

### Verification Commands

```bash
cargo check
```
