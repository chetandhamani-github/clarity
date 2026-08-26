# Project

Clarity is a personal finance tracker built with:

- React Native
- TypeScript
- Spring Boot backend

# Architecture rules

- Keep architecture lightweight.
- Follow the existing project structure.
- Prefer reuse over duplication.
- Keep feature logic close to the feature.
- Keep API communication outside UI components.
- Use TanStack Query for server state.
- Use Zustand only for appropriate client state.
- Use secure storage for authentication credentials.
- Use the centralized theme.
- Avoid unnecessary abstractions.

# Coding rules

- Use strict TypeScript.
- Avoid `any`.
- Write readable code.
- Keep components reasonably small.
- Avoid unnecessary comments.
- Do not duplicate utilities/components.
- Do not introduce dependencies without a reason.
- Do not modify unrelated files.

# AI agent workflow

Before changing code:

1. Inspect the relevant existing code.
2. Understand how the current architecture works.
3. Reuse existing components/utilities.
4. Make the smallest appropriate change.
5. Run type checking.
6. Run linting.
7. Run relevant tests.
8. Fix issues introduced by the change.

Agents should NOT:

- rewrite working code unnecessarily
- create unnecessary abstractions
- introduce enterprise architecture
- install libraries for trivial problems
- modify unrelated files
- change the project's architecture without a strong reason
