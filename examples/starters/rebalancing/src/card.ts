/** The A2A agent card, served at /.well-known/agent-card.json. Set url to your JSON-RPC endpoint. */
export const card = {
  "name": "Starter Range",
  "description": "Re-centres a PancakeSwap V3 position on valid ticks.",
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
      "id": "rebalance",
      "name": "PancakeSwap V3 range",
      "description": "Reads a V3 position and proposes a range on valid ticks.",
      "tags": [
        "pancakeswap",
        "v3",
        "liquidity",
        "rebalance"
      ]
    }
  ]
}
