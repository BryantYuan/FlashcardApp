# Flashcard Study App

A full-stack flashcard learning platform. Users create decks, fill them with questions and answers, then study them in a flip-card interface that tracks what they know versus what they're still learning. Progress is persisted per user, so you can pick up exactly where you left off.

Built with **FastAPI + PostgreSQL + SQLAlchemy** on the backend and **React** on the frontend.



---

## 1. Project Overview

The application's idea is relatively simple:

- A **user** signs up and logs in (Unfortunately, you have to log in every time you reload the page)
- They create **decks** — named collections of flashcards, with a colour and emoji
- Each deck contains **questions**, each with a difficulty level and one or more valid answers
- During a **study session**, cards flip to reveal answers, and the user marks each one as *Got It* or *Still Learning*
- That choice is saved as **progress**, so the app knows exactly which cards each user has mastered

The target user is anyone revising for exams, learning a language, or building any kind of knowledge that benefits from spaced repetition of flashcards.

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
|                                 |
│                                 │
│  - Stores all data              │
│  - Enforces constraints         │
│  - Handles cascade deletes      │
└─────────────────────────────────┘
```

**Request lifecycle — what happens when you click "Load Decks":**

1. React calls `GET http://localhost:8000/decks`
2. FastAPI receives the request and calls `get_current_user()`
3. `get_current_user()` looks up the user in the database, and returns them
4. The `list_decks()` function queries the database for decks belonging to that user only
5. SQLAlchemy converts the database rows into Python objects
6. Pydantic converts those objects into JSON
7. FastAPI sends the JSON back through port 8000
8. React receives it and renders the deck grid

## 3. Database Design

The tables in the database are listed below, each with thier own purposes:

---

### `users`

So this table is how all the users are stored.

 `id` -> integer -> Primary key, auto-increment \
 `name` -> varchar(120) -> Display name \
 `email` -> varchar(254) -> Unique — used to log in \
 `password_hash` -> varchar(255) -> hashed — plaintext password is never stored \
 `created_at` -> timestamptz -> Set automatically by the database on insert

**Relationships:**
- One user -> many decks (`cascade="all, delete-orphan"` — deleting a user wipes all their decks)
- One user -> many tags
- One user -> many progress entries

**Errors**

You can never have a duplicate email. If there is a duplicate email it will return a 409 status code.

---

### `decks`

A named collection of flashcards. Each deck belongs to exactly one user. 

 `id` -> integer -> Primary key \
 `user_id` -> integer -> Foriegn key -> users, `ondelete="CASCADE"` \
 `title` -> varchar(200) -> Required \
 `description` -> text -> Optional — shown on the deck card \
 `color` -> varchar(20) -> Hex colour string \
 `emoji` -> varchar(10) -> Single emoji character, default `📚`\
 `created_at` -> timestamptz -> Auto-set

**Relationships:**
- Many decks → one user
- One deck → many questions (cascade delete)
- Many decks ↔ many tags (via `deck_tags` table)

**Note**

Emojis and colour are in the database purely so it can be displayed better in frontend

---

### `tags`

Labels a user can attach to decks. Tags are per-user, not global — two users can both have a tag called "Science" with no conflict. A future optimisation program will ensure that there is a reduced chance of duplicate tags. E.g "Science" and "ScIeNcE" will be treated as the same and will not be allowed. 

 `id` -> integer -> Primary key \
 `name` -> varchar(80)  The label text \
 `user_id` -> integer  Forien Key → users, `ondelete="CASCADE"`

**Relationships:**
- Many tags → one user
- Many tags ↔ many decks (via `deck_tags`)

---

### `deck_tags`

This is a table that connects the many to many relationship between decks and tags. A deck can have multiple tags. A tag can apply to multiple decks.

`deck_id` -> integer -> FK -> decks, `ondelete="CASCADE"` \
`tag_id` -> integer -> FK -> tags, `ondelete="CASCADE"`


**How tag updates work:** When a deck's tags are changed, the backend uses a delete-and-replace strategy. It deletes all existing `deck_tags` rows for that deck, then inserts the new set. This is simpler and more reliable than trying to diff what changed.

---

### `questions`

A single flashcard — the "front" of the card. Belongs to one deck. The answers are in another table

 `id` -> integer -> Primary key \
 `deck_id` -> integer -> FK → decks, `ondelete="CASCADE"` \
 `question_text` -> text -> The actual question \
 `difficulty` -> text -> `easy`, `medium`, or `hard` \
 `topic` -> varchar(120) -> Optional sub-topic within the deck (e.g. "Organelles") \
 `created_at` -> timestamptz -> Auto-set

**Relationships:**
- Many questions → one deck
- One question → many answers (cascade delete)
- One question → many progress entries (one per user, cascade delete)

**Note**

For difficulty, in the frontend ui it will be enforced that you can only choose three options, there are no custom difficulties.


---

### `answers`

The "back" of the card. One question can have multiple valid answers — for example, "What is ½ as a decimal?" might accept `0.5`, `0.50`, and `half` as equally correct. None is marked as "more correct" than the others.

 `id` -> integer -> Primary key \
 `question_id` -> integer -> FK -> questions, `ondelete="CASCADE"` \
 `answer_text` -> text -> The answer text \
 `created_at` -> timestamptz -> Auto-set

**Note:** A question must always have at least one answer. The `delete_answer` endpoint checks the remaining count before deleting and returns a `400` if you'd be deleting the last one.



