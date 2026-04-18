from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Answer, Deck, Question, User
from app.schemas import AnswerCreate, AnswerRead, AnswerUpdate

router = APIRouter(tags=["answers"])


def _check_ownership(question_id: int, user_id: int, db: Session) -> Question:
    question = db.get(Question, question_id)
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    deck = db.get(Deck, question.deck_id)
    if not deck or deck.user_id != user_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    return question


@router.post("/questions/{question_id}/answers", response_model=AnswerRead, status_code=201)
def add_answer(
    question_id: int,
    payload: AnswerCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _check_ownership(question_id, current_user.id, db)
    answer = Answer(question_id=question_id, answer_text=payload.answer_text)
    db.add(answer)
    db.commit()
    db.refresh(answer)
    return answer


@router.patch("/answers/{answer_id}", response_model=AnswerRead)
def update_answer(
    answer_id: int,
    payload: AnswerUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    answer = db.get(Answer, answer_id)
    if not answer:
        raise HTTPException(status_code=404, detail="Answer not found")
    _check_ownership(answer.question_id, current_user.id, db)
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(answer, field, value)
    db.commit()
    db.refresh(answer)
    return answer


@router.delete("/answers/{answer_id}", status_code=204)
def delete_answer(
    answer_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    answer = db.get(Answer, answer_id)
    if not answer:
        raise HTTPException(status_code=404, detail="Answer not found")
    question = _check_ownership(answer.question_id, current_user.id, db)
    remaining = db.query(Answer).filter(Answer.question_id == question.id).count()
    if remaining <= 1:
        raise HTTPException(status_code=400, detail="Cannot delete the last answer")
    db.delete(answer)
    db.commit()
