from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import app.models

from app.routers import answers, decks, progress, questions, tags, users

app = FastAPI(
    title="Flashcard Study App",
    description="REST API for managing flashcard decks, questions, and study progress.",
    version="1.0.0",
)

# ---------------------------------------------------------------------------
# CORS — allow local frontend dev servers
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
app.include_router(users.router)
app.include_router(tags.router)
app.include_router(decks.router)
app.include_router(questions.router)
app.include_router(answers.router)
app.include_router(progress.router)


@app.get("/", tags=["health"])
def health_check():
    return {"status": "ok", "message": "Flashcard API is running"}