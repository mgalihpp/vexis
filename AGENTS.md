# Agent Instructions for Vexis Monorepo

Welcome to the Vexis project. This is a monorepo for a web-based attendance system using a Rust backend and a React frontend. This file serves as the primary source of truth for AI agents operating in this repository.

## 1. Project Structure

The repository is organized as a pnpm workspace:

- `apps/vexis-web`: Frontend (React 19 + Vite + TypeScript + Tailwind CSS v4 + Shadcn/UI).
- `apps/vexis-api`: Backend (Rust + Axum + MongoDB + JWT).
- `packages/`: Shared packages (intended for components, hooks, utils, and api logic).
- `.env`: Environment variables (Local only, not committed).

## 2. Development Commands

### Root Commands (pnpm)

- `pnpm install`: Install all dependencies across the workspace.
- `pnpm dev`: Run both frontend and backend concurrently.
- `pnpm dev:web`: Run the frontend development server (`pnpm --filter vexis-web dev`).
- `pnpm dev:api`: Run the backend development server (`cargo run --manifest-path apps/vexis-api/Cargo.toml`).

### Frontend (apps/vexis-web)

- `pnpm dev`: Start Vite dev server.
- `pnpm build`: Build for production.
- `pnpm lint`: Run ESLint check.
- `pnpm preview`: Preview production build.
- **Testing**:
  - `pnpm test`: Run all tests (if Vitest is installed).
  - `pnpm test <filename>`: Run a specific test file.
- **Shadcn UI**:
  - `pnpm dlx shadcn@latest add <component>`: Add a new shadcn component.

### Backend (apps/vexis-api)

- `cargo run`: Run the server.
- `cargo build`: Compile the project.
- `cargo fmt`: Format code.
- `cargo clippy`: Run linter/static analysis.
- **Testing**:
  - `cargo test`: Run all tests.
  - `cargo test <test_name>`: Run a specific test function or module.
  - `cargo test -- --nocapture`: Run tests and show stdout.

## 3. Code Style Guidelines

### General Principles

- **Language**: UI/User-facing strings in **Indonesian**. Code (variables, functions, comments) in **English**.
- **Proactiveness**: Fix missing types, improve documentation, and add boilerplate following existing patterns.
- **Documentation**: Use high-quality JSDoc/RustDoc for public-facing functions/structs.

### Frontend (React + TypeScript)

- **Framework**: React 19. Prefer modern hooks and patterns (Actions, useOptimistic).
- **Components**: Functional components with arrow functions.
  ```tsx
  interface Props { ... }
  export const MyComponent: React.FC<Props> = ({ prop }) => { ... };
  ```
- **Naming**:
  - Components: `PascalCase.tsx`
  - Hooks: `useCamelCase.ts`
  - Utils/Logic: `camelCase.ts`
  - Styles: Tailwind classes only.
- **Path Aliases**: Use `@/` to refer to the `src` directory (configured in `tsconfig.json` and `vite.config.ts`).
- **Imports**:
  1. React and third-party libraries.
  2. Local UI components (`@/components/ui/...`).
  3. Local business logic/components.
  4. Styles/Assets.
- **Types**: Use `interface` for props/objects. Avoid `any` at all costs.

### Backend (Rust + Axum)

- **Architecture**:
  - `models/`: Structs and BSON mapping.
  - `handlers/`: Request processing logic.
  - `routes/`: Axum router definitions.
  - `config/`: Database and environment configuration.
- **Naming**:
  - Functions/Variables: `snake_case`
  - Structs/Enums: `PascalCase`
- **Error Handling**:
  - Implement `IntoResponse` for custom error types to handle Axum error responses gracefully.
  - **Rule**: Never use `.unwrap()` in production-ready code. Use `?` or `.expect("contextual message")`.
- **Database**:
  - Use `mongodb` crate with `tokio` runtime.
  - Map MongoDB documents to Rust structs using `serde`.
  - Use `ObjectId` for identifiers.
  - Geofencing: Use GeoJSON `Point` for location data.

## 4. PRD Alignment (MVP)

- **Auth**: JWT-based (Access token 15m, Refresh token 7d).
- **Face Recognition**: Cosine similarity calculation on `Vec<f64>` embeddings.
- **Geofencing**: Radius < 200m validation (Manual Haversine or MongoDB `$geoNear`).
- **Performance**: Ensure main attendance requests complete in < 300ms.

## 5. Automation & Rules

- **Formatting**: Always run `cargo fmt` and Prettier before committing.
- **Linting**: No warnings allowed in `cargo clippy` or `eslint`.
- **Git**: Use Conventional Commits (`feat:`, `fix:`, `chore:`, etc.).
- **Security**: Never commit `.env` or secrets. Ensure `.gitignore` is up to date.

---

_Note: This file is dynamically updated. Always refer to the latest version in the root directory._
