# Contributing to Snapora

Thank you for your interest in contributing to Snapora! We welcome contributions that align with our core design principles: research-backed development, application security, user privacy, and strict code quality.

## Code of Conduct

All contributors must adhere to our [Code of Conduct](CODE_OF_CONDUCT.md).

---

## Development Setup

### Prerequisites
- **Node.js**: `>= 22.x` (Recommended: Node.js 22 LTS or Node.js 24 LTS)
- **npm**: `>= 10.x`
- **Git**

### Getting Started

1. **Fork and clone the repository**:
   ```bash
   git clone https://github.com/buildwithtime/snapora.git
   cd snapora
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start local development servers**:
   ```bash
   # Starts frontend (:5173) and backend (:3001) concurrently
   npm run dev
   ```
   - Frontend interface: [http://localhost:5173](http://localhost:5173)
   - Backend API: [http://localhost:3001](http://localhost:3001)

4. **Run the quality verification suite locally**:
   ```bash
   # Run automated test suites across all workspaces
   npm test

   # Run TypeScript compilation checks
   npm run typecheck

   # Run ESLint across frontend and backend workspaces
   npm run lint

   # Verify production build compilation
   npm run build

   # Check working tree formatting and whitespace
   git diff --check
   ```

---

## Branch Naming Conventions

Create focused branches off `main` following this standard:

- `feature/<short-description>`: New functionality or architectural capability
- `fix/<short-description>`: Bug fixes or security corrections
- `docs/<short-description>`: Documentation additions or updates
- `refactor/<short-description>`: Code restructuring without functional behavior change
- `test/<short-description>`: New or revised test suites
- `chore/<short-description>`: Dependency updates, CI workflows, or maintenance

---

## Commit Message Conventions

Snapora follows the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <short description in imperative mood>

[optional body explaining rationale]

[optional footer(s)]
```

### Approved Types:
- `feat`: A new feature or capability
- `fix`: A bug or security fix
- `docs`: Documentation changes
- `style`: Formatting, missing semicolons, whitespace corrections
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `perf`: Code change that improves performance
- `test`: Adding missing tests or correcting existing tests
- `chore`: Build process, auxiliary tools, or dependency updates

---

## Pull Request Guidelines & Verification Checklist

Before submitting a pull request, ensure all checks pass locally:

- [ ] **Tests Passing**: `npm test` passes with 0 failures across both workspaces.
- [ ] **Typecheck Clean**: `npm run typecheck` emits 0 TypeScript diagnostics.
- [ ] **Lint Clean**: `npm run lint` completes with 0 warnings or errors.
- [ ] **Production Build**: `npm run build` succeeds (Vite bundle + tsc compilation).
- [ ] **Whitespace & Diff**: `git diff --check` emits zero whitespace or carriage-return issues.
- [ ] **Security Defenses Maintained**:
  - Socket-level SSRF filters (RFC1918, loopback, link-local, cloud metadata) are preserved.
  - CORS configurations prohibit permissive wildcards in production.
  - Zero credential collection: no Instagram session cookies, passwords, or logins are introduced.
  - Strict binary magic-byte validation (JPEG, MP4, WebM) is maintained.
- [ ] **Conventional Commit**: PR title and commits follow Conventional Commits format.
