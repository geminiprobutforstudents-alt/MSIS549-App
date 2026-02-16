# replit.md

## Overview

This is a **Talkalot** project — a mobile application built with **Expo (React Native)** for the frontend and a **FastAPI (Python)** backend. The app appears to be a proximity-based social/matching application where users can register, set interest tags, and be matched with nearby users. The frontend uses Expo's file-based routing with a tab navigation structure, while the backend provides a REST API backed by PostgreSQL via SQLAlchemy.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend (Expo / React Native)

- **Framework**: Expo SDK 54 with React Native 0.81, using the new architecture (`newArchEnabled: true`)
- **Routing**: File-based routing via `expo-router` v6 with typed routes enabled. Routes live in the `app/` directory.
- **Navigation Structure**: Tab-based layout with a `(tabs)` group containing `index` (Home) and `explore` screens. The root layout wraps everything in a theme provider that supports light/dark mode.
- **Styling**: Standard React Native `StyleSheet` with a custom theming system via `Colors.ts` constants and `useThemeColor` / `useColorScheme` hooks. No CSS-in-JS library like NativeWind is used.
- **Reusable Components**: Located in `components/` — includes `ThemedText`, `ThemedView`, `ParallaxScrollView`, `Collapsible`, `ExternalLink`, `HelloWave`, and `HapticTab`. Platform-specific components (e.g., `IconSymbol.ios.tsx` vs `IconSymbol.tsx`) handle iOS vs Android/web differences.
- **Platform Support**: Android, iOS, and Web. Web output is static via Metro bundler.
- **Key Dependencies**: `react-native-reanimated` for animations, `react-native-gesture-handler`, `react-native-webview`, `expo-haptics`, `expo-blur`, `expo-image`.

### Backend (FastAPI / Python)

- **Framework**: FastAPI (in `main.py`)
- **ORM**: SQLAlchemy with a declarative base pattern
- **Database**: PostgreSQL, connected via the `DATABASE_URL` environment variable (Replit-provided PostgreSQL)
- **Data Model**: A single `User` table with:
  - `id` (String, primary key) — UUID-based user IDs
  - `last_seen` (DateTime) — tracks user activity
  - `is_nearby` (String) — simplified proximity flag ("true"/"false")
  - `interest_tags` (JSON) — list of interest tag strings for matching
  - `free_text_interests` (String, nullable) — stored but explicitly not used in matching logic
- **API Schemas** (Pydantic models defined but endpoints are incomplete/in-progress):
  - `RegisterResponse` — returns a userID
  - `InterestsRequest` — accepts userID, tags list, and optional free text
  - `HeartbeatRequest` — accepts userID and nearby boolean
- **Design Notes**: The backend is in early development. Models and schemas are defined but API route handlers are not fully implemented in the visible code. The matching logic is meant to be tag-based, with proximity as a filter.

### Project Structure

```
├── app/                    # Expo Router pages (file-based routing)
│   ├── _layout.tsx         # Root layout (Stack navigator + theme)
│   ├── +not-found.tsx      # 404 screen
│   └── (tabs)/             # Tab group
│       ├── _layout.tsx     # Tab navigator config
│       ├── index.tsx       # Home tab
│       └── explore.tsx     # Explore tab
├── components/             # Reusable React Native components
│   └── ui/                 # Platform-specific UI components
├── constants/              # Theme colors and app constants
├── hooks/                  # Custom React hooks (theming)
├── assets/                 # Images and fonts
├── scripts/                # Utility scripts (reset-project)
├── main.py                 # FastAPI backend server
├── app.json                # Expo configuration
├── package.json            # Node.js dependencies
└── tsconfig.json           # TypeScript configuration
```

### Key Architectural Decisions

1. **Monorepo with dual runtimes**: The frontend (Node.js/Expo) and backend (Python/FastAPI) coexist in the same repository. They run as separate processes — the Expo dev server for the frontend and a Python process for the backend API.

2. **SQLAlchemy over Drizzle**: The backend uses Python's SQLAlchemy ORM rather than a JavaScript ORM. This is because the backend is written entirely in Python. The database connection expects a `DATABASE_URL` environment variable pointing to PostgreSQL.

3. **Simplified location model**: Rather than implementing full geolocation with coordinates and distance calculations, proximity is stored as a simple boolean flag (`is_nearby`). This is a deliberate simplification for demo purposes.

4. **Tag-based matching**: User matching is designed around structured interest tags (JSON array) rather than free-text analysis. Free text is collected but explicitly excluded from matching logic.

## External Dependencies

### Database
- **PostgreSQL**: Connected via `DATABASE_URL` environment variable. Used by the FastAPI backend through SQLAlchemy. Tables are auto-created on startup via `Base.metadata.create_all()`.

### Python Packages (Backend)
- `fastapi` — Web framework for the REST API
- `pydantic` — Request/response validation (built into FastAPI)
- `sqlalchemy` — ORM for PostgreSQL database access
- `uvicorn` (implied) — ASGI server to run FastAPI

### Node.js Packages (Frontend)
- `expo` (SDK 54) — Core mobile development framework
- `expo-router` — File-based routing
- `react-native` (0.81) — Mobile UI framework
- `react-native-reanimated` — Animations
- `react-native-gesture-handler` — Gesture handling
- `react-native-webview` — WebView component
- `expo-haptics` — Haptic feedback (iOS)
- `expo-blur` — Blur effects (iOS tab bar)
- `expo-image` — Optimized image component
- `@react-navigation/bottom-tabs` — Tab navigation

### Services
- **EAS (Expo Application Services)**: Configured with project ID `d94dc233-d718-40d4-9273-37aca1be3542` for builds and deployment