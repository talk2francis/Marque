// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {SafeToken} from "../SafeToken.sol";

interface IERC20Lite {
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
}

/// @title CharterBase (Charters v2)
/// @notice What every charter shares: one immutable owner, an end date, an owner-only end that depends on nothing
/// else, who may act, and an optional keeper tip that is accounted apart from the charter's capital.
///
/// Money categories never mix: capital (what the charter moves for the owner, bounded per kind), tips (an optional
/// per-action reward paid from the owner's wallet to the agent that acted, bounded by `tipBudget`), network fees
/// (paid by whoever sends the transaction) and service fees (none on chain; an agent's price is a separate hire).
abstract contract CharterBase {
    using SafeToken for address;

    uint8 public constant KIND_LOAN_GUARD = 1;
    uint8 public constant KIND_YIELD_SWEEP = 2;
    uint8 public constant KIND_GRID_BAND = 3;
    uint8 public constant KIND_RANGE_KEEPER = 4;
    uint8 public constant MAX_EXECUTORS = 8;

    uint8 public immutable kind;
    uint8 public immutable version;
    address public immutable owner;
    address public immutable factory;
    uint64 public immutable createdAt;
    uint64 public immutable expiresAt;
    /// True when anyone may call act(): only for kinds whose every possible action is safe at any caller-chosen moment.
    bool public immutable openExecution;
    address public immutable tipToken;
    uint256 public immutable tipPerAction;
    uint256 public immutable tipBudget;

    uint256 public tipsPaid;
    uint32 public actions;
    bool public ended;
    uint8 public executorCount;
    mapping(address => bool) public isExecutor;
    uint256 private _lock = 1;

    struct Common {
        address owner;
        uint64 expiresAt;
        address tipToken;
        uint256 tipPerAction;
        uint256 tipBudget;
        address[] executors;
    }

    event Ended(address indexed by, uint64 at);
    event ExecutorSet(address indexed executor, bool allowed);
    event TipPaid(address indexed to, address indexed token, uint256 amount);
    event Swept(address indexed token, uint256 amount);

    error NotOwner();
    error NotExecutor(address caller);
    error CharterEnded();
    error CharterExpired();
    error Reentrant();
    error TooManyExecutors();

    modifier nonReentrant() {
        if (_lock != 1) revert Reentrant();
        _lock = 2;
        _;
        _lock = 1;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(uint8 kind_, uint8 version_, bool open_, Common memory c) {
        kind = kind_;
        version = version_;
        owner = c.owner;
        factory = msg.sender;
        createdAt = uint64(block.timestamp);
        expiresAt = c.expiresAt;
        openExecution = open_;
        tipToken = c.tipToken;
        tipPerAction = c.tipPerAction;
        tipBudget = c.tipBudget;
        if (c.executors.length > MAX_EXECUTORS) revert TooManyExecutors();
        for (uint256 i; i < c.executors.length; ++i) {
            if (!isExecutor[c.executors[i]] && c.executors[i] != address(0)) {
                isExecutor[c.executors[i]] = true;
                executorCount++;
                emit ExecutorSet(c.executors[i], true);
            }
        }
    }

    /// @notice Add or remove an agent allowed to act on a closed-execution charter. Owner only.
    function setExecutor(address who, bool allowed) external onlyOwner {
        if (isExecutor[who] == allowed) return;
        if (allowed) {
            if (executorCount >= MAX_EXECUTORS) revert TooManyExecutors();
            executorCount++;
        } else {
            executorCount--;
        }
        isExecutor[who] = allowed;
        emit ExecutorSet(who, allowed);
    }

    /// @notice End this charter for good. Owner only. Depends on no agent, relay, oracle or expiry. Kinds that hold
    /// something (Range Keeper holds one position NFT) return it in the same call when they can.
    function end() external onlyOwner nonReentrant {
        if (!ended) {
            ended = true;
            emit Ended(msg.sender, uint64(block.timestamp));
        }
        _afterEnd();
    }

    /// @notice Return any ERC-20 sent here by mistake. Owner only, to the owner only. Charters never hold tokens
    /// between transactions, so in normal use there is nothing to sweep.
    function sweep(address token) external onlyOwner nonReentrant {
        uint256 bal = IERC20Lite(token).balanceOf(address(this));
        if (bal != 0) token.safeTransfer(owner, bal);
        emit Swept(token, bal);
    }

    function live() public view returns (bool) {
        return !ended && block.timestamp < expiresAt;
    }

    function _afterEnd() internal virtual {}

    function _checkLive() internal view {
        if (ended) revert CharterEnded();
        if (block.timestamp >= expiresAt) revert CharterExpired();
    }

    function _checkCaller() internal view {
        if (!openExecution && msg.sender != owner && !isExecutor[msg.sender]) revert NotExecutor(msg.sender);
    }

    /// Pays the optional tip after a successful action, from what the owner's wallet still makes available. Never
    /// reverts the action: if the tip budget, allowance or balance is short it pays what it can, or nothing.
    function _payTip() internal returns (uint256 paid) {
        if (msg.sender == owner || tipPerAction == 0 || tipsPaid >= tipBudget) return 0;
        paid = tipPerAction;
        uint256 left = tipBudget - tipsPaid;
        if (left < paid) paid = left;
        uint256 a = IERC20Lite(tipToken).allowance(owner, address(this));
        if (a < paid) paid = a;
        uint256 b = IERC20Lite(tipToken).balanceOf(owner);
        if (b < paid) paid = b;
        if (paid == 0) return 0;
        tipsPaid += paid;
        tipToken.safeTransferFrom(owner, msg.sender, paid);
        emit TipPaid(msg.sender, tipToken, paid);
    }

    function _min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }
}
