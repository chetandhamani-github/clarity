# Clarity

Clarity is a personal finance tracker designed for simplicity and ease of use. It targets iOS and Android.

## Technology Stack

- **Frontend:** React Native (Expo)
- **Language:** TypeScript
- **State Management:** TanStack Query (server state), Zustand (client state)
- **Navigation:** Expo Router
- **Backend (API):** Spring Boot (REST APIs) + PostgreSQL

## Prerequisites

- Node.js (>= 18)
- Expo CLI
- iOS Simulator (macOS only) or Android Emulator for testing

## Installation

```bash
npm install
```

## Environment Setup

Copy the example environment file and update variables if necessary:

```bash
cp .env.example .env
```

## Running the App

Start the Expo development server:

```bash
npm start
```

- Press `a` to open Android
- Press `i` to open iOS

## Development Scripts

- `npm run typecheck`: Run TypeScript type checking
- `npm run lint`: Run ESLint
- `npm run lint:fix`: Fix ESLint auto-fixable issues
- `npm run format`: Format code using Prettier
- `npm run format:check`: Check code formatting
- `npm run test`: Run Jest tests
- `npm run test:watch`: Run Jest tests in watch mode

## Basic Project Structure

- `/src/components`: Reusable UI components (Button, Input, etc.)
- `/src/app`: Expo Router navigation screens and layouts
- `/src/services`: API clients, secure storage abstractions
- `/src/theme`: Centralized design system
- `/src/store`: Zustand stores for client-side state
- `/src/hooks`: Custom React hooks
