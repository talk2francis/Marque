/** The A2A agent card, served at /.well-known/agent-card.json. Set url to your JSON-RPC endpoint. */
export const card = {
  "name": "Starter Grid",
  "description": "Plans grid levels inside a range with capital, stop and fee drag.",
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
      "id": "grid",
      "name": "Grid plan",
      "description": "Plans grid levels inside a range with capital, stop and fee drag stated.",
      "tags": [
        "grid",
        "trading",
        "levels",
        "bsc"
      ]
    }
  ]
}
