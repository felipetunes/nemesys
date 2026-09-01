import json
import re

from openai import OpenAI

from app.core.config import get_settings
from app.models import IntentResult


class IntentClassifier:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.client: OpenAI | None = None
        if self.settings.openai_api_key:
            self.client = OpenAI(api_key=self.settings.openai_api_key)

    def classify(self, utterance: str, intents: list[str]) -> IntentResult:
        if not intents:
            return IntentResult(intent="fallback", confidence=0, reason="No intents configured", provider="local")
        if self.client:
            try:
                return self._openai_classify(utterance, intents)
            except Exception as exc:
                fallback = self._local_classify(utterance, intents)
                fallback.reason = f"OpenAI unavailable; local fallback used ({type(exc).__name__})."
                return fallback
        return self._local_classify(utterance, intents)

    def _openai_classify(self, utterance: str, intents: list[str]) -> IntentResult:
        assert self.client is not None
        schema = {
            "type": "object",
            "properties": {
                "intent": {"type": "string", "enum": intents},
                "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                "reason": {"type": "string"},
            },
            "required": ["intent", "confidence", "reason"],
            "additionalProperties": False,
        }
        response = self.client.responses.create(
            model=self.settings.openai_model,
            instructions=(
                "You classify contact-center IVR utterances. Choose exactly one allowed intent. "
                "Use fallback when the request is ambiguous. Keep reason under 20 words."
            ),
            input=f"Allowed intents: {', '.join(intents)}\nCustomer utterance: {utterance}",
            text={
                "format": {
                    "type": "json_schema",
                    "name": "intent_result",
                    "strict": True,
                    "schema": schema,
                }
            },
        )
        data = json.loads(response.output_text)
        return IntentResult(**data, provider="openai")

    def _local_classify(self, utterance: str, intents: list[str]) -> IntentResult:
        text = re.sub(r"\s+", " ", utterance.lower().strip())
        digit_map = {"1": "order_status", "2": "cancellation", "0": "human_agent"}
        if text in digit_map and digit_map[text] in intents:
            return IntentResult(intent=digit_map[text], confidence=0.99, reason="DTMF shortcut", provider="local")

        rules = {
            "cancellation": [("cancel", 3), ("desist", 3), ("estorno", 3), ("devolver", 3), ("reembolso", 3)],
            "human_agent": [("atendente", 3), ("humano", 3), ("pessoa", 1), ("falar com alguém", 3), ("operador", 2)],
            "order_status": [("pedido", 2), ("entrega", 2), ("rastre", 3), ("chegou", 2), ("compr", 1), ("status", 2)],
        }
        scored: list[tuple[int, int, str]] = []
        for priority, (intent, keywords) in enumerate(rules.items()):
            if intent not in intents:
                continue
            score = sum(weight for keyword, weight in keywords if keyword in text)
            scored.append((score, -priority, intent))
        scored.sort(reverse=True)
        if scored and scored[0][0] > 0:
            score, _, intent = scored[0]
            confidence = min(0.96, 0.68 + score * 0.08)
            return IntentResult(
                intent=intent, confidence=confidence, reason="Keyword demo classifier", provider="local"
            )
        fallback = "fallback" if "fallback" in intents else intents[0]
        return IntentResult(intent=fallback, confidence=0.35, reason="No local rule matched", provider="local")
