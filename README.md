# Flashcard Study App

A full-stack flashcard learning platform. Users create decks, fill them with questions and answers, then study them in a flip-card interface that tracks what they know versus what they're still learning. Progress is persisted per user, so you can pick up exactly where you left off.

Built with **FastAPI + PostgreSQL + SQLAlchemy** on the backend and **React** on the frontend.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [System Architecture](#2-system-architecture)
3. [File Structure](#3-file-structure)
4. [Database Design](#4-database-design)
5. [Authentication](#5-authentication)
6. [API Endpoints](#6-api-endpoints)
7. [How to Run](#7-how-to-run)
8. [Frontend](#8-frontend)
9. [Common Errors and Fixes](#9-common-errors-and-fixes)
10. [Tech Decisions](#10-tech-decisions)
11. [Future Improvements](#11-future-improvements)

---

## 1. Project Overview

The core idea is simple:

- A **user** signs up and logs in
- They create **decks** — named collections of flashcards, with a colour and emoji
- Each deck contains **questions**, each with a difficulty level and one or more valid answers
- During a **study session**, cards flip to reveal answers and the user marks each one as *Got It* or *Still Learning*
- That choice is saved as **progress**, so the app knows exactly which cards each user has mastered

The target user is anyone revising for exams, learning a language, or building any kind of knowledge that benefits from spaced repetition. Think Anki or Quizlet, but built from scratch so you understand every line.

---

## 2. System Architecture

```
┌─────────────────────────────────┐
│         React Frontend          │
│         (port 5173)             │
│                                 │
│  - All UI rendering             │
│  - Sends HTTP requests          │
│  - Stores auth token in memory  │
└───────────────┬─────────────────┘
                │  HTTP + X-Auth-Token header
                ▼
┌─────────────────────────────────┐
│         FastAPI Backend         │
│         (port 8000)             │
│                                 │
│  - Receives requests            │
│  - Validates auth token         │
│  - Runs business logic          │
│  - Talks to database via ORM    │
└───────────────┬─────────────────┘
                │  SQLAlchemy ORM
                ▼
┌─────────────────────────────────┐
│         PostgreSQL              │
│         (port 5432)             │
│                                 │
│  - Stores all persistent data   │
│  - Enforces constraints         │
│  - Handles cascade deletes      │
└─────────────────────────────────┘
```

**Request lifecycle — what happens when you click "Load Decks":**

1. React calls `GET http://localhost:8000/decks` with the token in the header
2. FastAPI receives the request and calls `get_current_user()`
3. `get_current_user()` decodes the token, looks up the user in the database, and returns them
4. The `list_decks()` function queries the database for decks belonging to that user only
5. SQLAlchemy converts the database rows into Python objects
6. Pydantic converts those objects into JSON
7. FastAPI sends the JSON back through port 8000
8. React receives it and renders the deck grid

Every request follows this same pattern. The token is the thread that ties everything to the right user.

---

## 3. File Structure

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py          # FastAPI app, CORS, router registration
│   ├── database.py      # DB connection, SessionLocal, Base, get_db
│   ├── models.py        # SQLAlchemy ORM models (7 tables)
│   ├── schemas.py       # Pydantic schemas (Create / Update / Read)
│   ├── auth.py          # Token creation, decoding, get_current_user
│   └── routers/
│       ├── __init__.py
│       ├── users.py     # POST /users, POST /users/login, GET /users/me
│       ├── tags.py      # CRUD for tags
│       ├── decks.py     # CRUD for decks + tag sync
│       ├── questions.py # CRUD for questions (with inline answers)
│       ├── answers.py   # Add / edit / delete individual answers
│       └── progress.py  # Upsert + list progress entries
├── alembic/
│   ├── env.py           # Alembic config — reads DATABASE_URL from .env
│   ├── script.py.mako
│   └── versions/
│       ├── 0001_initial_schema.py   # Creates all 7 tables and enums
│       └── 0002_add_emoji_to_decks.py
├── alembic.ini
├── requirements.txt
└── .env.example
```

---

## 4. Database Design

Seven tables. Here's what each one holds, why it exists, and how it connects to everything else.

---

### `users`

The root of everything. Every other table traces back to a user.

| Column | Type | Notes |
|---|---|---|
| `id` | integer | Primary key, auto-increment |
| `name` | varchar(120) | Display name |
| `email` | varchar(254) | Unique — used to log in |
| `password_hash` | varchar(255) | bcrypt hash — plaintext password is never stored |
| `avatar_url` | varchar(500) | Optional profile picture URL |
| `created_at` | timestamptz | Set automatically by the database on insert |

**Relationships:**
- One user → many decks (`cascade="all, delete-orphan"` — deleting a user wipes all their decks)
- One user → many tags
- One user → many progress entries

---

### `decks`

A named collection of flashcards. Each deck belongs to exactly one user.

| Column | Type | Notes |
|---|---|---|
| `id` | integer | Primary key |
| `user_id` | integer | FK → users, `ondelete="CASCADE"` |
| `title` | varchar(200) | Required |
| `description` | text | Optional — shown on the deck card |
| `color` | varchar(20) | Hex colour string, default `#6366f1` |
| `emoji` | varchar(10) | Single emoji character, default `📚` |
| `created_at` | timestamptz | Auto-set |

**Relationships:**
- Many decks → one user
- One deck → many questions (cascade delete)
- Many decks ↔ many tags (via `deck_tags` junction table)

**Why `color` and `emoji` on the deck?** The frontend uses both throughout the UI — the colour tints the progress bar, card border, and study mode background. The emoji appears in the deck card, breadcrumbs, and study header. Storing them on the deck means one source of truth.

---

### `tags`

Labels a user can attach to decks. Tags are per-user, not global — two users can both have a tag called "Science" with no conflict.

| Column | Type | Notes |
|---|---|---|
| `id` | integer | Primary key |
| `name` | varchar(80) | The label text |
| `user_id` | integer | FK → users, `ondelete="CASCADE"` |

**Relationships:**
- Many tags → one user
- Many tags ↔ many decks (via `deck_tags`)

---

### `deck_tags`

This is a **junction table** — it exists only to connect decks and tags in a many-to-many relationship. A deck can have multiple tags. A tag can apply to multiple decks.

| Column | Type | Notes |
|---|---|---|
| `deck_id` | integer | FK → decks, `ondelete="CASCADE"`, part of composite PK |
| `tag_id` | integer | FK → tags, `ondelete="CASCADE"`, part of composite PK |

There's also a `UniqueConstraint("deck_id", "tag_id")` to prevent duplicate associations.

**How tag updates work:** When a deck's tags are changed, the backend uses a delete-and-replace strategy. It deletes all existing `deck_tags` rows for that deck, then inserts the new set. This is simpler and more reliable than trying to diff what changed.

---

### `questions`

A single flashcard — the "front" of the card. Belongs to one deck.

| Column | Type | Notes |
|---|---|---|
| `id` | integer | Primary key |
| `deck_id` | integer | FK → decks, `ondelete="CASCADE"` |
| `question_text` | text | The actual question |
| `difficulty` | enum | `easy`, `medium`, or `hard` — enforced at DB level |
| `topic` | varchar(120) | Optional sub-topic within the deck (e.g. "Organelles") |
| `created_at` | timestamptz | Auto-set |

**Relationships:**
- Many questions → one deck
- One question → many answers (cascade delete)
- One question → many progress entries (one per user, cascade delete)

**Why an enum for difficulty?** PostgreSQL enums are enforced at the database level, not just the application level. Even if someone bypasses the API and inserts directly into the database, they can't put an invalid value in. The Pydantic schema validates it too, so there's a double guard.

---

### `answers`

The "back" of the card. One question can have multiple valid answers — for example, "What is ½ as a decimal?" might accept `0.5`, `0.50`, and `half` as equally correct. None is marked as "more correct" than the others.

| Column | Type | Notes |
|---|---|---|
| `id` | integer | Primary key |
| `question_id` | integer | FK → questions, `ondelete="CASCADE"` |
| `answer_text` | text | The answer text |
| `created_at` | timestamptz | Auto-set |

**Business rule:** A question must always have at least one answer. The `delete_answer` endpoint checks the remaining count before deleting and returns a `400` if you'd be deleting the last one.

---

### `card_progress`

Tracks what each user knows. This is how the app remembers your progress across sessions.

| Column | Type | Notes |
|---|---|---|
| `id` | integer | Primary key |
| `user_id` | integer | FK → users, `ondelete="CASCADE"` |
| `question_id` | integer | FK → questions, `ondelete="CASCADE"` |
| `status` | enum | `unseen`, `learning`, or `known` |
| `last_reviewed_at` | timestamptz | Updated every time the user marks this card |

There's a `UniqueConstraint("user_id", "question_id")` — one progress row per user per question, enforced at the database level.

**How upsert works:** The `PUT /progress/{question_id}` endpoint checks if a row already exists for this user + question combination. If it does, it updates the status and timestamp. If it doesn't, it creates a new row. This way you never get duplicates, and the API is idempotent — you can call it many times and the result is always correct.

---

### Relationships at a glance

```
User
├── Deck (1-to-many)
│   ├── Question (1-to-many)
│   │   ├── Answer (1-to-many)
│   │   └── CardProgress (1-to-many, also linked to User)
│   └── DeckTag ←→ Tag (many-to-many via junction)
├── Tag (1-to-many)
└── CardProgress (1-to-many)
```

**Cascade delete chain:** Deleting a user triggers a cascade that wipes their decks → which wipes their questions → which wipes their answers and progress entries. Nothing orphaned, no manual cleanup needed.

---

## 5. Authentication

This app uses a simple custom token system — no JWT library required.

**How it works:**

1. User sends `POST /users/login` with email and password
2. Server verifies the password against the bcrypt hash using `passlib`
3. If correct, server generates a token: `base64("user_id:<id>")`
4. Token is returned to the frontend along with the user object
5. Frontend stores the token in a module-level JavaScript variable (`_token`)
6. Every subsequent request includes the header: `X-Auth-Token: <token>`
7. `get_current_user()` in `auth.py` reads the header, decodes the token, and fetches the user from the database
8. If the token is missing, malformed, or the user doesn't exist → `401 Unauthorized`

**Why not JWT?** JWTs are great for distributed systems where you don't want to hit the database on every request. For this app — one server, one database — the simpler approach is fine. The token here is just an opaque handle that the server resolves to a user ID. Swapping to JWT later is straightforward.

**Password storage:** Passwords are hashed with bcrypt via `passlib` before being stored. The plaintext password is never written to the database. On login, `pwd_context.verify(plaintext, hash)` compares them.

---

## 6. API Endpoints

All endpoints except `POST /users` and `POST /users/login` require the `X-Auth-Token` header.

---

### Auth / Users

#### `POST /users`
Create a new account.

**Request body:**
```json
{
  "name": "Alex Rivera",
  "email": "alex@example.com",
  "password": "mypassword"
}
```

**Response:** `201` — user object (no password hash)

```json
{
  "id": 1,
  "name": "Alex Rivera",
  "email": "alex@example.com",
  "avatar_url": null,
  "created_at": "2025-01-01T00:00:00Z"
}
```

**Errors:** `409` if email already registered

---

#### `POST /users/login`
Authenticate and receive a token.

**Request body:**
```json
{
  "email": "alex@example.com",
  "password": "mypassword"
}
```

**Response:** `200`
```json
{
  "token": "dXNlcl9pZDox",
  "user": { "id": 1, "name": "Alex Rivera", ... }
}
```

**Errors:** `401` if credentials are wrong

---

#### `GET /users/me`
Get the currently logged-in user's profile. Auth required.

**Response:** user object

---

#### `PATCH /users/me`
Update name, email, or avatar. Auth required.

**Request body:** any combination of:
```json
{ "name": "New Name", "email": "new@email.com", "avatar_url": "https://..." }
```

---

#### `DELETE /users/me`
Delete the logged-in user and all their data. Auth required. This triggers the full cascade — all decks, questions, answers, tags, and progress entries are wiped.

---

### Tags

All tag endpoints require auth. Tags are always scoped to the logged-in user.

#### `GET /tags`
Returns all tags belonging to the current user.

#### `POST /tags`
```json
{ "name": "Science" }
```

#### `PATCH /tags/{tag_id}`
```json
{ "name": "Renamed Tag" }
```

#### `DELETE /tags/{tag_id}`
Deletes the tag. All `deck_tags` associations are removed automatically via cascade.

---

### Decks

All deck endpoints require auth. You can only see and modify your own decks.

#### `GET /decks`
Returns all decks for the current user. Supports optional tag filter:
```
GET /decks?tag=Science
```

**Response:** array of deck objects, each including nested `tags` array and `card_count`

#### `POST /decks`
```json
{
  "title": "Cell Biology",
  "description": "Fundamentals of cell structure",
  "color": "#6366f1",
  "emoji": "🧬",
  "tag_ids": [1, 3]
}
```

`description`, `color`, `emoji`, and `tag_ids` are optional. Defaults: color `#6366f1`, emoji `📚`.

#### `GET /decks/{deck_id}`
Returns one deck with nested tags and question count.

#### `PATCH /decks/{deck_id}`
All fields optional. `tag_ids` triggers a full replace of the deck's tags.
```json
{
  "title": "Updated Title",
  "color": "#10b981",
  "tag_ids": [2]
}
```

#### `DELETE /decks/{deck_id}`
Deletes the deck and all its questions, answers, and progress entries.

---

### Questions

#### `POST /decks/{deck_id}/questions`
Creates a question along with its answers in a single request.

```json
{
  "question_text": "What is the powerhouse of the cell?",
  "difficulty": "easy",
  "topic": "Organelles",
  "answers": ["Mitochondria", "Mitochondrion"]
}
```

`topic` is optional. `answers` must contain at least one string.

**Response:** question object with nested answers array

#### `GET /decks/{deck_id}/questions`
Returns all questions in a deck, each with their `answers` array, ordered by `created_at`.

#### `PATCH /questions/{question_id}`
Update question text, difficulty, or topic. All fields optional.

#### `DELETE /questions/{question_id}`
Deletes the question, all its answers, and all progress entries for that question.

---

### Answers

#### `POST /questions/{question_id}/answers`
Add another valid answer to an existing question.
```json
{ "answer_text": "The mitochondria" }
```

#### `PATCH /answers/{answer_id}`
Edit an answer's text.

#### `DELETE /answers/{answer_id}`
Remove one answer. Returns `400` if it's the last answer on the question.

---

### Progress

#### `PUT /progress/{question_id}`
Mark a card as known, learning, or unseen. Creates the progress row if it doesn't exist, updates it if it does. Always stamps `last_reviewed_at` with the current UTC time.

```json
{ "status": "known" }
```

Valid statuses: `unseen`, `learning`, `known`

**Response:** progress entry object

#### `GET /progress`
Returns all progress entries for the current user. Used by the frontend to calculate the study streak and weekly progress chart.

#### `GET /progress/{question_id}`
Returns progress for a single question. Returns `404` if the user hasn't reviewed this card yet.

---

## 7. How to Run

### Prerequisites

- Python 3.11+
- PostgreSQL running (locally or a cloud service like [Neon](https://neon.tech))
- Node.js 18+ (for the frontend)

---

### Backend Setup

**1. Clone and navigate to the backend folder**

```bash
cd backend
```

**2. Install dependencies**

```bash
pip install -r requirements.txt
```

**3. Create your environment file**

```bash
cp .env.example .env
```

Open `.env` and set your database connection string:

```env
DATABASE_URL=postgresql://your_user:your_password@localhost:5432/flashcards
```

If you're using Neon or another cloud provider, paste the connection string they give you directly.

**4. Run the database migrations**

This creates all the tables:

```bash
alembic upgrade head
```

**5. Start the server**

```bash
uvicorn app.main:app --reload
```

The API is now running at `http://localhost:8000`.
Interactive docs are available at `http://localhost:8000/docs`.

---

### Frontend Setup

**1. Navigate to the frontend folder and install dependencies**

```bash
cd flashcard-frontend
npm install
```

**2. Replace `src/App.jsx` with the provided `FlashCardApp.jsx`**

**3. Start the dev server**

```bash
npm run dev
```

The app is now running at `http://localhost:5173`.

---

### Creating a Test Account

With the server running, either use the signup form in the browser, or create one via curl:

```bash
curl -X POST http://localhost:8000/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"password123"}'
```

Then log in:

```bash
curl -X POST http://localhost:8000/users/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

Copy the `token` from the response. Use it on all other requests:

```bash
curl http://localhost:8000/decks \
  -H "X-Auth-Token: YOUR_TOKEN_HERE"
```

---

### Environment Variables

| Variable | Description | Example |
|---|---|---|
| `DATABASE_URL` | Full PostgreSQL connection string | `postgresql://user:pass@localhost:5432/flashcards` |

That's the only environment variable this app needs. No secrets file, no API keys.

---

## 8. Frontend

The frontend is a single React JSX file (`App.jsx`). No routing library. Navigation works by swapping a `view` state variable between `"home"`, `"deckDetail"`, and `"study"`.

### Views

**Home** — Deck grid, stats row, weekly progress chart, tag filter bar, streak indicator, create deck modal, sign out button.

**Deck Detail** — Question list with difficulty badges, inline edit, add question form with multi-answer support, study button.

**Study Mode** — Full-screen flashcard with 3D CSS flip animation, difficulty filter, progress bar, Got It / Still Learning buttons, session complete summary.

### Auth Flow

The frontend stores the auth token in a module-level JS variable (`_token`). Every API call in the `apiFetch` helper automatically includes it in the `X-Auth-Token` header. On sign out, `_token` is set to `null`. Since the token lives in memory (not localStorage), it's cleared automatically when the page refreshes — the user has to log in again, which is the expected behaviour for a simple app like this.

### Connecting to the Backend

The API base URL is defined at the top of `App.jsx`:

```javascript
const BASE = "http://localhost:8000";
```

Change this to your deployed URL when you push to production.

---

## 9. Common Errors and Fixes

**`relation "users" does not exist`**
You haven't run the migrations yet. Run:
```bash
alembic upgrade head
```

---

**`column "emoji" of relation "decks" does not exist`**
You're running the old schema. The emoji column was added in migration `0002`. Run:
```bash
alembic upgrade head
```

---

**`401 Unauthorized` on every request after logging in**
The frontend isn't sending the token. Check that `_token` is being set in the `login` function and that `apiFetch` is including the `X-Auth-Token` header.

---

**`409 Conflict — Email already registered`**
Someone already signed up with that email. Use a different one, or log in instead of signing up.

---

**CORS error in the browser console**
The backend allows `http://localhost:5173` and `http://localhost:3000`. If your frontend is running on a different port (check `npm run dev` output), add it to the `allow_origins` list in `app/main.py`:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://localhost:YOUR_PORT"],
    ...
)
```

---

**`422 Unprocessable Entity`**
The request body failed Pydantic validation. The response body will tell you exactly which field is wrong and why. Common causes:
- Sending `"difficulty": "HARD"` instead of `"difficulty": "hard"` (must be lowercase)
- Sending `"answers": []` (at least one answer required)
- Missing a required field like `title` on a deck

---

**`400 — Cannot delete the last answer`**
You tried to delete the only answer on a question. Add another answer first, then delete the one you don't want.

---

**`psql: error: connection refused on socket "/tmp/.s.PGSQL.5432"`**
PostgreSQL isn't running. Start it:
```bash
brew services start postgresql@16   # macOS with Homebrew
```
Or use a cloud database like Neon instead.

---

**Password verification failing after restarting the server**
This won't happen — bcrypt hashes are deterministic and stored in the database. Restarting the server doesn't affect them.

---

## 10. Tech Decisions

**Why FastAPI over Flask?**
FastAPI generates interactive API docs automatically, validates request and response bodies via Pydantic with no extra code, and has first-class support for Python type hints. Flask is great but you have to wire all of that up yourself. For a data-heavy API like this one, FastAPI saves a lot of boilerplate.

**Why PostgreSQL over SQLite?**
SQLite is fine for local development but doesn't support proper concurrent writes, lacks some constraint types, and has limited enum support. PostgreSQL enforces enums at the database level (not just the application level), handles concurrent users correctly, and is what you'd use in production anyway. Starting with it means no migration pain later.

**Why SQLAlchemy over raw SQL?**
Three reasons. First, cascade deletes — declaring `cascade="all, delete-orphan"` on a relationship means you never have to manually clean up child records. Second, relationships — loading a deck with its tags and questions in one query is a single line with `selectinload`. Third, type safety — the SQLAlchemy 2.0 `Mapped[T]` syntax means your IDE knows what every column contains and catches type errors before you run the code.

**Why a custom token over JWT?**
JWTs are useful when you want stateless verification — useful if you have multiple servers or you don't want to hit the database on every request. This app has one server and a database right there, so validating the token means one `db.get(User, user_id)` call per request. That's fast and simple. The custom token is also easier to understand and debug — it decodes to a human-readable string.

**Why Pydantic schemas separate from SQLAlchemy models?**
The database model and the API contract are different things and should be defined separately. The `User` model has a `password_hash` column. The `UserRead` schema doesn't — you should never send a password hash to a browser. The `DeckRead` schema has a `card_count` field computed from the questions relationship — that's not a column, it's calculated. Keeping models and schemas separate means each layer owns its own shape.

---

## 11. Future Improvements

**Real JWT auth**
Swap the base64 token for a proper JWT with an expiry time. The `python-jose` library makes this straightforward. The main change is in `auth.py` — everything else stays the same.

**Spaced repetition algorithm**
Currently the study session is random shuffle. A proper spaced repetition system (like SM-2, which Anki uses) would schedule cards based on how well you know them — showing "still learning" cards more frequently and spacing out "known" cards over days.

**Quizlet import**
Parse pasted tab-separated text from Quizlet's export feature. The format is consistent — one card per line, term and definition separated by a tab. A simple parser can turn that into a bulk `POST /decks/{id}/questions` call.

**Alembic autogenerate**
Currently migrations are written by hand. Running `alembic revision --autogenerate -m "description"` would detect model changes automatically and generate the migration file. Requires keeping `env.py` connected to your models, which it already is.

**Rate limiting**
Add `slowapi` to limit how many requests a single IP can make per minute. Protects the login endpoint from brute force.

**Email verification**
After signup, send a verification email before activating the account. Requires an SMTP provider (Resend or Postmark are easy to set up).

**Deck sharing**
Allow users to share a deck via a public link. The recipient can import a copy into their own account. Would require a `shared_decks` table and a separate read-only endpoint that doesn't require auth.

**Offline support**
Cache the current deck in the browser using a service worker so you can study without a connection. Progress syncs when you reconnect.
