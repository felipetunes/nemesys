from app.services.intent_classifier import IntentClassifier


def test_dtmf_shortcuts_without_openai(monkeypatch):
    classifier = IntentClassifier()
    classifier.client = None
    intents = ["order_status", "cancellation", "human_agent", "fallback"]
    assert classifier.classify("1", intents).intent == "order_status"
    assert classifier.classify("2", intents).intent == "cancellation"
    assert classifier.classify("0", intents).intent == "human_agent"


def test_keyword_classifier(monkeypatch):
    classifier = IntentClassifier()
    classifier.client = None
    intents = ["order_status", "cancellation", "human_agent", "fallback"]
    assert classifier.classify("quero cancelar a compra", intents).intent == "cancellation"
    assert classifier.classify("quero falar com um atendente", intents).intent == "human_agent"
