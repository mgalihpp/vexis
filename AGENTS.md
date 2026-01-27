# Agent Instructions for AbsenGo Monorepo

Welcome to the AbsenGo project. This is a monorepo for a web-based attendance system using a Rust backend and a React frontend.

## Project Structure

- `apps/absengo-web`: Frontend (React 19 + Vite + TypeScript)
- `apps/absengo-api`: Backend (Rust + Axum + MongoDB)
- `packages/`: Shared packages (components, hooks, utils, api)

## 1. Development Commands

### Root Commands (pnpm)

- `pnpm install`: Install all dependencies.
- `pnpm dev`: Run both frontend and backend concurrently.
- `pnpm dev:web`: Run the frontend development server.
- `pnpm dev:api`: Run the backend development server.

### Frontend (apps/absengo-web)

- `pnpm dev`: Start Vite dev server.
- `pnpm build`: Build for production.
- `pnpm lint`: Run ESLint.
- `pnpm preview`: Preview production build.

### Backend (apps/absengo-api)

- `cargo run`: Run the server.
- `cargo build`: Compile the project.
- `cargo test`: Run all tests.
- `cargo test <test_name>`: Run a specific test.
- `cargo fmt`: Format code.
- `cargo clippy`: Run linter.

## 2. Code Style Guidelines

### General

- **Language**: Use Indonesian for the application UI/messages (as per PRD), but use English for code (variables, functions, comments).
- **Proactiveness**: If you see missing types or boilerplate that follows project patterns, feel free to add them.

### Frontend (React + TypeScript)

- **React Version**: React 19. Use modern patterns (Actions, useOptimistic if applicable).
- **Components**: Use functional components with arrow functions.
  ```tsx
  const MyComponent: React.FC<Props> = ({ prop }) => { ... };
  ```
- **Naming**:
  - Components: `PascalCase.tsx`
  - Hooks: `useCamelCase.ts`
  - Constants: `UPPER_SNAKE_CASE`
- **Imports**: Order imports logically:
  1. React and third-party libraries.
  2. Shared packages from `@absengo/*`.
  3. Local components and styles.
- **Styling**: Tailwind CSS is preferred (if installed).
- **Types**: Always use `interface` or `type` for props and state. Avoid `any`.

### Backend (Rust + Axum)

- **Framework**: Axum 0.7+.
- **Naming**:
  - Functions/Variables: `snake_case`
  - Structs/Enums: `PascalCase`
  - Modules: `snake_case`
- **Error Handling**:
  - Use `Result<T, E>` where `E` implements `IntoResponse` for Axum.
  - Avoid `unwrap()` in production code; use `expect()` with a clear message or handle the error properly.
- **Database**: MongoDB with `mongodb` crate. Use GeoJSON for location data.
- **Async**: Use `tokio` for async runtime.

## 3. PRD Alignment (MVP)

- **Auth**: JWT with access (15m) and refresh (7d) tokens. HttpOnly cookies preferred.
- **Face Recognition**: Manual cosine similarity on `Vec<f64>`.
- **Geofencing**: Haversine formula or MongoDB `$geoNear`. Radius < 200m.

## 4. Automation & Rules

- No `.cursorrules` or `.github/copilot-instructions.md` detected yet.
- Follow ESLint and Cargo's default formatting rules.
- Always run `pnpm lint` (web) and `cargo clippy` (api) before submitting changes.

---

_Note: This file is intended for AI agents to understand the codebase context and constraints._
