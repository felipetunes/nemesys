from html import escape
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, Form, HTTPException, Request, Response
from sqlalchemy.orm import Session
from twilio.request_validator import RequestValidator

from app.core.config import get_settings
from app.core.db import get_db
from app.engine.runtime import FlowEngine, FlowEngineError
from app.models import CallSession
from app.services.flow_repository import FlowRepository
from app.services.session_repository import SessionConflictError, SessionRepository

router = APIRouter(prefix="/api/telephony/twilio", tags=["telephony"])
settings = get_settings()
engine = FlowEngine()


def twiml(body: str) -> Response:
    return Response(
        content=f'<?xml version="1.0" encoding="UTF-8"?><Response>{body}</Response>', media_type="application/xml"
    )


def say(message: str) -> str:
    return f'<Say language="pt-BR">{escape(message)}</Say>'


def gather(message: str, session_id: str) -> str:
    action = (
        f"{settings.public_base_url.rstrip('/')}/api/telephony/twilio/input?{urlencode({'session_id': session_id})}"
    )
    return (
        f'<Gather input="speech dtmf" numDigits="1" speechTimeout="auto" '
        f'action="{escape(action, quote=True)}" method="POST" language="pt-BR">'
        f"{say(message)}</Gather>{say('Não recebemos uma resposta. Até logo.')}<Hangup/>"
    )


async def validate_request(request: Request, form: dict[str, str]) -> None:
    if not settings.twilio_validate_signatures:
        return
    if not settings.twilio_auth_token:
        raise HTTPException(status_code=500, detail="Signature validation enabled without auth token")
    signature = request.headers.get("X-Twilio-Signature", "")
    validator = RequestValidator(settings.twilio_auth_token)
    if not validator.validate(str(request.url), form, signature):
        raise HTTPException(status_code=403, detail="Invalid Twilio signature")


def render_session(session: CallSession) -> Response:
    last_input_index = -1
    for index, event in enumerate(session.trace):
        if event.type == "input_received":
            last_input_index = index
    recent = session.trace[last_input_index + 1 :]
    prompts = [event.message for event in recent if event.type == "prompt" and event.message]
    if session.status == "waiting_input":
        spoken = " ".join(prompts + [session.pending_input_prompt or "Diga o motivo do contato."])
        return twiml(gather(spoken, session.id))
    body = "".join(say(p) for p in prompts[-3:])
    if session.status == "completed":
        body += "<Hangup/>"
    elif session.status == "failed":
        body += say("Ocorreu uma falha no fluxo. Até logo.") + "<Hangup/>"
    return twiml(body)


@router.post("/voice")
async def incoming_voice(
    request: Request,
    CallSid: str = Form(...),
    db: Session = Depends(get_db),
) -> Response:
    form = {k: str(v) for k, v in (await request.form()).items()}
    await validate_request(request, form)
    session_repo = SessionRepository(db)
    existing = session_repo.get_by_provider_call("twilio", CallSid)
    if existing is not None:
        return render_session(existing)
    flow = FlowRepository(db).get_published("demo-commerce")
    if not flow:
        raise HTTPException(status_code=500, detail="Published demo flow missing")
    session = engine.create_session(flow, {"channel": "voice", "provider_call_id": CallSid})
    session = session_repo.create(session, provider="twilio", provider_call_id=CallSid)
    return render_session(session)


@router.post("/input")
async def voice_input(
    request: Request,
    session_id: str,
    SpeechResult: str | None = Form(default=None),
    Digits: str | None = Form(default=None),
    CallSid: str | None = Form(default=None),
    db: Session = Depends(get_db),
) -> Response:
    form = {k: str(v) for k, v in (await request.form()).items()}
    await validate_request(request, form)
    session_repo = SessionRepository(db)
    session = session_repo.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    expected_call_id = session.variables.get("provider_call_id")
    if CallSid and expected_call_id and CallSid != expected_call_id:
        raise HTTPException(status_code=409, detail="Provider call does not match session")
    flow = FlowRepository(db).get_version(session.flow_id, session.flow_version)
    if not flow:
        raise HTTPException(status_code=409, detail="Session flow version no longer exists")
    value = (Digits or SpeechResult or "").strip()
    if not value:
        return twiml(gather("Não entendi. Tente novamente.", session.id))
    expected_revision = session.revision
    try:
        engine.submit_input(flow, session, value)
        session = session_repo.save(session, expected_revision=expected_revision)
    except FlowEngineError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except SessionConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return render_session(session)
