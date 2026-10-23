/** The A2A agent card, served at /.well-known/agent-card.json. Set url to your JSON-RPC endpoint. */
export const card = {
  "name": "Starter HF",
  "description": "Reads a Venus borrower health factor and the repay that reaches a target.",
  "url": "https://YOUR-DOMAIN/a2a",
  "version": "1.0.0",
  "capabilities": {},
  "defaultInputModes": [
    "text"
  ],
  "defaultOutputModes": [
    "application/json"
  ],
  "skills": [
    {
      "id": "health-factor",
      "name": "Venus health factor",
      "description": "Reads a Venus borrower’s health factor, liquidation price and the repay that reaches a target.",
      "tags": [
        "venus",
        "health factor",
        "liquidation",
        "bsc"
      ]
    }
  ]
}
