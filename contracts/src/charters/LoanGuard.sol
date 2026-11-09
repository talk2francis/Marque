// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20Min, IVToken, IComptroller, IPriceOracle} from "./VenusInterfaces.sol";
import {HealthMath} from "./HealthMath.sol";
import {SafeToken} from "./SafeToken.sol";
import {CharterRules} from "./CharterRules.sol";

/// @title LoanGuard (Marque charter, kind 1)
/// @notice One owner, one Venus Core debt market, one reserve token, one budget, one end date.
///
/// The reserve never leaves the owner's wallet until it is used. The owner gives this contract
/// an ordinary ERC-20 allowance. When, and only when, Venus itself reports the owner's loan
/// health below `trigger`, anyone may call act(): the guard pulls exactly enough of the debt
/// token to bring health back to `target` (never more than the remaining budget, the debt, the
/// allowance or the wallet balance) and repays the owner's own loan with repayBorrowBehalf.
///
/// There is no other destination, no admin, no upgrade, no owner change and no way to borrow,
/// redeem or move collateral. The worst a caller can do is make the owner's loan smaller, within
/// the budget, while Venus says it is below the trigger. The guard never spends on a loan it
/// cannot save: if even the largest repayment it may make would leave Venus health below 1.00,
/// it does nothing. The owner can end the charter at any time, independent of every server,
/// relay, oracle and expiry.
///
/// The guard checks its own rules when it is deployed (CharterRules), so a copy deployed outside
/// CharterFactory is bound to the same Venus Core comptroller, reviewed markets and bounds.
contract LoanGuard {
    using SafeToken for address;

    uint256 public constant KIND = 1; // Loan Guard
    uint256 public constant VERSION = 1;

    address public immutable owner;
    address public immutable factory;
    IComptroller public immutable comptroller;
    IVToken public immutable vDebt;
    address public immutable token;
    uint256 public immutable trigger; // health, 1e18
    uint256 public immutable target; // health, 1e18
    uint256 public immutable budget; // token units, lifetime, includes tips
    uint256 public immutable tip; // token units per act, paid only to a caller other than the owner
    uint64 public immutable expiresAt;
    uint64 public immutable createdAt;

    uint256 public spent;
    uint32 public acts;
    bool public ended;
    uint256 private _lock = 1;

    /// Preview states, in the order a reader should explain them.
    uint8 internal constant S_WATCHING = 0; // armed, health at or above trigger
    uint8 internal constant S_WOULD_ACT = 1; // health below trigger and funds available
    uint8 internal constant S_ENDED = 2;
    uint8 internal constant S_EXPIRED = 3;
    uint8 internal constant S_NO_DEBT = 4; // nothing borrowed in this market
    uint8 internal constant S_NO_FUNDS = 5; // below trigger, but budget, allowance or balance is empty
    uint8 internal constant S_CANNOT_RESCUE = 6; // below 1.00, and the most it may repay would not lift it to 1.00

    event Acted(
        address indexed caller,
        uint256 repaid,
        uint256 tipPaid,
        uint256 healthBefore,
        uint256 healthAfter,
        uint256 debtBefore,
        uint256 debtAfter,
        uint256 spentTotal
    );
    event Ended(address indexed by, uint64 at);
    event Swept(address indexed token, uint256 amount);

    error NotOwner();
    error CharterEnded();
    error CharterExpired();
    error Healthy(uint256 health, uint256 trigger);
    error NoDebtInMarket();
    error NothingAvailable();
    error VenusError(uint256 code);
    error TransferMismatch(uint256 received, uint256 expected);
    error RepayNotApplied(uint256 debtBefore, uint256 debtAfter, uint256 amount);
    error Residual(uint256 balance);
    error Reentrant();
    error CannotRescue(uint256 health, uint256 repayable);
    error ZeroOwner();

    modifier nonReentrant() {
        if (_lock != 1) revert Reentrant();
        _lock = 2;
        _;
        _lock = 1;
    }

    constructor(
        address owner_,
        IComptroller comptroller_,
        IVToken vDebt_,
        address token_,
        uint256 trigger_,
        uint256 target_,
        uint256 budget_,
        uint256 tip_,
        uint64 expiresAt_
    ) {
        // The guard enforces its own rules, whoever deploys it (L-1 in the independent review).
        if (owner_ == address(0)) revert ZeroOwner();
        address canonical = CharterRules.comptrollerFor(block.chainid);
        if (canonical != address(0)) {
            if (address(comptroller_) != canonical) {
                revert CharterRules.WrongComptroller(address(comptroller_));
            }
            if (!CharterRules.reviewedMarket(block.chainid, address(vDebt_))) {
                revert CharterRules.UnsupportedMarket(address(vDebt_));
            }
        }
        (bool listed,,) = comptroller_.markets(address(vDebt_));
        if (!listed || vDebt_.comptroller() != address(comptroller_)) {
            revert CharterRules.UnsupportedMarket(address(vDebt_));
        }
        if (vDebt_.underlying() != token_) revert CharterRules.WrongToken(token_);
        CharterRules.checkBounds(trigger_, target_, budget_, tip_, expiresAt_, block.timestamp);

        owner = owner_;
        factory = msg.sender;
        comptroller = comptroller_;
        vDebt = vDebt_;
        token = token_;
        trigger = trigger_;
        target = target_;
        budget = budget_;
        tip = tip_;
        expiresAt = expiresAt_;
        createdAt = uint64(block.timestamp);
    }

    /// @notice Protect the owner's loan if, and only if, Venus says it needs it. Callable by anyone.
    /// @return repaid Debt-token units repaid on the owner's behalf.
    function act() external nonReentrant returns (uint256 repaid) {
        if (ended) revert CharterEnded();
        if (block.timestamp >= expiresAt) revert CharterExpired();

        uint256 err = vDebt.accrueInterest();
        if (err != 0) revert VenusError(err);

        HealthMath.Health memory h = HealthMath.read(comptroller, owner);
        if (h.hf >= trigger) revert Healthy(h.hf, trigger);

        uint256 debtBefore = vDebt.borrowBalanceStored(owner);
        if (debtBefore == 0) revert NoDebtInMarket();

        uint256 price = IPriceOracle(comptroller.oracle()).getUnderlyingPrice(address(vDebt));
        if (price == 0) revert HealthMath.PriceUnavailable(address(vDebt));

        uint256 left = budget - spent;
        uint256 avail =
            _min(IERC20Min(token).allowance(owner, address(this)), IERC20Min(token).balanceOf(owner));
        repaid = _min(_min(HealthMath.repayToTarget(h, target, price), debtBefore), _min(left, avail));
        if (repaid == 0) revert NothingAvailable();
        if (!_rescues(h, repaid, price)) revert CannotRescue(h.hf, repaid);

        // Repayment always comes first; a tip is paid only from what is left, never to the owner, and never
        // more than the repayment it rewards (so a dust repayment in this market cannot collect a full tip).
        uint256 tipPaid =
            msg.sender == owner ? 0 : _min(_min(tip, repaid), _min(left - repaid, avail - repaid));

        spent += repaid + tipPaid;
        acts += 1;

        uint256 held = IERC20Min(token).balanceOf(address(this));
        token.safeTransferFrom(owner, address(this), repaid);
        uint256 received = IERC20Min(token).balanceOf(address(this)) - held;
        if (received != repaid) revert TransferMismatch(received, repaid);

        token.forceApprove(address(vDebt), repaid);
        err = vDebt.repayBorrowBehalf(owner, repaid);
        if (err != 0) revert VenusError(err);
        token.forceApprove(address(vDebt), 0);

        uint256 debtAfter = vDebt.borrowBalanceStored(owner);
        if (debtAfter + repaid > debtBefore + 1) revert RepayNotApplied(debtBefore, debtAfter, repaid);
        uint256 still = IERC20Min(token).balanceOf(address(this));
        if (still != held) revert Residual(still);

        if (tipPaid != 0) token.safeTransferFrom(owner, msg.sender, tipPaid);

        uint256 hfAfter = HealthMath.read(comptroller, owner).hf;
        emit Acted(msg.sender, repaid, tipPaid, h.hf, hfAfter, debtBefore, debtAfter, spent);
    }

    /// @notice End this charter for good. Owner only. Works at any time, including after expiry,
    /// and depends on nothing but this contract. Clearing the token allowance is a separate,
    /// optional transaction on the token itself.
    function end() external {
        if (msg.sender != owner) revert NotOwner();
        if (!ended) {
            ended = true;
            emit Ended(msg.sender, uint64(block.timestamp));
        }
    }

    /// @notice Return any token that was sent to this address by mistake. Owner only, to the owner only.
    function sweep(address anyToken) external nonReentrant {
        if (msg.sender != owner) revert NotOwner();
        uint256 bal = IERC20Min(anyToken).balanceOf(address(this));
        if (bal != 0) anyToken.safeTransfer(owner, bal);
        emit Swept(anyToken, bal);
    }

    /// @notice What act() would do right now, from stored Venus values (interest not yet accrued).
    /// The product reads this; the number a user sees is the number the guard acts on.
    function preview()
        external
        view
        returns (
            uint8 state,
            uint256 health,
            uint256 wouldRepay,
            uint256 tipIfAgent,
            uint256 available,
            uint256 debt
        )
    {
        uint256 left = budget - spent;
        available = _min(
            left, _min(IERC20Min(token).allowance(owner, address(this)), IERC20Min(token).balanceOf(owner))
        );
        // An ended or expired charter answers without touching Venus, so it reads even when Venus does not
        // (health and debt are then 0: not read).
        if (ended) return (S_ENDED, 0, 0, 0, available, 0);
        if (block.timestamp >= expiresAt) return (S_EXPIRED, 0, 0, 0, available, 0);
        HealthMath.Health memory h = HealthMath.read(comptroller, owner);
        health = h.hf;
        debt = vDebt.borrowBalanceStored(owner);
        if (debt == 0) return (S_NO_DEBT, health, 0, 0, available, debt);
        if (h.hf >= trigger) return (S_WATCHING, health, 0, 0, available, debt);
        uint256 price = IPriceOracle(comptroller.oracle()).getUnderlyingPrice(address(vDebt));
        if (price == 0) revert HealthMath.PriceUnavailable(address(vDebt));
        wouldRepay = _min(_min(HealthMath.repayToTarget(h, target, price), debt), available);
        if (wouldRepay == 0) return (S_NO_FUNDS, health, 0, 0, available, debt);
        if (!_rescues(h, wouldRepay, price)) return (S_CANNOT_RESCUE, health, 0, 0, available, debt);
        tipIfAgent = _min(_min(tip, wouldRepay), available - wouldRepay);
        state = S_WOULD_ACT;
    }

    function remaining() external view returns (uint256) {
        return budget - spent;
    }

    /// Does repaying `amount` lift health to at least 1.00? Always true at or above 1.00. Below it, the repayment's
    /// value must cover the deficit; the debt sum falls by at least floor(price * amount / 1e18) (the review's
    /// proof of invariant 4), so this check passing means health after is at least 1.00.
    function _rescues(HealthMath.Health memory h, uint256 amount, uint256 price) private pure returns (bool) {
        if (h.collateralUsd >= h.debtUsd) return true;
        return price * amount / 1e18 >= h.debtUsd - h.collateralUsd;
    }

    function _min(uint256 a, uint256 b) private pure returns (uint256) {
        return a < b ? a : b;
    }
}
