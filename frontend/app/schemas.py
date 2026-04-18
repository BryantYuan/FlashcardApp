from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, EmailStr, field_validator


# ---------------------------------------------------------------------------
# Enums (reuse as string literals — validated by field_validator)
# ---------------------------------------------------------------------------

VALID_DIFFICULTIES = {"easy", "medium", "hard"}
VALID_STATUSES = {"unseen", "learning", "known"}


# ---------------------------------------------------------------------------
# Tag schemas
# ---------------------------------------------------------------------------

class TagCreate(BaseModel):
    name: str


class TagUpdate(BaseModel):
    name: Optional[str] = None


class TagRead(BaseModel):
    id: int
    name: str
    user_id: int

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Answer schemas
# ---------------------------------------------------------------------------

class AnswerCreate(BaseModel):
    answer_text: str


class AnswerUpdate(BaseModel):
    answer_text: Optional[str] = None


class AnswerRead(BaseModel):
    id: int
    question_id: int
    answer_text: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Question schemas
# ---------------------------------------------------------------------------

class QuestionCreate(BaseModel):
    question_text: str
    difficulty: str
    topic: Optional[str] = None
    answers: List[str]  # inline answer texts on creation

    @field_validator("difficulty")
    @classmethod
    def validate_difficulty(cls, v: str) -> str:
        if v not in VALID_DIFFICULTIES:
            raise ValueError(f"difficulty must be one of {VALID_DIFFICULTIES}")
        return v

    @field_validator("answers")
    @classmethod
    def validate_answers(cls, v: List[str]) -> List[str]:
        if not v:
            raise ValueError("at least one answer is required")
        return v


class QuestionUpdate(BaseModel):
    question_text: Optional[str] = None
    difficulty: Optional[str] = None
    topic: Optional[str] = None

    @field_validator("difficulty")
    @classmethod
    def validate_difficulty(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_DIFFICULTIES:
            raise ValueError(f"difficulty must be one of {VALID_DIFFICULTIES}")
        return v


class QuestionRead(BaseModel):
    id: int
    deck_id: int
    question_text: str
    difficulty: str
    topic: Optional[str]
    created_at: datetime
    answers: List[AnswerRead] = []

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Deck schemas
# ---------------------------------------------------------------------------

class DeckCreate(BaseModel):
    title: str
    description: Optional[str] = None
    color: str = "#6366f1"
    tag_ids: List[int] = []
    emoji: Optional[str] = None


class DeckUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    tag_ids: Optional[List[int]] = None


class DeckRead(BaseModel):
    id: int
    user_id: int
    title: str
    description: Optional[str]
    color: str
    emoji: str   # ← add this
    created_at: datetime
    tags: List[TagRead] = []
    card_count: int = 0


# ---------------------------------------------------------------------------
# User schemas
# ---------------------------------------------------------------------------

class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    avatar_url: Optional[str] = None


class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    avatar_url: Optional[str] = None


class UserRead(BaseModel):
    id: int
    name: str
    email: str
    avatar_url: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Card Progress schemas
# ---------------------------------------------------------------------------

class ProgressUpsert(BaseModel):
    status: str

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        if v not in VALID_STATUSES:
            raise ValueError(f"status must be one of {VALID_STATUSES}")
        return v


class ProgressRead(BaseModel):
    id: int
    user_id: int
    question_id: int
    status: str
    last_reviewed_at: Optional[datetime]

    model_config = {"from_attributes": True}