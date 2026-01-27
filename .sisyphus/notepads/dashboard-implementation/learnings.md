# Dashboard Implementation Learnings

## UI/UX

- Used `lucide-react` for consistent iconography.
- Implemented a real-time clock using `useEffect` and `setInterval`.
- Used `Intl.DateTimeFormat` for Indonesian date/time formatting.
- Structured the dashboard with a header, status cards, and recent activity table.

## Components

- Reused `Card` from `@/components/ui/card` for consistent styling.
- Mocked data structure to simulate API response.

## Routing

- Updated `App.tsx` to include the `/dashboard` route protected by `ProtectedRoute`.
