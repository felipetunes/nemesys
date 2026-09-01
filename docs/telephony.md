# Real telephony demo

The flow runtime itself does not depend on a telephony provider. The repository includes a Twilio-compatible webhook adapter as a concrete example.

## What you need

- a provider account and voice-capable number;
- a public HTTPS URL that forwards to the backend on port 8000;
- `PUBLIC_BASE_URL` set to that public origin.

## Incoming webhook

Configure the incoming voice URL as:

```text
POST https://YOUR_PUBLIC_HOST/api/telephony/twilio/voice
```

The adapter creates a normal Revelys session, renders prompts as TwiML `<Say>`, and converts speech/DTMF `<Gather>` results into the same `submit_input` operation used by the browser simulator.

The provider call ID is stored with a uniqueness constraint. A repeated incoming webhook returns the existing session instead of creating a duplicate call.

## Signature verification

For a public demo, enable provider request verification:

```env
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_VALIDATE_SIGNATURES=true
```

Keep the auth token out of Git and screenshots.

## Generic JSON adapter

Gateways and SIP applications can use the provider-neutral JSON endpoints:

```text
POST /api/telephony/generic/start
POST /api/telephony/generic/{session_id}/input
```

`start` accepts `provider_call_id`, `flow_id` and optional initial variables. Repeating the same provider call ID returns the existing session. `input` accepts the same provider call ID plus a text or DTMF value.

When `GENERIC_WEBHOOK_SECRET` is set, send `X-Revelys-Signature` containing the lowercase hexadecimal HMAC-SHA256 digest of the raw request body.

The generic adapter and Twilio adapter both use the same session repository and `FlowEngine`. Speech rendering/recognition is exposed through a protocol in `app/telephony/speech.py`; provider-specific behavior remains under `app/telephony/`.

## Production note

A production voice platform would normally add retry/idempotency behavior, durable active-session storage, recording policies, observability, failover, rate limiting, consent/privacy controls, and provider-specific error handling.
