from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, selectinload

from app.auth import get_current_user
from app.database import get_db
from app.models import Deck, DeckTag, Tag, User
from app.schemas import DeckCreate, DeckRead, DeckUpdate

router = APIRouter(prefix="/decks", tags=["decks"])


def _load_deck(deck_id: int, user_id: int, db: Session) -> Deck:
    deck = (
        db.query(Deck)
        .options(selectinload(Deck.tags), selectinload(Deck.questions))
        .filter(Deck.id == deck_id, Deck.user_id == user_id)
        .first()
    )
    if not deck:
        raise HTTPException(status_code=404, detail="Deck not found")
    return deck


def _sync_tags(deck: Deck, tag_ids: List[int], user_id: int, db: Session) -> None:
    db.query(DeckTag).filter(DeckTag.deck_id == deck.id).delete()
    for tag_id in tag_ids:
        tag = db.get(Tag, tag_id)
        if tag and tag.user_id == user_id:
            db.add(DeckTag(deck_id=deck.id, tag_id=tag_id))


def _to_read(deck: Deck) -> DeckRead:
    return DeckRead(
        id=deck.id,
        user_id=deck.user_id,
        title=deck.title,
        description=deck.description,
        color=deck.color,
        emoji=deck.emoji or "📚",
        created_at=deck.created_at,
        tags=deck.tags,
        card_count=len(deck.questions),
    )


@router.post("", response_model=DeckRead, status_code=201)
def create_deck(
    payload: DeckCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    deck = Deck(
        user_id=current_user.id,
        title=payload.title,
        description=payload.description,
        color=payload.color,
        emoji=payload.emoji or "📚",
    )
    db.add(deck)
    db.flush()
    _sync_tags(deck, payload.tag_ids, current_user.id, db)
    db.commit()
    return _to_read(_load_deck(deck.id, current_user.id, db))


@router.get("", response_model=List[DeckRead])
def list_decks(
    tag: Optional[str] = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = (
        db.query(Deck)
        .options(selectinload(Deck.tags), selectinload(Deck.questions))
        .filter(Deck.user_id == current_user.id)
    )
    if tag:
        query = query.join(Deck.tags).filter(Tag.name == tag)
    return [_to_read(d) for d in query.all()]


@router.get("/{deck_id}", response_model=DeckRead)
def get_deck(
    deck_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _to_read(_load_deck(deck_id, current_user.id, db))


@router.patch("/{deck_id}", response_model=DeckRead)
def update_deck(
    deck_id: int,
    payload: DeckUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    deck = _load_deck(deck_id, current_user.id, db)
    data = payload.model_dump(exclude_none=True)
    tag_ids = data.pop("tag_ids", None)
    for field, value in data.items():
        setattr(deck, field, value)
    if tag_ids is not None:
        _sync_tags(deck, tag_ids, current_user.id, db)
    db.commit()
    return _to_read(_load_deck(deck_id, current_user.id, db))


@router.delete("/{deck_id}", status_code=204)
def delete_deck(
    deck_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    deck = _load_deck(deck_id, current_user.id, db)
    db.delete(deck)
    db.commit()
