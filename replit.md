# replit.md

## Overview

**Talkalot** is a regional interest-matching web application. Users post about their interests, browse and "like" other people's interest posts, and when two users mutually like each other's posts, a match is created. When matched users are both at the same event location, they receive a proximity notification encouraging in-person conversation. The app is NOT a messaging platform — its sole purpose is to facilitate offline conversations at the moment of physical proximity.

## Two-Phase System

1. **Asynchronous regional interest matching** — Users browse and like interest posts at any time. Mutual likes create matches.
2. **Real-time proximity-triggered notification** — When matched users are both present at an event (inside_fair=true), both receive a notification.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend (HTML/CSS/JS)

- **Served from**: FastAPI static file mount at `/static/`
- **Entry point**: `static/index.html` served at `/`
- **Screens**:
  1. Welcome screen — "Get Started" button to register
  2. Notification preference screen — Choose browser notifications or on-screen only
  3. Event join screen — Use location or manual "I'm Here" button, or skip
  4. Main screen — Four tabs: Feed, New Post, Alerts, Matches
- **State**: User ID and notification preference stored in localStorage
- **Features**:
  - Browser notification support (optional, prompted during registration)
  - Event presence toggle (join/leave event banner)
  - Interest post creation with text content and tags
  - Tag suggestions and custom tag input via Enter key
  - Like button on other users' posts (heart icon)
  - Notifications tab with like, match, and proximity alerts
  - Matches tab showing mutual matches and proximity status
  - Polling every 15s for new notifications and proximity checks
  - Toast notifications for matches

### Backend (FastAPI / Python)

- **Framework**: FastAPI (in `main.py`)
- **ORM**: SQLAlchemy with declarative base
- **Database**: PostgreSQL via `DATABASE_URL` environment variable
- **Data Models**:
  - `User`: id, last_seen, is_nearby, interest_tags, free_text_interests, inside_fair (Boolean)
  - `Post`: id, user_id, content, tags (JSON), created_at
  - `Like`: id, user_id, post_id, post_owner_id, created_at (unique per user+post)
  - `Match`: id, user_a_id, user_b_id, created_at, proximity_notified (normalized pair)
  - `Notification`: id, user_id, notif_type, message, related_user_id, related_post_id, seen, created_at
- **API Endpoints** (all prefixed with `/api/`):
  - `POST /api/register` — Create anonymous user
  - `POST /api/join-fair` — Mark user as at event + trigger proximity checks
  - `POST /api/leave-fair` — Mark user as away from event
  - `GET /api/user-status` — Check event status, unread notifications, run proximity checks
  - `POST /api/posts` — Create an interest post
  - `GET /api/posts` — Get all posts with like counts and liked_by_me flag
  - `POST /api/posts/{id}/like` — Like a post, detect mutual matches, trigger notifications
  - `POST /api/posts/{id}/unlike` — Unlike a post
  - `GET /api/notifications` — Get user's notifications
  - `POST /api/notifications/mark-seen` — Mark all notifications as read
  - `GET /api/matches` — Get user's mutual matches with proximity status

### Matching Logic

1. User A likes User B's post
2. System checks: has User B liked any of User A's posts?
3. If yes → mutual Match created (normalized pair to avoid duplicates)
4. Both users get a "match" notification
5. If both users are at the event (inside_fair=true), both get a "proximity" notification
6. Proximity is also checked on join-fair and during polling (user-status endpoint)

### Project Structure

```
├── static/                 # Frontend files served by FastAPI
│   ├── index.html          # Main HTML page (4 tabs)
│   ├── styles.css          # Styling
│   └── app.js              # Frontend JavaScript logic
├── main.py                 # FastAPI backend server with all models and endpoints
├── app/                    # Expo Router pages (legacy, not actively used)
├── components/             # React Native components (legacy)
├── app.json                # Expo configuration (legacy)
└── package.json            # Node.js dependencies (legacy Expo)
```

### Key Architectural Decisions

1. **Web frontend served from FastAPI**: Single process on port 5000, simple deployment.
2. **Two-phase matching**: Async likes create matches; proximity triggers notifications when both at event.
3. **Normalized match pairs**: Match(user_a_id, user_b_id) always stores IDs in sorted order to prevent duplicates.
4. **Anonymous users**: No PII collected. UUID-based identity stored in localStorage.
5. **Proximity polling**: Frontend polls /api/user-status every 15s; endpoint runs proximity checks server-side.
6. **No messaging**: App only facilitates real-world conversation discovery, not digital chat.

## External Dependencies

### Database
- **PostgreSQL**: Tables: users, posts, likes, matches, notifications

### Python Packages
- `fastapi` — Web framework
- `pydantic` — Request/response validation
- `sqlalchemy` — ORM for PostgreSQL
- `uvicorn` — ASGI server

## Recent Changes
- Added confirmation flow for proximity matches: users can confirm they want to talk
- When both users confirm, a shared codeword is generated and displayed on a full-screen blue page
- Proximity notifications now show the other user's interest tags and the liked post content
- Match model extended with user_a_confirmed, user_b_confirmed, and codeword fields
- Notification model extended with related_match_id and extra_data (JSON) fields
- New API endpoints: POST /api/matches/{id}/confirm, GET /api/matches/{id}/status
- Matches tab shows confirm button (when both at event) and codeword link (when both confirmed)
- Codeword polling (5s) when waiting for other user to confirm
- Added Like, Match, and Notification models and database tables
- Implemented mutual match detection on post likes
- Added proximity notification system (triggers on join-fair, user-status polling, and after match)
- Built 4-tab frontend: Feed (with like buttons), New Post, Alerts, Matches
- Event banner with join/leave toggle
- Notification badge with unread count and 15s polling
- Posts no longer gated by inside_fair (browsable from anywhere, per prototype spec)
