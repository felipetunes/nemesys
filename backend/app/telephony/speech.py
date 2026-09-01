from collections.abc import Mapping
from dataclasses import dataclass
from typing import Literal, Protocol


@dataclass(frozen=True)
class RecognizedInput:
    value: str
    mode: Literal["speech", "dtmf"]


class TelephonySpeechProvider(Protocol):
    def render_prompt(self, message: str, language: str) -> str: ...

    def render_collection(
        self,
        message: str,
        action_url: str,
        language: str,
    ) -> str: ...

    def recognize(self, payload: Mapping[str, str]) -> RecognizedInput | None: ...
