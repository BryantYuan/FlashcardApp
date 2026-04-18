from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload

from app.auth import get_current_user
from app.database import get_db
from app.models import Answer, Deck, Question, User
from app.schemas import QuestionCreate, QuestionRead, QuestionUpdate

router = APIRouter(tags=["questions"])


def _load_question(question_id: int, user_id: int, db: Session) -> Question:
    q = (
        db.query(Question)
        .options(selectinload(Question.answers))
        .filter(Question.id == question_id)
        .first()
    )
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")
    deck = db.get(Deck, q.deck_id)
    if not deck or deck.user_id != user_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    return q


@router.post("/decks/{deck_id}/questions", response_model=QuestionRead, status_code=201)
def create_question(
    deck_id: int,
    payload: QuestionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    deck = db.get(Deck, deck_id)
    if not deck or deck.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Deck not found")
    question = Question(
        deck_id=deck_id,
        question_text=payload.question_text,
        difficulty=payload.difficulty,
        topic=payload.topic,
    )
    db.add(question)
    db.flush()
    for text in payload.answers:
        db.add(Answer(question_id=question.id, answer_text=text))
    db.commit()
    return _load_question(question.id, current_user.id, db)


@router.get("/decks/{deck_id}/questions", response_model=List[QuestionRead])
def list_questions(
    deck_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    deck = db.get(Deck, deck_id)
    if not deck or deck.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Deck not found")
    return (
        db.query(Question)
        .options(selectinload(Question.answers))
        .filter(Question.deck_id == deck_id)
        .order_by(Question.created_at)
        .all()
    )


@router.patch("/questions/{question_id}", response_model=QuestionRead)
def update_question(
    question_id: int,
    payload: QuestionUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    question = _load_question(question_id, current_user.id, db)
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(question, field, value)
    db.commit()
    return _load_question(question_id, current_user.id, db)


@router.delete("/questions/{question_id}", status_code=204)
def delete_question(
    question_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    question = _load_question(question_id, current_user.id, db)
    db.delete(question)
    db.commit()
