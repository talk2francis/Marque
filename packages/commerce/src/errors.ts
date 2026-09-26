import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from 'viem'

/**
 * Every failure on the money path, mapped to a plain sentence and a next action
 * (AGENTS invariant 31: no raw library, RPC or contract text is ever rendered).
 * errors.test.ts proves every custom error in the AgenticCommerce, EvaluatorRouter and
 * OptimisticPolicy ABIs has an entry.
 */
export interface FriendlyError {
  code: string
  title: string
  action: string
  /** True when the user can simply try again. */
  retryable: boolean
}

const E = (code: string, title: string, action: string, retryable = false): FriendlyError => ({ code, title, action, retryable })

const INTERNAL = 'This is a problem on the contract side, not with your wallet. Nothing was charged. Contact support with the job number.'

export const CONTRACT_ERRORS: Readonly<Record<string, FriendlyError>> = {
  // AgenticCommerce
  BudgetMismatch: E('BudgetMismatch', 'The payment does not match the locked price.', 'Lock the price again, then pay the same amount.', true),
  EnforcedPause: E('EnforcedPause', 'The escrow contract is paused by BNB Chain.', 'No payment is possible right now. Try again later; your wallet was not charged.', true),
  ExpectedPause: E('ExpectedPause', 'The escrow contract is not in the expected state.', INTERNAL),
  ExpiryTooLong: E('ExpiryTooLong', 'The job would run longer than the escrow allows.', 'Start the hire again for a fresh job window.', true),
  ExpiryTooShort: E('ExpiryTooShort', 'The job window is too short to cover the review period.', 'Start the hire again; Marque will set a longer window.', true),
  InvalidJob: E('InvalidJob', 'This job does not exist on the escrow contract.', 'Refresh the page. If you just opened it, wait a few seconds for the chain.', true),
  ProviderAlreadySet: E('ProviderAlreadySet', 'This job already names an agent.', 'Open a new job instead.'),
  ProviderNotSet: E('ProviderNotSet', 'This job names no agent.', 'Open a new job from the agent\'s page.'),
  Unauthorized: E('Unauthorized', 'Only the wallet that opened this job can do that.', 'Switch to the wallet that opened the job.'),
  UnsupportedPaymentToken: E('UnsupportedPaymentToken', 'The escrow does not accept this token.', 'Ask the agent for a quote in USDT or U.'),
  WrongStatus: E('WrongStatus', 'The job has already moved on.', 'Refresh the job to see its current state.', true),
  ZeroAddress: E('ZeroAddress', 'An address in this request is empty.', INTERNAL),
  ZeroBudget: E('ZeroBudget', 'The price is zero.', 'Get a new quote before paying.', true),
  HookCallFailed: E('HookCallFailed', 'Buyer protection refused this step.', 'Refresh the job; the step may already be done.', true),
  HookMissingInterface: E('HookMissingInterface', 'The job was opened without buyer protection.', 'Cancel this job and open a new one from Marque.'),
  HookRequired: E('HookRequired', 'The job needs buyer protection attached first.', 'Turn on buyer protection, then continue.', true),
  FeeTooHigh: E('FeeTooHigh', 'The platform fee is out of range.', INTERNAL),
  SafeERC20FailedOperation: E('SafeERC20FailedOperation', 'The token transfer failed.', 'Check your balance and that the allowance equals the price, then pay again.', true),
  TokenHasNoCode: E('TokenHasNoCode', 'The payment token is not a contract on this network.', 'Switch to the network the quote names.'),
  ReentrancyGuardReentrantCall: E('ReentrancyGuardReentrantCall', 'The escrow rejected a nested call.', INTERNAL),
  // EvaluatorRouter
  HasInflightJobs: E('HasInflightJobs', 'The router is busy with other jobs.', INTERNAL),
  JobNotOpen: E('JobNotOpen', 'Buyer protection can only be attached before paying.', 'Refresh the job; if it is already paid, protection is already on.', true),
  NotCommerce: E('NotCommerce', 'The router refused a call that did not come from the escrow.', INTERNAL),
  NotDecided: E('NotDecided', 'The review window has not finished yet.', 'Payment is released automatically after the window closes.'),
  NotExpired: E('NotExpired', 'This job has not expired yet.', 'A refund becomes available after the date shown on the job.'),
  NotJobClient: E('NotJobClient', 'Only the wallet that opened this job can do that.', 'Switch to the wallet that opened the job.'),
  NotPaused: E('NotPaused', 'The router is not paused.', INTERNAL),
  PolicyAlreadySet: E('PolicyAlreadySet', 'Buyer protection is already on for this job.', 'Continue to the next step.', true),
  PolicyNotSet: E('PolicyNotSet', 'Buyer protection is not attached to this job.', 'Turn on buyer protection first.', true),
  PolicyNotWhitelisted: E('PolicyNotWhitelisted', 'That protection policy is not approved by BNB Chain.', INTERNAL),
  RouterNotEvaluator: E('RouterNotEvaluator', 'The job was opened without the escrow\'s evaluator.', 'Cancel this job and open a new one from Marque.'),
  RouterNotHook: E('RouterNotHook', 'The job was opened without buyer protection.', 'Cancel this job and open a new one from Marque.'),
  UnknownVerdict: E('UnknownVerdict', 'The review produced an unknown result.', INTERNAL),
  // OptimisticPolicy
  AlreadyDisputed: E('AlreadyDisputed', 'You already reported a problem with this delivery.', 'Voters will decide; watch the job page.'),
  AlreadyInitialised: E('AlreadyInitialised', 'Buyer protection is already set up.', 'Continue to the next step.', true),
  AlreadyVoted: E('AlreadyVoted', 'This wallet has already voted.', 'Nothing more to do.'),
  NotAdmin: E('NotAdmin', 'That action is for the policy administrator only.', INTERNAL),
  NotClient: E('NotClient', 'Only the wallet that paid for this job can report a problem.', 'Switch to the wallet that paid.'),
  NotDisputed: E('NotDisputed', 'There is no open dispute on this job.', 'Refresh the job.'),
  NotPendingAdmin: E('NotPendingAdmin', 'That action is for the policy administrator only.', INTERNAL),
  NotRouter: E('NotRouter', 'The policy refused a call that did not come from the router.', INTERNAL),
  NotSubmitted: E('NotSubmitted', 'The agent has not delivered yet.', 'You can report a problem once there is a delivery to review.'),
  NotVoter: E('NotVoter', 'That action is for dispute voters only.', INTERNAL),
  OutsideDisputeWindow: E('OutsideDisputeWindow', 'The review window for this delivery has closed.', 'Payment is now released to the agent.'),
  QuorumOutOfRange: E('QuorumOutOfRange', 'The policy configuration is invalid.', INTERNAL),
  QuorumZero: E('QuorumZero', 'The policy configuration is invalid.', INTERNAL),
  SubmissionTooLate: E('SubmissionTooLate', 'The agent delivered after the deadline.', 'You can reclaim your payment after the date shown on the job.'),
  UnknownVoter: E('UnknownVoter', 'That voter is not registered.', INTERNAL),
  VoterAlreadyExists: E('VoterAlreadyExists', 'That voter is already registered.', INTERNAL),
  WouldBreakQuorum: E('WouldBreakQuorum', 'That change would break the voting quorum.', INTERNAL),
  WrongJobStatus: E('WrongJobStatus', 'The job has already moved on.', 'Refresh the job to see its current state.', true),
  // Upgrade and ownership plumbing: never reachable from a buyer call, listed for completeness.
  AddressEmptyCode: E('AddressEmptyCode', 'A contract address is empty.', INTERNAL),
  ERC1967InvalidImplementation: E('ERC1967InvalidImplementation', 'Contract upgrade error.', INTERNAL),
  ERC1967NonPayable: E('ERC1967NonPayable', 'Contract upgrade error.', INTERNAL),
  FailedCall: E('FailedCall', 'An internal contract call failed.', INTERNAL),
  InvalidInitialization: E('InvalidInitialization', 'Contract setup error.', INTERNAL),
  NotInitializing: E('NotInitializing', 'Contract setup error.', INTERNAL),
  OwnableInvalidOwner: E('OwnableInvalidOwner', 'Contract ownership error.', INTERNAL),
  OwnableUnauthorizedAccount: E('OwnableUnauthorizedAccount', 'That action is for the contract owner only.', INTERNAL),
  UUPSUnauthorizedCallContext: E('UUPSUnauthorizedCallContext', 'Contract upgrade error.', INTERNAL),
  UUPSUnsupportedProxiableUUID: E('UUPSUnsupportedProxiableUUID', 'Contract upgrade error.', INTERNAL),
  // ERC-8004 ReputationRegistry (ratings)
  SelfFeedback: E('SelfFeedback', 'You cannot rate an agent you own or operate.', 'Ratings must come from a buyer.'),
}

export const WALLET_ERRORS: Readonly<Record<string, FriendlyError>> = {
  '4001': E('4001', 'You declined the request in your wallet.', 'Nothing was sent. Continue when you are ready.', true),
  '4100': E('4100', 'Your wallet has not allowed this site to ask for signatures.', 'Connect the wallet again and approve Marque.', true),
  '4900': E('4900', 'Your wallet is disconnected from the network.', 'Reconnect the wallet and try again.', true),
  '4901': E('4901', 'Your wallet is on a different network.', 'Switch to the network shown on the button.', true),
  '4902': E('4902', 'Your wallet does not have this network yet.', 'Approve adding BNB Smart Chain in your wallet, then continue.', true),
  '-32002': E('-32002', 'Your wallet already has a request waiting.', 'Open your wallet and finish or dismiss the pending request.', true),
  '-32603': E('-32603', 'Your wallet could not send the transaction.', 'Check you have a little BNB for gas, then try again.', true),
}

const GENERIC = E('unknown', 'Something went wrong before the transaction was sent.', 'Nothing was charged. Try again, and contact support if it keeps happening.', true)

/** Map any thrown value on the money path to plain words. Never returns raw error text. */
export function friendlyError(err: unknown): FriendlyError {
  if (err instanceof BaseError) {
    if (err.walk((e) => e instanceof UserRejectedRequestError)) return WALLET_ERRORS['4001']!
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null
    const name = revert?.data?.errorName
    if (name && CONTRACT_ERRORS[name]) return CONTRACT_ERRORS[name]
    // The deployed ReputationRegistry reverts with require("Self-feedback not allowed"),
    // not a custom error (measured on testnet, P2-04).
    if (revert?.reason && /self-feedback/i.test(revert.reason)) return CONTRACT_ERRORS['SelfFeedback']!
    if (revert?.reason && /insufficient|exceeds balance/i.test(revert.reason)) {
      return E('ERC20InsufficientBalance', 'Your token balance is too low for this payment.', 'Top up the token shown in the price, then pay again.', true)
    }
    if (revert?.reason && /allowance/i.test(revert.reason)) {
      return E('ERC20InsufficientAllowance', 'The escrow is not allowed to take this amount yet.', 'Approve exactly the price, then pay again.', true)
    }
  }
  const e = err as { code?: number | string; cause?: { code?: number | string }; message?: string; shortMessage?: string; name?: string } | null
  const code = String(e?.code ?? e?.cause?.code ?? '')
  if (WALLET_ERRORS[code]) return WALLET_ERRORS[code]
  const text = `${e?.shortMessage ?? ''} ${e?.message ?? ''}`
  if (/user (rejected|denied)|rejected the request/i.test(text)) return WALLET_ERRORS['4001']!
  if (/insufficient funds|gas required exceeds/i.test(text)) return E('insufficient_gas', 'Your wallet does not have enough BNB to pay the network fee.', 'Add a little BNB to this wallet, then try again.', true)
  if (/ERC20InsufficientBalance|transfer amount exceeds balance/i.test(text)) return E('ERC20InsufficientBalance', 'Your token balance is too low for this payment.', 'Top up the token shown in the price, then pay again.', true)
  if (/ERC20InsufficientAllowance|insufficient allowance/i.test(text)) return E('ERC20InsufficientAllowance', 'The escrow is not allowed to take this amount yet.', 'Approve exactly the price, then pay again.', true)
  if (/chain mismatch|does not match the target chain/i.test(text)) return WALLET_ERRORS['4901']!
  if (/self-feedback not allowed/i.test(text)) return CONTRACT_ERRORS['SelfFeedback']!
  const named = Object.keys(CONTRACT_ERRORS).find((n) => new RegExp(`\\b${n}\\b`).test(text))
  if (named) return CONTRACT_ERRORS[named]!
  return GENERIC
}
