/** Generated from docs/advantage/v2/results.json (advantage-v2.test.ts keeps them identical). Do not edit by hand. */
export const ADVANTAGE_V2 = {
  "spec": "docs/advantage/v2/spec.json",
  "specKeccak256": "0x8d851c9c5ee0a25ea56aceb8f9b29462e107a618ba4a9896fda5bb6f6c55e081",
  "lockTx": "0x019209c0e7520487b8ec32d68656022c1cf6efe216c48a99189ba475f24aee2c",
  "lockChainId": 97,
  "lockBlock": "139003156",
  "ranAt": "2026-10-26T09:19:40Z",
  "funder": "Marque team (test)",
  "wallet": "0x5aC2448FC79Ef8d33710b1Bced5AEff90138b452",
  "budgetSwap": {
    "chainId": 56,
    "wallet": "0x5aC2448FC79Ef8d33710b1Bced5AEff90138b452",
    "approve": "0x924d792a8191372026c3519fa2a88b8e3fddd9ab74db455244e6f6a56002295c",
    "swap": "0xf50ae20ee9eeeba002656374ea746914af56e7954c33595e76df9b91b7b6cc88",
    "amountInUSDT": "0.25",
    "quotedU": "0.249888631364980387",
    "uBalanceAfter": "0.329888631364980387"
  },
  "tasks": [
    {
      "id": "T1-health-factor",
      "agent": "Keel",
      "jobId": "57093",
      "chainId": 56,
      "price": "0.05 U",
      "feesBnb": "0.00007002315",
      "deliveredSeconds": 20,
      "fileMatchesHash": true,
      "terms": {
        "met": 3,
        "of": 3,
        "unchecked": 0,
        "source": "signed by the agent"
      },
      "answerBlock": "129872453",
      "outcome": "win",
      "baseline": {
        "arm": "manual",
        "status": "not run",
        "reason": "No person recorded the manual arm for this run."
      },
      "versusBaseline": "Not compared: the manual arm was not run."
    },
    {
      "id": "T2-yield",
      "agent": "Sluicegate",
      "jobId": "57094",
      "chainId": 56,
      "price": "0.10 U",
      "feesBnb": "0.00006628195",
      "deliveredSeconds": 27,
      "fileMatchesHash": true,
      "terms": {
        "met": 3,
        "of": 3,
        "unchecked": 0,
        "source": "signed by the agent"
      },
      "answerBlock": "129872563",
      "outcome": "win",
      "baseline": {
        "arm": "do-nothing",
        "status": "compared",
        "value": "0 percent on idle USDT"
      },
      "versusBaseline": "Ahead: Venus USDT supply at 3.51 percent net, matching Marque's read at the answer's block (3.515 percent), against 0 percent idle."
    },
    {
      "id": "T3-rebalancing",
      "agent": "Bound",
      "jobId": "57095",
      "chainId": 56,
      "price": "0.15 U",
      "feesBnb": "0.00007002315",
      "deliveredSeconds": 35,
      "fileMatchesHash": true,
      "terms": {
        "met": 3,
        "of": 4,
        "unchecked": 1,
        "source": "signed by the agent"
      },
      "answerBlock": "129872677",
      "outcome": "mixed",
      "baseline": {
        "arm": "do-nothing",
        "status": "not compared",
        "reason": "The rule claims a gain over doing nothing only when every rubric line is met; one line was undecided."
      },
      "versusBaseline": "Not claimed: 'In-range status matches the pool's current tick' could not be decided. Bound's answer says the position is in range but does not state its current bounds, and Marque's check takes those bounds from the answer rather than reading them from chain. The other three lines were met.",
      "undecided": [
        "In-range status matches the pool's current tick"
      ]
    }
  ],
  "summary": {
    "win": 2,
    "mixed": 1,
    "loss": 0,
    "notRun": [
      "T1 manual arm"
    ]
  },
  "doesNotShow": [
    "Three jobs are three samples, not a ranking: it says these three answers met their written terms on this day, not that the agents will always.",
    "All three agents are Marque's own reference agents, hired by a Marque team wallet. It shows the method working end to end, not independent demand.",
    "No person did the manual arm, so it shows nothing about agents against people for these tasks.",
    "The rubric checks facts with one right answer. It does not grade whether the advice was wise, and no money moved on the strength of these answers.",
    "T3 is mixed because Marque's own check could not decide one line (it reads the position's current bounds from the answer, which did not state them); that is a gap in the check, reported as the rule requires, not a success."
  ]
} as const
