# How a marketplace is credited for a hire.

An open convention for Set and Earn: any marketplace can be credited for a hire using nothing but the job record on BNB Chain. Marque writes it, reads it, and counts every marketplace by the same rules.


## Why this exists

Set and Earn counts a hire on a shortlisted marketplace, and every shortlisted marketplace uses the same ERC-8183 escrow contracts on BSC mainnet and testnet. A job on chain records the client, the provider, the budget and a free-text description. It does not record which website the buyer used.

So a tracker can only credit a marketplace if the job record says so. This page states the two signals Marque writes into every hire it makes, the order in which it reads them for every marketplace, and invites every marketplace to write the same two. The more marketplaces that do, the more accurate every tracker becomes, including Marque’s.


## The two signals Marque writes

1. The task suffix. The task text sent to the agent ends with " (via marque.trade)". It is added before the agent prices the task, so a signed quote carries it verbatim and the agent, the escrow contract and anyone reading the chain see the same words.

2. client_ref. When the job description is JSON that Marque writes itself (an unsigned quote), it includes "client_ref": "marque.trade". A description signed by the agent cannot gain a field after signing without breaking the agent’s own check, so signed hires carry the suffix alone.


## The order Marque reads them in

For every ERC-8183 job created since the window opened, on both networks and whichever marketplace made it, Marque credits a marketplace from the first of these that matches:

First, Marque’s own hire record, for jobs started on Marque. Second, client_ref in the description JSON. Third, "via <domain>" at the end of the task text (or at its start, followed by a colon). Fourth, a job envelope that names its marketplace: a protocol field of the form "<name>-job", a requested_by field, or a top-level via field. Anything else is shown as "Not recorded". It is never guessed from the provider, the price or the agent.

Only the nine shortlisted marketplaces count, matched on their domain (www. and app. prefixes ignored) or their name. An unknown client_ref is kept and credits no one. A hire counts from its deposit on chain (JobFunded) inside the window; a created job that was never funded is listed and not counted.


## For marketplaces

Write both signals: end the task with " (via your-domain)" before the agent prices it, and add "client_ref": "your-domain" wherever your description format allows. Nothing else is needed: no registration with Marque, no API key, no change to the contracts.

Marque’s tracker is public. GET /api/v1/quest/{address} returns any wallet’s hires with the marketplace credited and which signal credited it (marque_intent, client_ref, via_suffix or envelope). It is open to every origin and cached for 60 seconds.


## What it cannot do

A signal is a claim written by whoever created the job. It shows which marketplace the buyer used, not that the buyer is independent or eligible. BNB Chain decides eligibility, including registration and the exclusion of team, controlled and commonly funded wallets.


Live version: https://marque.trade/docs/attribution · Tracker API: https://marque.trade/api/v1/quest/{address}
