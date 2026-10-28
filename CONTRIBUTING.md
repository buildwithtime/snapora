# Contributing to Snapora

Thank you for your interest in contributing to Snapora! We welcome contributions that align with our core design principles: research-backed development, security, privacy, and code quality.

## Code of Conduct

All contributors must adhere to our [Code of Conduct](CODE_OF_CONDUCT.md).

## Development Setup

### Prerequisites
- Node.js >= 20.x (Recommended: Node.js 22 LTS)
- npm >= 10.x
- Git

### Getting Started

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/snapora.git
   cd snapora
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start development servers:
   ```bash
   # Starts both frontend and backend
   npm run dev
   ```
   - Frontend runs on `http://localhost:5173`
   - Backend API runs on `http://localhost:3001`

4. Run tests and typechecks:
   ```bash
   npm test
   npm run typecheck
   ```

## Pull Request Guidelines

- Ensure all new features or bug fixes have corresponding tests in Vitest.
- Maintain strict TypeScript type safety (`npm run typecheck` must pass with zero errors).
- Comply with security principles: no bypasses of URL allowlisting or SSRF defenses.
- Write descriptive Git commit messages.
