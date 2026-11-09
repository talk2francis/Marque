// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20Min, IVToken, IComptroller, IPriceOracle} from "../VenusInterfaces.sol";
import {HealthMath} from "../HealthMath.sol";
import {SafeToken} from "../SafeToken.sol";
import {CharterBase} from "../base/CharterBase.sol";

/// @title LoanGuardV2 (Charters kind 1, version 2)
/// @notice Repays the owner's own Venus Core loan from the owner's own wallet when, and only when, Venus reports
/// the loan's health below `trigger`; repays exactly enough to reach `target`.
///
/// Changes from v1 (deployed 9 Nov 2026 at 0x4542...b761 on 56, kept as history):
///  - tips are accounted apart from capital: `budget` is repayment only, `tipBudget` is tips only;
///  - `minRepay`: an action smaller than this reverts unless it pays the market debt off, so an exhausted
///    allowance or balance cannot produce a stream of uneconomic dust repayments;
///  - shared CharterBase (end, sweep, executors, tips) and a kind-wide event shape.
/// Unchanged: Venus decides (getAccountLiquidity in the same transaction), one destination, permissionless act().
contract LoanGuardV2 is CharterBase {
    using SafeToken for address;

    IComptroller public immutable comptroller;
    IVToken public immutable vDebt;
    address public immutable token;
    uint256 public immutable trigger;
    uint256 public immutable target;
    uint256 public immutable budget;
    uint256 public immutable minRepay;

    uint256 public spent;

    uint8 internal constant S_WATCHING = 0;
    uint8 internal constant S_WOULD_ACT = 1;
    uint8 internal constant S_ENDED = 2;
    uint8 internal constant S_EXPIRED = 3;
    uint8 internal constant S_NO_DEBT = 4;
    uint8 internal constant S_NO_FUNDS = 5;
    uint8 internal constant S_BELOW_MIN = 6;

    struct Params {
        address vDebt;
        uint256 trigger;
        uint256 target;
        uint256 budget;
        uint256 minRepay;
    }

    event Repaid(
        address indexed caller,
        uint256 repaid,
        uint256 healthBefore,
        uint256 healthAfter,
        uint256 debtBefore,
        uint256 debtAfter,
        uint256 spentTotal
    );

    error Healthy(uint256 health, uint256 trigger);
    error NoDebtInMarket();
    error NothingAvailable();
    error BelowMinimum(uint256 repay, uint256 minRepay);
    error VenusError(uint256 code);
    error TransferMismatch(uint256 received, uint256 expected);
    error RepayNotApplied(uint256 debtBefore, uint256 debtAfter, uint256 amount);
    error Residual(uint256 balance);

    constructor(Common memory c, IComptroller comptroller_, Params memory p, address token_)
        CharterBase(KIND_LOAN_GUARD, 2, true, c)
    {
        comptroller = comptroller_;
        vDebt = IVToken(p.vDebt);
        token = token_;
        trigger = p.trigger;
        target = p.target;
        budget = p.budget;
        minRepay = p.minRepay;
    }

    /// @notice Protect the owner's loan if Venus says it needs it. Anyone may call.
    function act() external nonReentrant returns (uint256 repaid) {
        _checkLive();
        uint256 err = vDebt.accrueInterest();
        if (err != 0) revert VenusError(err);

        HealthMath.Health memory h = HealthMath.read(comptroller, owner);
        if (h.hf >= trigger) revert Healthy(h.hf, trigger);
        uint256 debtBefore = vDebt.borrowBalanceStored(owner);
        if (debtBefore == 0) revert NoDebtInMarket();
        uint256 price = IPriceOracle(comptroller.oracle()).getUnderlyingPrice(address(vDebt));
        if (price == 0) revert HealthMath.PriceUnavailable(address(vDebt));

        repaid = _min(
            _min(HealthMath.repayToTarget(h, target, price), debtBefore),
            _min(budget - spent, _available())
        );
        if (repaid == 0) revert NothingAvailable();
        if (repaid < minRepay && repaid != debtBefore) revert BelowMinimum(repaid, minRepay);

        spent += repaid;
        actions += 1;

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

        uint256 hfAfter = HealthMath.read(comptroller, owner).hf;
        emit Repaid(msg.sender, repaid, h.hf, hfAfter, debtBefore, debtAfter, spent);
        _payTip();
    }

    /// @notice What act() would do now, from stored Venus values (interest not yet accrued).
    function preview()
        external
        view
        returns (uint8 state, uint256 health, uint256 wouldRepay, uint256 available, uint256 debt)
    {
        HealthMath.Health memory h = HealthMath.read(comptroller, owner);
        health = h.hf;
        debt = vDebt.borrowBalanceStored(owner);
        available = _min(budget - spent, _available());
        if (ended) return (S_ENDED, health, 0, available, debt);
        if (block.timestamp >= expiresAt) return (S_EXPIRED, health, 0, available, debt);
        if (debt == 0) return (S_NO_DEBT, health, 0, available, debt);
        if (h.hf >= trigger) return (S_WATCHING, health, 0, available, debt);
        uint256 price = IPriceOracle(comptroller.oracle()).getUnderlyingPrice(address(vDebt));
        wouldRepay = _min(_min(HealthMath.repayToTarget(h, target, price), debt), available);
        if (wouldRepay == 0) return (S_NO_FUNDS, health, 0, available, debt);
        if (wouldRepay < minRepay && wouldRepay != debt) return (S_BELOW_MIN, health, wouldRepay, available, debt);
        state = S_WOULD_ACT;
    }

    function remaining() external view returns (uint256) {
        return budget - spent;
    }

    /// What the owner's wallet makes usable right now: the smaller of allowance and balance. An allowance is a
    /// ceiling, not a reservation; other charters and the owner can spend the same balance first.
    function _available() internal view returns (uint256) {
        return _min(IERC20Min(token).allowance(owner, address(this)), IERC20Min(token).balanceOf(owner));
    }
}
