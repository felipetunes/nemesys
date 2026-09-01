from app.telephony.twilio_speech import TwilioSpeechProvider


def test_twilio_speech_provider_renders_escaped_markup():
    provider = TwilioSpeechProvider()

    markup = provider.render_collection("Pedido <urgente>", "https://example.test/input?a=1&b=2", "pt-BR")

    assert "Pedido &lt;urgente&gt;" in markup
    assert "a=1&amp;b=2" in markup
    assert 'input="speech dtmf"' in markup


def test_twilio_speech_provider_prioritizes_dtmf_and_falls_back_to_speech():
    provider = TwilioSpeechProvider()

    dtmf = provider.recognize({"Digits": "2", "SpeechResult": "cancelar"})
    spoken = provider.recognize({"SpeechResult": "cancelar"})
    empty = provider.recognize({})

    assert dtmf is not None and dtmf.value == "2" and dtmf.mode == "dtmf"
    assert spoken is not None and spoken.value == "cancelar" and spoken.mode == "speech"
    assert empty is None
