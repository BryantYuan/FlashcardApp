from __future__ import annotations

import enum
from datetime import datetime
from typing import List, Optional

from sqlalchemy import (
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


# ---------------------------------------------------------------------------
# ENUMS
# ---------------------------------------------------------------------------

class DifficultyLevel(str, enum.Enum):
    easy = "easy"
    medium = "medium"
    hard = "hard"


class CardStatus(str, enum.Enum):
    unseen = "unseen"
    learning = "learning"
    known = "known"


# ---------------------------------------------------------------------------
# ASSOCIATION TABLE
# ---------------------------------------------------------------------------

class DeckTag(Base):
    __tablename__ = "deck_tags"
    __table_args__ = (
        UniqueConstraint("deck_id", "tag_id", name="uq_deck_tag"),
    )

    deck_id: Mapped[int] = mapped_column(
        ForeignKey("decks.id", ondelete="CASCADE"),
        primary_key=True
    )
    tag_id: Mapped[int] = mapped_column(
        ForeignKey("tags.id", ondelete="CASCADE"),
        primary_key=True
    )


# ---------------------------------------------------------------------------
# USER
# ---------------------------------------------------------------------------

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(254), nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    avatar_url: Mapped[Optional[str]] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now()
    )

    decks: Mapped[List["Deck"]] = relationship(
        "Deck",
        back_populates="user",
        cascade="all, delete-orphan"
    )

    tags: Mapped[List["Tag"]] = relationship(
        "Tag",
        back_populates="user",
        cascade="all, delete-orphan"
    )

    progress_entries: Mapped[List["CardProgress"]] = relationship(
        "CardProgress",
        back_populates="user",
        cascade="all, delete-orphan"
    )


# ---------------------------------------------------------------------------
# TAG
# ---------------------------------------------------------------------------

class Tag(Base):
    __tablename__ = "tags"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False
    )

    user: Mapped["User"] = relationship(
        "User",
        back_populates="tags"
    )

    decks: Mapped[List["Deck"]] = relationship(
        "Deck",
        secondary="deck_tags",
        back_populates="tags"
    )


# ---------------------------------------------------------------------------
# DECK
# ---------------------------------------------------------------------------

class Deck(Base):
    __tablename__ = "decks"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False
    )

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    color: Mapped[str] = mapped_column(String(20), default="#6366f1")
    emoji: Mapped[str] = mapped_column(String(10), default="📚")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now()
    )

    user: Mapped["User"] = relationship(
        "User",
        back_populates="decks"
    )

    tags: Mapped[List["Tag"]] = relationship(
        "Tag",
        secondary="deck_tags",
        back_populates="decks"
    )

    questions: Mapped[List["Question"]] = relationship(
        "Question",
        back_populates="deck",
        cascade="all, delete-orphan"
    )


# ---------------------------------------------------------------------------
# QUESTION
# ---------------------------------------------------------------------------

class Question(Base):
    __tablename__ = "questions"

    id: Mapped[int] = mapped_column(primary_key=True)
    deck_id: Mapped[int] = mapped_column(
        ForeignKey("decks.id", ondelete="CASCADE"),
        nullable=False
    )

    question_text: Mapped[str] = mapped_column(Text, nullable=False)

    difficulty: Mapped[DifficultyLevel] = mapped_column(
        SAEnum(DifficultyLevel, name="difficulty_level"),
        nullable=False
    )

    topic: Mapped[Optional[str]] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now()
    )

    deck: Mapped["Deck"] = relationship(
        "Deck",
        back_populates="questions"
    )

    answers: Mapped[List["Answer"]] = relationship(
        "Answer",
        back_populates="question",
        cascade="all, delete-orphan"
    )

    progress_entries: Mapped[List["CardProgress"]] = relationship(
        "CardProgress",
        back_populates="question",
        cascade="all, delete-orphan"
    )


# ---------------------------------------------------------------------------
# ANSWER
# ---------------------------------------------------------------------------

class Answer(Base):
    __tablename__ = "answers"

    id: Mapped[int] = mapped_column(primary_key=True)
    question_id: Mapped[int] = mapped_column(
        ForeignKey("questions.id", ondelete="CASCADE"),
        nullable=False
    )

    answer_text: Mapped[str] = mapped_column(Text, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now()
    )

    question: Mapped["Question"] = relationship(
        "Question",
        back_populates="answers"
    )


# ---------------------------------------------------------------------------
# PROGRESS
# ---------------------------------------------------------------------------

class CardProgress(Base):
    __tablename__ = "card_progress"
    __table_args__ = (
        UniqueConstraint("user_id", "question_id", name="uq_user_question"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False
    )

    question_id: Mapped[int] = mapped_column(
        ForeignKey("questions.id", ondelete="CASCADE"),
        nullable=False
    )

    status: Mapped[CardStatus] = mapped_column(
        SAEnum(CardStatus, name="card_status"),
        default=CardStatus.unseen,
        nullable=False
    )

    last_reviewed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True)
    )

    user: Mapped["User"] = relationship(
        "User",
        back_populates="progress_entries"
    )

    question: Mapped["Question"] = relationship(
        "Question",
        back_populates="progress_entries"
    )