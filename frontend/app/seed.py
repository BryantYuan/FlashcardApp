"""
Seed the database with demo data.
Run with:  python -m app.seed
"""
from datetime import datetime, timedelta, timezone

from passlib.context import CryptContext

from app.database import SessionLocal
from app.models import Answer, CardProgress, CardStatus, Deck, DeckTag, Question, Tag, User

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def seed() -> None:
    db = SessionLocal()
    try:
        # ------------------------------------------------------------------
        # Guard — skip if already seeded
        # ------------------------------------------------------------------
        # if db.query(User).first():
        #     print("Database already seeded — skipping.")
        #     return

        # ------------------------------------------------------------------
        # User
        # ------------------------------------------------------------------
        user = User(
            name="Alex Rivera",
            email="alex@example.com",
            password_hash=pwd_context.hash("password123"),
            avatar_url="https://api.dicebear.com/7.x/avataaars/svg?seed=Alex",
        )
        db.add(user)
        db.flush()

        # ------------------------------------------------------------------
        # Tags
        # ------------------------------------------------------------------
        tag_names = [
            "Science", "Humanities", "Languages", "Maths",
            "Medicine", "History", "Literature", "Computing",
        ]
        tags: dict[str, Tag] = {}
        for name in tag_names:
            t = Tag(name=name, user_id=user.id)
            db.add(t)
            tags[name] = t
        db.flush()

        # ------------------------------------------------------------------
        # Decks
        # ------------------------------------------------------------------
        deck_data = [
            {
                "title": "Cell Biology",
                "description": "Fundamentals of cell structure, function, and division.",
                "color": "#6366f1",
                "tags": ["Science", "Medicine"],
            },
            {
                "title": "World History",
                "description": "Key events and turning points from ancient to modern times.",
                "color": "#f59e0b",
                "tags": ["Humanities", "History"],
            },
            {
                "title": "Spanish Vocabulary",
                "description": "Essential Spanish words and phrases for everyday conversation.",
                "color": "#10b981",
                "tags": ["Languages"],
            },
            {
                "title": "Calculus",
                "description": "Differential and integral calculus concepts and techniques.",
                "color": "#3b82f6",
                "tags": ["Maths"],
            },
            {
                "title": "Organic Chemistry",
                "description": "Reactions, mechanisms, and functional groups in organic chemistry.",
                "color": "#ef4444",
                "tags": ["Science", "Medicine"],
            },
            {
                "title": "English Literature",
                "description": "Classic works, authors, and literary devices in English literature.",
                "color": "#8b5cf6",
                "tags": ["Humanities", "Literature"],
            },
        ]

        decks: dict[str, Deck] = {}
        for d in deck_data:
            deck = Deck(
                user_id=user.id,
                title=d["title"],
                description=d["description"],
                color=d["color"],
            )
            db.add(deck)
            db.flush()
            for tag_name in d["tags"]:
                db.add(DeckTag(deck_id=deck.id, tag_id=tags[tag_name].id))
            decks[d["title"]] = deck
        db.flush()

        # ------------------------------------------------------------------
        # Questions & Answers
        # ------------------------------------------------------------------
        questions_data = [
            # Cell Biology
            {
                "deck": "Cell Biology",
                "question_text": "What is the powerhouse of the cell?",
                "difficulty": "easy",
                "topic": "Organelles",
                "answers": ["Mitochondria", "Mitochondrion"],
            },
            {
                "deck": "Cell Biology",
                "question_text": "What structure controls what enters and exits the cell?",
                "difficulty": "easy",
                "topic": "Cell Structure",
                "answers": ["Cell membrane", "Plasma membrane"],
            },
            {
                "deck": "Cell Biology",
                "question_text": "During which phase of mitosis do chromosomes align along the cell's equator?",
                "difficulty": "medium",
                "topic": "Cell Division",
                "answers": ["Metaphase"],
            },
            {
                "deck": "Cell Biology",
                "question_text": "What is the term for programmed cell death?",
                "difficulty": "medium",
                "topic": "Cell Processes",
                "answers": ["Apoptosis"],
            },
            {
                "deck": "Cell Biology",
                "question_text": "What type of cell lacks a membrane-bound nucleus?",
                "difficulty": "easy",
                "topic": "Cell Types",
                "answers": ["Prokaryote", "Prokaryotic cell"],
            },

            # World History
            {
                "deck": "World History",
                "question_text": "In what year did World War II end?",
                "difficulty": "easy",
                "topic": "World Wars",
                "answers": ["1945"],
            },
            {
                "deck": "World History",
                "question_text": "Which empire was ruled by Genghis Khan?",
                "difficulty": "easy",
                "topic": "Empires",
                "answers": ["Mongol Empire", "The Mongol Empire"],
            },
            {
                "deck": "World History",
                "question_text": "What event triggered the start of World War I?",
                "difficulty": "medium",
                "topic": "World Wars",
                "answers": [
                    "Assassination of Archduke Franz Ferdinand",
                    "The assassination of Franz Ferdinand",
                ],
            },
            {
                "deck": "World History",
                "question_text": "Which ancient wonder was located in Alexandria, Egypt?",
                "difficulty": "medium",
                "topic": "Ancient World",
                "answers": ["Lighthouse of Alexandria", "The Lighthouse of Alexandria"],
            },

            # Spanish Vocabulary
            {
                "deck": "Spanish Vocabulary",
                "question_text": "How do you say 'Thank you' in Spanish?",
                "difficulty": "easy",
                "topic": "Politeness",
                "answers": ["Gracias"],
            },
            {
                "deck": "Spanish Vocabulary",
                "question_text": "What does 'madrugada' mean in English?",
                "difficulty": "hard",
                "topic": "Time",
                "answers": ["Early morning", "Dawn", "Small hours"],
            },
            {
                "deck": "Spanish Vocabulary",
                "question_text": "Translate 'library' into Spanish.",
                "difficulty": "medium",
                "topic": "Places",
                "answers": ["Biblioteca"],
            },

            # Calculus
            {
                "deck": "Calculus",
                "question_text": "What is the derivative of sin(x)?",
                "difficulty": "easy",
                "topic": "Differentiation",
                "answers": ["cos(x)", "cos x"],
            },
            {
                "deck": "Calculus",
                "question_text": "What is the integral of 1/x dx?",
                "difficulty": "medium",
                "topic": "Integration",
                "answers": ["ln|x| + C", "ln(x) + C", "log|x| + C"],
            },
            {
                "deck": "Calculus",
                "question_text": "State the fundamental theorem of calculus in one sentence.",
                "difficulty": "hard",
                "topic": "Theory",
                "answers": [
                    "Differentiation and integration are inverse operations",
                    "The derivative of the integral of f is f",
                ],
            },

            # Organic Chemistry
            {
                "deck": "Organic Chemistry",
                "question_text": "What functional group is present in alcohols?",
                "difficulty": "easy",
                "topic": "Functional Groups",
                "answers": ["Hydroxyl group", "-OH", "OH"],
            },
            {
                "deck": "Organic Chemistry",
                "question_text": "What type of reaction adds a halogen across a double bond?",
                "difficulty": "medium",
                "topic": "Reactions",
                "answers": ["Electrophilic addition", "Addition reaction"],
            },
            {
                "deck": "Organic Chemistry",
                "question_text": "What is the IUPAC name for CH3-CH2-OH?",
                "difficulty": "medium",
                "topic": "Nomenclature",
                "answers": ["Ethanol"],
            },

            # English Literature
            {
                "deck": "English Literature",
                "question_text": "Who wrote 'Pride and Prejudice'?",
                "difficulty": "easy",
                "topic": "Authors",
                "answers": ["Jane Austen"],
            },
            {
                "deck": "English Literature",
                "question_text": "In which Shakespeare play does the character Ophelia appear?",
                "difficulty": "medium",
                "topic": "Shakespeare",
                "answers": ["Hamlet"],
            },
            {
                "deck": "English Literature",
                "question_text": "What literary device involves giving human qualities to non-human things?",
                "difficulty": "medium",
                "topic": "Literary Devices",
                "answers": ["Personification"],
            },
            {
                "deck": "English Literature",
                "question_text": "What is the term for a 14-line poem with a specific rhyme scheme?",
                "difficulty": "medium",
                "topic": "Poetry",
                "answers": ["Sonnet"],
            },
            {
                "deck": "English Literature",
                "question_text": "Who wrote the dystopian novel '1984'?",
                "difficulty": "easy",
                "topic": "Authors",
                "answers": ["George Orwell", "Eric Arthur Blair"],
            },
        ]

        question_objs: list[Question] = []
        for q in questions_data:
            question = Question(
                deck_id=decks[q["deck"]].id,
                question_text=q["question_text"],
                difficulty=q["difficulty"],
                topic=q.get("topic"),
            )
            db.add(question)
            db.flush()
            for ans_text in q["answers"]:
                db.add(Answer(question_id=question.id, answer_text=ans_text))
            question_objs.append(question)
        db.flush()

        # ------------------------------------------------------------------
        # Card Progress — 5 known, 5 learning, rest unseen
        # ------------------------------------------------------------------
        now = datetime.now(timezone.utc)
        progress_entries = [
            # known
            (question_objs[0], CardStatus.known, now - timedelta(days=1)),
            (question_objs[1], CardStatus.known, now - timedelta(days=1)),
            (question_objs[5], CardStatus.known, now - timedelta(days=2)),
            (question_objs[9], CardStatus.known, now - timedelta(hours=3)),
            (question_objs[12], CardStatus.known, now - timedelta(hours=5)),
            # learning
            (question_objs[2], CardStatus.learning, now - timedelta(hours=1)),
            (question_objs[3], CardStatus.learning, now - timedelta(hours=2)),
            (question_objs[6], CardStatus.learning, now - timedelta(days=1)),
            (question_objs[10], CardStatus.learning, now - timedelta(hours=6)),
            (question_objs[13], CardStatus.learning, now - timedelta(hours=4)),
        ]

        for question, status, reviewed_at in progress_entries:
            db.add(
                CardProgress(
                    user_id=user.id,
                    question_id=question.id,
                    status=status,
                    last_reviewed_at=reviewed_at,
                )
            )

        db.commit()
        print("✅  Database seeded successfully.")
        print(f"    User:      {user.email} / password123")
        print(f"    Decks:     {len(decks)}")
        print(f"    Questions: {len(question_objs)}")

    except Exception as exc:
        db.rollback()
        raise exc
    finally:
        db.close()


if __name__ == "__main__":
    seed()