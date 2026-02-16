# replit.md

## Overview

This is a **Talkalot Fair** project — a web application with a **FastAPI (Python)** backend serving a frontend directly. The app is a fair/event-based social platform where users can join a fair, write posts with tags, and see other attendees' posts. The frontend is served as static HTML/CSS/JS from the FastAPI backend on port 5000.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend (HTML/CSS/JS)

- **Served from**: FastAPI static file mount at `/static/`
- **Entry point**: `static/index.html` served at `/`
- **Screens**:
  1. Welcome screen — "Get Started" button to register
  2. Fair screen — "Join Fair" one-click button
  3. Main screen — Two tabs: Feed (view all posts) and New Post (write & tag posts)
- **State**: User ID stored in localStorage for session persistence
- **Features**:
  - One-click Join Fair
  - Post creation with text content and tags
  - Tag suggestions and custom tag input
  - Feed showing all posts from fair attendees (only visible if inside_fair == true)

### Backend (FastAPI / Python)

- **Framework**: FastAPI (in `main.py`)
- **ORM**: SQLAlchemy with a declarative base pattern
- **Database**: PostgreSQL, connected via the `DATABASE_URL` environment variable (Replit-provided PostgreSQL)
- **Data Models**:
  - `User` table: id, last_seen, is_nearby, interest_tags, free_text_interests, inside_fair (Boolean)
  - `Post` table: id, user_id, content, tags (JSON), created_at
- **API Endpoints** (all prefixed with `/api/`):
  - `POST /api/register` — Create anonymous user, returns userID
  - `POST /api/join-fair` — One-click join fair (sets inside_fair=true)
  - `GET /api/user-status` — Check if user is inside fair
  - `POST /api/posts` — Create a post (requires inside_fair=true)
  - `GET /api/posts` — Get all posts (returns empty if not inside fair)
  - `POST /api/interests` — Update interest tags
  - `POST /api/heartbeat` — Update presence/proximity
  - `GET /api/matches` — Get nearby user matches

### Project Structure

```
├── static/                 # Frontend files served by FastAPI
│   ├── index.html          # Main HTML page
│   ├── styles.css          # Styling
│   └── app.js              # Frontend JavaScript logic
├── app/                    # Expo Router pages (legacy, not actively used)
├── components/             # React Native components (legacy)
├── main.py                 # FastAPI backend server
├── app.json                # Expo configuration (legacy)
├── package.json            # Node.js dependencies (for Expo)
└── tsconfig.json           # TypeScript configuration (for Expo)
```

### Key Architectural Decisions

1. **Web frontend served from FastAPI**: The frontend is plain HTML/CSS/JS served directly by the FastAPI backend, making deployment simple (single process on port 5000).

2. **Access control via inside_fair flag**: Posts are only visible to users who have joined the fair. The join is a one-click action with no additional requirements.

3. **Anonymous users**: No PII is collected. Users get a UUID on registration, stored in localStorage.

4. **Tag-based posts**: Posts support multiple tags, with suggested tags and custom tag input via Enter key.

## External Dependencies

### Database
- **PostgreSQL**: Connected via `DATABASE_URL` environment variable. Tables: `users` and `posts`.

### Python Packages (Backend)
- `fastapi` — Web framework for the REST API
- `pydantic` — Request/response validation
- `sqlalchemy` — ORM for PostgreSQL
- `uvicorn` — ASGI server

## Recent Changes
- Added `Post` model and `posts` table for user-created content with tags
- Added `inside_fair` Boolean column to `users` table
- Created `/api/join-fair`, `/api/posts`, `/api/user-status` endpoints
- Built web frontend with welcome, join fair, feed, and compose screens
- All API routes prefixed with `/api/` to avoid conflicts with static file serving
