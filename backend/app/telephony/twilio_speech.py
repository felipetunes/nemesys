from collections.abc import Mapping
from html import escape

from app.telephony.speech import RecognizedInput


class TwilioSpeechProvider:
    def render_prompt(self, message: str, language: str = "pt-BR") -> str:
        return f'<Say language="{escape(language, quote=True)}">{escape(message)}</Say>'

    def render_collection(self, message: str, action_url: str, language: str = "pt-BR") -> str:
        return (
            f'<Gather input="speech dtmf" numDigits="1" speechTimeout="auto" '
            f'action="{escape(action_url, quote=True)}" method="POST" language="{escape(language, quote=True)}">'
            f"{self.render_prompt(message, language)}</Gather>"
            f"{self.render_prompt('Não recebemos uma resposta. Até logo.', language)}<Hangup/>"
        )

    def recognize(self, payload: Mapping[str, str]) -> RecognizedInput | None:
        digits = payload.get("Digits", "").strip()
        if digits:
            return RecognizedInput(value=digits, mode="dtmf")
        speech = payload.get("SpeechResult", "").strip()
        if speech:
            return RecognizedInput(value=speech, mode="speech")
        return None
