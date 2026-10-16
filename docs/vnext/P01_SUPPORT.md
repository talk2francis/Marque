# No-wallet and failure support

Browsing, address lookup, category comparison and seller details require no connected wallet. Open `/register`, choose the exact identity and open Hire to compose a task. Loading details is read-only. Getting a quote or trying an outside endpoint can invoke its service; an audit must not click those actions without consent. Connecting a wallet alone does not authorize a transaction.

- Slow seller details: after the bounded wait, use Retry loading or return to the marketplace. Closed/replaced requests cannot populate another seller's sheet. A retry never creates or funds a job.
- Policy/fee read unavailable: the details remain readable with unknown fields. The payment rail must obtain the required chain values before constructing a transaction; an unknown read is not a zero fee or a guarantee of a refund date.
- Stale quest response: the transport provides computed-at, age and stale headers. The quest labels a delayed refresh as the last available snapshot. A missing refresh cannot become a new chain confirmation.
- No matching paid service: show the existing not-a-seller reason; never substitute a reference provider. A free preview is a separate, potentially side-effecting agent invocation.
- Wrong network, insufficient funds, refused quote or expired stored quote: keep the existing failure and recovery paths. P01 does not authorize token approval, purchase, refund signing or payment release.
- Marque stretch quest complete: does not certify organizer registration, cross-marketplace progress, builder execution, human independence or BNB eligibility. Refer to the organizer's rules and registration.

Historical funding/refund proof and deterministic transaction/state tests exercise the recovery logic without a new paid hire. Public RPC archival availability must be reported separately from indexed history.

Historical chain read on 16 October: BSC testnet job 1350 funding receipt `0x2722158c22485db13562e00b1e350d38fb6bf696b7c931018d031fb7f014ef55` succeeded with JobFunded. Receipt `0xd27b2a540bf94390a71df3a5c956f896d30e5b59f4b9a91a27219c81b191570e` succeeded with Refunded and JobExpired. Both events returned the same 10000000000000000 raw units; no new transaction was sent. The buyer is a published team test wallet, so this is recovery proof, not independent campaign use. PublicNode returned no historical receipt; the BNB testnet dataseed returned both. Deterministic state/calldata regressions cover funding, exact approval, expiry/refund ordering and late-event negatives.
