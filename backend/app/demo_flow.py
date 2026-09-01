from app.models import FlowDefinition, FlowEdge, FlowNode


def build_demo_flow() -> FlowDefinition:
    return FlowDefinition(
        id="demo-commerce",
        name="Demo Commerce IVR",
        description="AI-assisted e-commerce service line used by the simulator and telephony demo.",
        nodes=[
            FlowNode(id="start", type="start", label="Start", x=80, y=180, config={}),
            FlowNode(
                id="welcome",
                type="prompt",
                label="Welcome",
                x=280,
                y=180,
                config={"message": "Olá! Você entrou na Smart Shop."},
            ),
            FlowNode(
                id="reason",
                type="collect_input",
                label="Ask reason",
                x=500,
                y=180,
                config={
                    "prompt": "Em poucas palavras, diga o motivo do seu contato. Você também pode digitar 1 para pedido, 2 para cancelamento ou 0 para atendente.",
                    "variable": "customer_reason",
                    "input_mode": "speech_or_dtmf",
                },
            ),
            FlowNode(
                id="intent",
                type="ai_intent",
                label="AI Intent",
                x=740,
                y=180,
                config={
                    "source_variable": "customer_reason",
                    "result_variable": "intent",
                    "intents": ["order_status", "cancellation", "human_agent", "fallback"],
                },
            ),
            FlowNode(
                id="order",
                type="prompt",
                label="Order status",
                x=1000,
                y=40,
                config={"message": "Entendi. Para consultar o seu pedido, vamos validar os dados da compra."},
            ),
            FlowNode(
                id="cancel",
                type="prompt",
                label="Cancellation",
                x=1000,
                y=150,
                config={"message": "Certo. Vou direcionar o atendimento para o processo de cancelamento."},
            ),
            FlowNode(
                id="human",
                type="queue",
                label="Agent queue",
                x=1000,
                y=260,
                config={
                    "queue_name": "customer-care",
                    "message": "Tudo bem. Você entrou na fila de atendimento humano.",
                },
            ),
            FlowNode(
                id="fallback",
                type="prompt",
                label="Fallback",
                x=1000,
                y=370,
                config={
                    "message": "Não consegui identificar com segurança o motivo. Um atendente poderá continuar com você."
                },
            ),
            FlowNode(
                id="end",
                type="end",
                label="End",
                x=1260,
                y=180,
                config={"message": "Obrigado por testar a Nemesys. Até logo!"},
            ),
        ],
        edges=[
            FlowEdge(id="e1", source="start", target="welcome"),
            FlowEdge(id="e2", source="welcome", target="reason"),
            FlowEdge(id="e3", source="reason", target="intent"),
            FlowEdge(id="e4", source="intent", target="order", condition="order_status", label="order_status"),
            FlowEdge(id="e5", source="intent", target="cancel", condition="cancellation", label="cancellation"),
            FlowEdge(id="e6", source="intent", target="human", condition="human_agent", label="human_agent"),
            FlowEdge(id="e7", source="intent", target="fallback", condition="fallback", label="fallback"),
            FlowEdge(id="e8", source="order", target="end"),
            FlowEdge(id="e9", source="cancel", target="end"),
            FlowEdge(id="e10", source="human", target="end"),
            FlowEdge(id="e11", source="fallback", target="end"),
        ],
    )
