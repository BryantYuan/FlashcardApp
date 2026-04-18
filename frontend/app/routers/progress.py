from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import CardProgress, Deck, Question, User
from app.schemas import ProgressRead, ProgressUpsert

router = APIRouter(prefix="/progress", tags=["progress"])


def _check_question(question_id: int, user_id: int, db: Session) -> Question:
    question = db.get(Question, question_id)
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    deck = db.get(Deck, question.deck_id)
    if not deck or deck.user_id != user_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    return question


@router.put("/{question_id}", response_model=ProgressRead)
def upsert_progress(
    question_id: int,
    payload: ProgressUpsert,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _check_question(question_id, current_user.id, db)
    entry = (
        db.query(CardProgress)
        .filter(
            CardProgress.user_id == current_user.id,
            CardProgress.question_id == question_id,
        )
        .first()
    )
    now = datetime.now(timezone.utc)
    if entry:
        entry.status = payload.status
        entry.last_reviewed_at = now
    else:
        entry = CardProgress(
            user_id=current_user.id,
            question_id=question_id,
            status=payload.status,
            last_reviewed_at=now,
        )
        db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.get("", response_model=List[ProgressRead])
def list_progress(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return (
        db.query(CardProgress)
        .filter(CardProgress.user_id == current_user.id)
        .all()
    )


@router.get("/{question_id}", response_model=ProgressRead)
def get_progress(
    question_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    entry = (
        db.query(CardProgress)
        .filter(
            CardProgress.user_id == current_user.id,
            CardProgress.question_id == question_id,
        )
        .first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="No progress entry found")
    return entry
