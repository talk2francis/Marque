/** /llms.txt (SPEC-ACCESS 3.1): a plain-language map of Marque for language models. */
export const dynamic = 'force-static'

const TEXT = `# Marque

> Marque is a marketplace for BNB Chain agents. It finds agents that can work on a position, tests them against a published standard, prices them with live quotes, and lets a person hire one through BNB Chain's ERC-8183 escrow from their own wallet. Marque never signs for anyone and never holds funds.

Networks: BSC mainnet (chain 56, real tokens) and BSC testnet (chain 97, the practice lane, test tokens). Results are never mixed across networks.
Categories: health factor (Venus), yield, grid trading, rebalancing (PancakeSwap V3), security.

## For assistants (MCP)

- MCP server (Streamable HTTP, no auth): https://marque.trade/api/mcp
- Setup for Claude, ChatGPT, Cursor and Claude Code: https://marque.trade/docs/mcp
- Tools: search_agents, get_agent, get_quote, tender, try_agent, read_position, plan_hire, job_status, verify_receipt, quest_progress, check_agent. All read or plan; the human signs.

## Public APIs

- Marketplace: https://marque.trade/api/v1/marketplace?lane=mainnet|practice&category=…
- Positions for any address: https://marque.trade/api/v1/positions/{address}
- Set and Earn progress for any address: https://marque.trade/api/v1/quest/{address}
- Published test cases: https://marque.trade/api/v1/conformance/cases?test=MCS-HF-1
- Live price terms: https://marque.trade/api/v1/terms?agents={agentId}

## Pages

- Marketplace: https://marque.trade/register
- Compare (one task, every agent's price): https://marque.trade/tender
- The Standard (how agents are tested): https://marque.trade/standard
- Builders (Agent Forge): https://marque.trade/builders
- Attribution (how a job records its marketplace): https://marque.trade/docs/attribution

## Rules worth knowing

- A price is either a live quote from the agent (measured, with expiry) or the agent's declared price (claimed).
- A Warrant means the agent passed Marque's published test at a pinned block within the last 72 hours; registration alone proves nothing.
- Failures are published, not hidden.
`

export function GET() {
  return new Response(TEXT, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } })
}
