# Campaign and local product boundaries

Checked 16 October 2026 against [BNB's campaign rules](https://www.bnbchain.org/en/hackathons/smart-money-era-set-and-earn) and [1 October announcement](https://www.bnbchain.org/en/blog/set-and-earn-hire-and-build-ai-agents-on-bnb-chain-win).

| Topic | Organizer rule | Marque local scope |
|---|---|---|
| Hire | Register first; 3 distinct agents over at least 2 shortlisted marketplaces; hire event, not approval; chains 56/97 | Four categories, funded jobs, submitted work and ratings; Marque intent required |
| Build | Owned/listed, discoverable, responsive, 3 completed hires from independently funded buyers, 5 actions over 3 days, category-consistent execution; public repository | Five advisory listing checks; MCS, listing and commercial availability are separate |
| Eligibility | Team exclusion; one person/wallet; no controlled or commonly funded buyers or circular activity | Published team flags are preserved; address differences do not prove independence |
| Dates | 1 Oct to 5 Nov 2026, cutoff 12:00 UTC | Earlier 30 Sep launch plans are historical; exact qualifying X-announcement timestamp remains UNKNOWN |

Nine shortlisted marketplaces, as published on BNB Chain's campaign page (the attribution list is `SHORTLIST` in packages/commerce/src/campaign-rules.ts). Organizer review is final. Marque cannot verify external registration, all-marketplace activity or human/funding independence. No wallet enrollment or qualification certification is added.

JobSubmitted records submission; JobCompleted records completion; PaymentReleased establishes released payment. Local completion labels and escrow funding links must not conflate these events. Verified-buyer ratings remain separate from general ERC-8004 feedback.

P01A remains required for quote expiry/state truth and observational builder GETs before a release or P02. The legacy category `done` flag still records funding; the UI now names funded/submitted/completed/payment-released stages explicitly, and offers rating only after submission. Full local completion still needs bound ratings in every category and a listing. No campaign rules, four-category quest computation, team list or historical records are rewritten in P01.

Operator figures remain owner-address/endpoint groupings. Visible category guidance and ranking explanations now state that these are inferences, with no proof of distinct people or funding. Unknown owners remain counted per identity in the existing coverage projection; this counting behavior is disclosed rather than silently redefined.
