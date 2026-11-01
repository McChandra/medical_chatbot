from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field

from backend.auth.main import get_current_session
from backend.auth.service import create_supabase_client
from backend.copilot_engine import answer, DECKS, TOPICS

router = APIRouter(prefix="/copilot", tags=["Research Copilot"])


def validate_session(request: Request):
    header = request.headers.get("Authorization")
    if header is None:
        get_current_session(request)  # Existing encrypted-cookie and Supabase user check.
        return
    scheme, _, token = header.partition(" ")
    if scheme.casefold() == "bearer" and token:
        try:
            if create_supabase_client().auth.get_user(token).user is not None:
                return
        except Exception:
            pass
    raise HTTPException(401, "Authentication required.")


class CopilotQuestion(BaseModel):
    topic: str = Field(max_length=80)
    deck: int = Field(ge=1, le=8)
    question: str = Field(min_length=1, max_length=500)


@router.get("/context", dependencies=[Depends(validate_session)])
def context():
    return {"topics": TOPICS, "decks": DECKS}


@router.post("/answer", dependencies=[Depends(validate_session)])
def respond(payload: CopilotQuestion, response: Response):
    response.headers["Cache-Control"] = "no-store"
    return answer(payload.topic, payload.deck, payload.question)
