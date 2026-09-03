I'm going to do this properly. Let me pull my own context on your past builds first, then go deep on the hackathon material and the competitive field before I write anything.

Three documents above. Here is what matters, and where I overrode ChatGPT.

The finding that changes the whole strategy

I queried the 8004scan API directly rather than reading the marketing. The "200,000+ agents on BSC" are mostly not real supply. Record after record comes back with description: null, services: null, and 8004scan's own parser emitting IA002 — Missing services array (agent won't be reachable). Their scoring engine literally has an integrity_tier of "broken" and a discoverability_tier of "unavailable". Health checks return degraded, unhealthy, skipped, with endpoints resolving to dead Cloudflare tunnels.

Then I read Hive's live homepage. It surfaces five agents, of which zero are Grid Trading and zero are Yield Optimisation. Two of its four mandated categories are empty on its own front page, and "agent diversity, all four equally deep" is one of three scored criteria.

So the brief's framing is half wrong in a way that will sink most entries:

BNB Chain does not have a discovery problem. It has a supply problem wearing a discovery problem's clothes.

Everyone will build a search box over the registry and ship a beautiful directory of dead links.

The wedge: position-first, not agent-first

You don't arrive at Marque to browse agents. You paste an address and it reads your actual BSC positions live: your Pancake V3 range and how far it is from the boundary, your Venus health factor and liquidation price, your idle USDT and what it should be earning at your size. Then, and only then, the agents that can act on that specific position.

That single inversion is the shortest path through all three criteria at once. Functionality, because there is no dead end when the first screen is your own money instead of a taxonomy. Data quality, because every number is chain-derived tick math and health factors rather than registry counts, which is exactly what "beyond basic counts" means. Agent diversity, because the four categories are four position types and you physically cannot fake three of them. The architecture forces the depth.

Second wedge, which makes the first credible: a deterministic conformance test per category. We compute ground truth ourselves at a pinned block, ask the agent, and diff. Published standard generated from the enforcing code, same pattern that worked for AS and OQS. Third wedge: the TermiX Advantage Report stops being a PDF and becomes a product surface, because the harness already owns the manual baseline.

Where I disagreed with ChatGPT

"Proof" is not a wedge any more. Hive already says receipts and permissions. OKX.AI has trust layers. A six-level Proof Spectrum is a good slide and a mediocre product. Users don't want a ladder, they want to know if this thing can do their job right now.

Its design direction is the current default. Warm graphite, bone, hairlines, sparse BNB yellow, editorial grain, 01/02/03 numbering. That is precisely what every design-capable model outputs in 2026, and Hive already looks like it. I replaced it with something structural: light for looking, dark for doing. Discovery is a daylight instrument panel; the moment you commit capital the interface drops into a warm near-black cockpit. Semantic, not decorative, and nobody else will do it. The signature component is one measure rule used identically for LP range, health factor, net APR and grid band. One device, four categories, equal depth made visible.

It ignored Archon. You already built an ERC-8004 smart contract auditor that placed #1 in AI DevTools at Mantle. TermiX weights security agents above general-purpose at 20% of their rubric. Port Archon's audit core to a BSC-registered agent and you enter that criterion with a competition-placed engine while everyone else enters with a weekend GPT wrapper. Half a day of work.

It missed TermiX's own supply. While probing I found redpen.agent at 56:0x8004a169…:318810 with an on-chain termix.metadataHash key and a live A2A endpoint at platform-backend.prod.termix.live. TermiX registers its roster as ERC-8004 identities on BSC. That is indexable supply, it is security-category supply, and when a TermiX judge lands on your marketplace and sees their own agents correctly classified, health-probed and conformance-tested with a working hire path, that is very hard to beat.

It missed the judging window. Judging runs 9 to 23 September. Eligibility requires the site functional and agents live throughout. BNB's own press release names a fourth criterion the tracks page omits: "real-world usage." Every team goes dark on the 9th. Two weeks of shipping and usage while the field sleeps is close to free points.

The name

Marque. A letter of marque is delegated authority with defined scope and an expiry, revocable by the grantor, which is exactly an Altana scoped session. A marque is also a maker's mark of quality, which is exactly the conformance certificate. One word carrying both halves of the product, with a full vocabulary falling out of it: grant a marque, earn the Mark, browse the Register, read the Ledger. Short, ownable, no crypto squatter, and not BNB-specific, which matters because the prize is a standalone brand.

Backups ranked in the doc: Rialto, Ward, Tender, Covenant, Bourse, Consign, Vantage, Fathom. Sweep marque.market, marque.xyz, usemarque.com today.

Honest scoring

Main track blended around 87 if it ships as specified, which should make the top three shortlist. TermiX is your most winnable prize at roughly 90, and I would take it over a coin flip on the main prize. PancakeSwap around 88, Altana 85. Where we lose, if we lose, is third-party supply depth in Grid and Yield. That is the one thing your own hands should attack while the bots build.

Five things to do in the next hour
Buy the domain, point it at the VPS.
Submit the 8004scan Pro tier application. Lead time is not under your control.
Fund the demo wallet and open the positions. A deliberately tight Pancake V3 range, a small Venus borrow, some idle USDT. Nothing in the plan works without this existing, and it is the most important forty dollars in the build.
Commit AGENTS.md.
Register on the intake form.




...............................
...............................
BELOW IS AN UPDATED MODIFICATIONS TO THIS BUILD AS I HAD A BACK AND FORTH WITH MY AI

That was a genuinely good review. I fetched the HackQuest page before deciding anything, and I owe you a correction before the verdict.

I was wrong about the name, and it was the worst kind of wrong

The Marque collision is real and it is worse than GPT described. That project's one-line pitch is "agents that carry a budget, not your keys." Scoped, revocable delegation. Live on Base mainnet. Verified contract, GitHub, X handle, domain. And they independently landed on a hallmark-seal logo, which means they walked the identical semantic path from the same word to the same visual.

The failure wasn't the reasoning, it was the clearance. I ran one search, got nothing relevant back, and told you "no dominant crypto squatter, I checked." A single search returning nothing is weak evidence for a negative and I stated it as if it were strong. That's the kind of confident negative I should not have handed you.

Renamed to Rialto across all three documents. Venice's market district, the place where reputation decided who was good for it. And the rename produced a better structure than the original, because it frees the authority vocabulary for the primitives instead of cramming two ideas into one word:

a Charter — the scoped session. Grant a charter, revoke a charter. Chartering is hiring a whole capability for a defined voyage under written terms. Plain English, a stranger gets it instantly.
a Warrant — the conformance certificate. A warrant of fitness is literally an inspection certificate.
The Desk, the Register, the Ledger, RCS for the standard.

The seal moment survives and is now historically correct, since charters are sealed.

I am not clearing Rialto either. There's a US broker-dealer called Rialto Markets, private securities, not crypto, not AI. Lower risk than the Marque collision but not zero. So I added the fix that removes the whole class of problem: the display name lives in one constant, packages/ui/src/brand.ts. Repo and DB use the code name. You do a proper 20-minute sweep on Day 4 and renaming becomes one line plus a DNS record. Don't let this block an hour of engineering.

Verdict on the eleven points

Accepted outright, and three of them were real defects in my work:

#7, the data invariant, was the most important catch. I wrote "Postgres is fully rebuildable from chain" and then wrote a P11 acceptance test that says drop the DB and rebuild. Those two together would have authorised a coding agent to delete the Ledger — probe history, conformance results, raw agent responses, manual benchmark recordings. None of that is recreatable from BSC. I over-applied the Agora lesson. Now split into two explicit tiers: derived state (rebuildable, drill it in a scratch DB, never production) and first-party observations (nightly backup, restore tested, never deletable, removed from the drill entirely).

#3, conformance determinism, was the sharpest technical point. GPT is right that there is no objectively correct re-centred V3 range, and that "expected fills at stated volatility" is a model output wearing a fact's clothes. The fix is cleaner than either of us proposed: the test case supplies the policy. "Re-centre symmetrically at ±6% around spot on the 0.25% tier" — then every check is arithmetic against a given constraint. The volatility check is deleted. New invariant: if you cannot write it as an assertion with a numeric tolerance, it is not a conformance test, it is a Ledger question.

#2, the ~99% attrition figure. Correct, and internally inconsistent with my own invariant 4. Replaced with a directional engineering expectation plus an explicit prohibition on hardcoding any ratio. I also swept the master plan to label every illustrative number as layout copy, because a coding agent reading 214,882 registered in a mock is exactly how fabricated data reaches production.

#1 wallet-optional is now an invariant and appears verbatim in P4. #9 post-deadline shipping — I was wrong to call it free points; that framing invites a rules problem. Now three buckets, and you email the organisers on Sep 9 and paste the answer into SUBMISSION.md. #10 Pancake gaps demoted to cut-by-default. #5, #8, #11 accepted as stated.

#6, the TermiX adapter — we agree on the principle, but there's a fact worth keeping. GPT is right that a generic A2AExecutor should handle them and that we shouldn't build sponsor plumbing. But their endpoint is a URL template with a literal {agentId} placeholder that 404s if you fetch it verbatim. So it's not an executor, it's a template resolver in packages/registry — written generically, because other publishers do this too. Without it those agents are unreachable, which makes it a supply unlock rather than cosmetics. That's the version now in P5.

Where GPT was directionally right but slightly soft: #5. "Isolate the portable engine first" is correct but doesn't tell a bot when to quit. P8a now has a four-hour timebox and a named fallback: thin approval-risk and privileged-function triage over verified source. Still satisfies TermiX's high-stakes weighting.

On funding I accepted almost everything, including the point I'd have made myself if I'd thought about it: do not run a mainnet Venus position near liquidation for presentation. My HF 1.43 was layout copy that read like an instruction. Ours stays above 2.5, and the scary demo reads a real third-party address — which is strictly better proof, because it demonstrates the reader works on arbitrary input, which is precisely what the functionality criterion tests.

Two things GPT missed on funding: the ERC-8183 settlement-token point is excellent and I've promoted it into the gotchas, but nobody budgeted agent LLM spend. Five agents answering calls for two weeks of judging, with probe loops and curious judges. Uncapped, that quietly costs more than your entire mainnet budget. Now DAILY_LLM_USD_CAP=5 with per-agent sub-caps and an 80% alert.

Breathing space for the bot

You asked for this directly and it was the biggest gap in what I gave you. My prompts were rigid: all criteria pass, paste evidence, STOP. That's how a bot stalls at 3am on an SDK.

Added a degradation ladder to AGENTS.md and referenced from every phase:

Green ship it. Amber the bot has standing authority to cut optional features, substitute libraries, stub integrations behind our interfaces, ship a thin category, widen a tolerance if it records why — all without asking, logged one line each in docs/DEVIATIONS.md. Red is only four things: the hard gates, a genuinely impossible outcome, having to fabricate a number, or two sessions with no progress on the same blocker.
A timebox per phase with a named consequence. Hitting it means shipping reduced, not stalling.
Two explicit fallbacks: P6-lite if Altana burns a day (our own allowlist + cap + expiry on RialtoRegistry, same UI, same revoke — forfeits the XP, keeps the main-track safety story), and the Redcell fallback above. Both cost nothing because you build against CharterService from the start.

DEVIATIONS.md is the piece I most want you to hold the bot to. It turns "what did it quietly skip" into a readable list.

One thing I'd push back on if you asked me to

GPT suggests asking the organisers about post-deadline changes. Do that. But don't let the ambiguity make you passive during 9–23 Sep. Data accrual is not shipping. An index staying fresh, new probes landing, sealed calls resolving, third-party owners self-listing through the claim rail, real people hiring — that's the product operating normally, and it's the only evidence you'll have for the "real-world usage" criterion BNB's press release named and their tracks page omitted. That survives either ruling, and almost every other team will be dark.

Files are updated. FORMS-AND-FUNDING.md has the paste-ready 8004scan answers, the allocation, and the ordered next hour. Start there, then paste P0.

Send me Codex's P0 report and its DEVIATIONS.md before it moves to P1. The reachable-service ratio in that report is the number that decides how hard you personally need to push on agent-owner outreach, and it's the one thing in this plan I can't predict for you.

Rialto master plan
Document·MD 
Agents
Document·MD 
Rialto build prompts
Document·MD 
Forms and funding
Document·MD 


...............................
...............................
...............................

THEN BELOW IS THE MOST UP TO DATE PLAN AS REGARDS THIS BUILD PLAN, SWITCHED BACK FROM RIALTO TO MARQUE, AS IT SEEMED MORE ALIGNED WITH THE BUILD...


note that i am okay with marque.. keeep the name, i already purchased a cheap domain url usemarque.xyz for $2 whihc is okay

Accepted. It's your call, you've paid for it, and the risk is manageable. But I want to make one structural change that materially reduces the collision, and it costs nothing.

Marque it is. All four documents are back to the name, usemarque.xyz is in them, and the naming section now records the collision honestly instead of pretending it isn't there.

The one change I kept from the rename, because it does real work:

The collision isn't the brand word. It's the primitive. That other project's entire pitch is an agent carrying a scoped, revocable budget. If we also call our scoped revocable budget "a marque," we're naming the identical concept with the identical word and anyone seeing both reads ours as derivative.

So: Marque is the venue. A Charter is the scoped session. A Warrant is the conformance certificate. Grant a charter, revoke a charter. Warranted for Health Factor, 5 Sep.

That drops the overlap from same concept, same word down to shared brand word, different sectors, different chains, which is ordinary and survivable. And it's better naming on its own merits — splitting the two ideas across two plain-English words reads more clearly than cramming both into one, and "grant a charter" is instantly legible to a judge who has never touched a session key.

Three rules now baked into AGENTS.md and enforced by a grep in P12:

marque is a proper noun and nothing else. Never "a marque," never "grant a marque," never "the Mark."
No wax-seal or hallmark logo. That's their mark, and they got there first. Our Seal stays as an interaction — the brass press on granting a charter — but the wordmark is typographic. If both the logo and the primitive matched theirs, "coincidence" would stop being available to us.
No "letter of marque" framing in public copy. Lead with the quality-mark half instead: warranted, held to a standard, stands behind its work. That's also the half that matches our actual wedge, so we lose nothing.

One optional five-minute thing: usemarque.xyz is fine and it cost you $2. If marque.market or marque.trade is under $15, grab one and point it at the same host. A two-word URL is slightly weak for something BNB might adopt as a standalone brand, and it's cheaper to fix before the README exists than after. Not worth more than five minutes, and it doesn't block anything — the display name lives in one constant either way.

Everything else from the last pass stands: the two data tiers, the conformance-versus-judgement split, the degradation ladder with timeboxes and the P6-lite and Redcell fallbacks, the funding numbers, and the Venus safety rule.

Point DNS at the VPS, submit the 8004scan form, register on the intake form, then paste P0 into Codex.

Marque master plan
Document·MD 

Then paste P0 into Codex.

One thing I want your call on before Day 2: I have written Redcell as an Archon port. If the Archon audit core is more entangled with Mantle than I am assuming, tell me now and I will restructure the TermiX security benchmark around a thinner approval-risk triage agent instead.



............................
.............................
..............................
SOME ESSENTIAL LINKS YOU CLAUDE OPUS 5 MIGHT NEED BUILDING MARQUE, WHEN YOU EVENTUALLY READ THROUGH THIS
[1]: https://zamantika.com/hi/BNBChainDevs/status/2091978856878297110 "https://zamantika.com/hi/BNBChainDevs/status/2091978856878297110"
[2]: https://minia2a.uk/hackathon/ "https://minia2a.uk/hackathon/"
[3]: https://www.agentmart.fun/ "https://www.agentmart.fun/"
[4]: https://8004scan.io/developers "https://8004scan.io/developers"
[5]: https://8004scan.io/agents/bsc/124714 "https://8004scan.io/agents/bsc/124714"
[6]: https://www.bnbchain.org/en/blog/bnb-chain-ai-agent-landscape-agents-tools-and-payments "https://www.bnbchain.org/en/blog/bnb-chain-ai-agent-landscape-agents-tools-and-payments"
[7]: https://www.bnbchain.org/en/hackathons/smart-money-era "https://www.bnbchain.org/en/hackathons/smart-money-era"
[8]: https://termix.ai/ "https://termix.ai/"
[9]: https://web3.okx.com/sv/learn/okx-ai "https://web3.okx.com/sv/learn/okx-ai"
[10]: https://www.okx.ai/agents/4453 "https://www.okx.ai/agents/4453"
[11]: https://www.bnbchain.org/en/blog/bnb-agent-studio-v2-your-agents-your-rules "https://www.bnbchain.org/en/blog/bnb-agent-studio-v2-your-agents-your-rules"
[12]: https://ng.linkedin.com/in/timokonkwo "https://ng.linkedin.com/in/timokonkwo"
[13]: https://www.agent.family/campaigns/bnb-build-the-era "https://www.agent.family/campaigns/bnb-build-the-era"
[14]: https://blog.pancakeswap.finance/articles/PancakeSwap-x-BNB-AI-Agent-Studio "https://blog.pancakeswap.finance/articles/PancakeSwap-x-BNB-AI-Agent-Studio"
[15]: https://docs.bnbchain.org/developer-kit/bnbchain-studio/quickstart/ "https://docs.bnbchain.org/developer-kit/bnbchain-studio/quickstart/"
[16]: https://docs.bnbchain.org/developer-kit/bnbchain-studio/cli-reference/ "https://docs.bnbchain.org/developer-kit/bnbchain-studio/cli-reference/"
[17]: https://www.bnbchain.org/en/bnb-agent-studio "https://www.bnbchain.org/en/bnb-agent-studio"
