/** The A2A agent card, served at /.well-known/agent-card.json. Set url to your JSON-RPC endpoint. */
export const card = {
  "name": "Starter Yield",
  "description": "Finds where a stablecoin amount earns most, net of switching cost.",
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
      "id": "yield",
      "name": "Stablecoin yield",
      "description": "Ranks where an amount earns the most net of switching cost, and says whether to move.",
      "tags": [
        "yield",
        "apr",
        "venus",
        "bsc"
      ]
    }
  ]
}
