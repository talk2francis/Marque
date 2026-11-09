// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {SafeToken} from "../SafeToken.sol";
import {CharterBase, IERC20Lite} from "../base/CharterBase.sol";
import {IVTokenSupply, IComptrollerSupply} from "../base/VenusSupply.sol";
import {IComptroller} from "../VenusInterfaces.sol";
import {HealthMath} from "../HealthMath.sol";

/// @title YieldSweep (Charters kind 2)
/// @notice Keeps the owner's wallet balance of one stablecoin between `floor` and `ceiling`, parking the excess in
/// Venus Core and bringing it back when the wallet runs low.
///
///  - Above `ceiling`: supply (balance - mid) with mintBehalf; the vTokens are minted straight to the owner.
///  - Below `floor`: pull just enough of the vTokens this charter supplied (vToken allowance), redeem them, send
///    the underlying to the owner, bringing the wallet back to mid. Limited by Venus's free cash: when Venus cannot
///    pay out, nothing happens and nothing is promised.
///  - mid = (floor + ceiling) / 2, and ceiling - floor >= 2 * minAction, so every action moves at least minAction
///    and a supply cannot be followed by a withdrawal until the wallet has really moved (hysteresis).
///  - Gross lifetime supply is capped (`supplyCap`); recycling does not reset it.
///  - Collateral markets. Venus counts supply in a market the owner has entered (including any market they borrow
///    from) as collateral: liquidators can seize it, and withdrawing it lowers loan health. By default
///    (`minHealthAfter == 0`) the charter holds in such a market and moves nothing. With `minHealthAfter` set (the
///    owner's explicit choice to let savings count as collateral), it supplies, and withdraws only when the loan
///    health after the withdrawal, read from Venus in the same transaction, stays at or above `minHealthAfter`.
///  - It only withdraws vTokens it supplied itself (`heldV`), never the owner's own earlier deposits.
/// Anyone may call act(): every action moves the owner's own money between the owner's wallet and the owner's own
/// Venus balance, at Venus's exchange rate, with no price to manipulate.
contract YieldSweep is CharterBase {
    using SafeToken for address;

    IComptrollerSupply public immutable comptroller;
    IVTokenSupply public immutable vToken;
    address public immutable token;
    uint256 public immutable floor;
    uint256 public immutable ceiling;
    uint256 public immutable minAction;
    uint256 public immutable supplyCap;
    uint256 public immutable minHealthAfter;

    uint256 public grossSupplied;
    uint256 public heldV;

    uint8 internal constant S_IN_BAND = 0;
    uint8 internal constant S_WOULD_SUPPLY = 1;
    uint8 internal constant S_WOULD_WITHDRAW = 2;
    uint8 internal constant S_ENDED = 3;
    uint8 internal constant S_EXPIRED = 4;
    uint8 internal constant S_COLLATERAL = 5; // owner uses this market as collateral: holding
    uint8 internal constant S_CAP_REACHED = 6; // lifetime supply cap, allowance or Venus supply cap
    uint8 internal constant S_LIQUIDITY_SHORT = 7; // Venus has too little free cash to pay out now
    uint8 internal constant S_NOTHING_HELD = 8; // below floor, but nothing this charter supplied is left
    uint8 internal constant S_HEALTH_LIMIT = 9; // collateral mode: a withdrawal would take health below the limit

    struct Params {
        address vToken;
        uint256 floor;
        uint256 ceiling;
        uint256 minAction;
        uint256 supplyCap;
        uint256 minHealthAfter;
    }

    event Supplied(address indexed caller, uint256 amount, uint256 vTokens, uint256 walletAfter, uint256 grossSupplied);
    event Withdrew(address indexed caller, uint256 amount, uint256 vTokens, uint256 walletAfter, uint256 heldV);

    error InBand(uint256 balance);
    error CollateralInUse();
    error HealthTooLow(uint256 healthAfter, uint256 minHealthAfter);
    error NothingToDo(uint8 reason);
    error VenusError(uint256 code);
    error TransferMismatch(uint256 received, uint256 expected);
    error Residual();

    constructor(Common memory c, IComptrollerSupply comptroller_, Params memory p, address token_)
        CharterBase(KIND_YIELD_SWEEP, 2, true, c)
    {
        comptroller = comptroller_;
        vToken = IVTokenSupply(p.vToken);
        token = token_;
        floor = p.floor;
        ceiling = p.ceiling;
        minAction = p.minAction;
        supplyCap = p.supplyCap;
        minHealthAfter = p.minHealthAfter;
    }

    function mid() public view returns (uint256) {
        return (floor + ceiling) / 2;
    }

    function act() external nonReentrant returns (bool supplied, uint256 amount) {
        _checkLive();
        bool collateral = comptroller.checkMembership(owner, address(vToken));
        if (collateral && minHealthAfter == 0) revert CollateralInUse();
        // If the owner redeemed some of what this charter supplied, forget it: never reach for later deposits.
        uint256 vb = vToken.balanceOf(owner);
        if (heldV > vb) heldV = vb;
        uint256 bal = IERC20Lite(token).balanceOf(owner);
        if (bal > ceiling) {
            amount = _supplyAmount(bal);
            if (amount < minAction) revert NothingToDo(S_CAP_REACHED);
            _supply(amount, bal);
            supplied = true;
        } else if (bal < floor) {
            amount = _withdraw(bal);
            if (collateral) {
                uint256 hf = HealthMath.read(IComptroller(address(comptroller)), owner).hf;
                if (hf < minHealthAfter) revert HealthTooLow(hf, minHealthAfter);
            }
        } else {
            revert InBand(bal);
        }
        _payTip();
    }

    function _supplyAmount(uint256 bal) internal view returns (uint256 amount) {
        amount = bal - mid();
        amount = _min(amount, supplyCap - grossSupplied);
        amount = _min(amount, IERC20Lite(token).allowance(owner, address(this)));
        amount = _min(amount, _venusHeadroom());
    }

    function _supply(uint256 amount, uint256 bal) internal {
        grossSupplied += amount;
        actions += 1;
        uint256 vBefore = vToken.balanceOf(owner);
        uint256 held = IERC20Lite(token).balanceOf(address(this));
        token.safeTransferFrom(owner, address(this), amount);
        uint256 received = IERC20Lite(token).balanceOf(address(this)) - held;
        if (received != amount) revert TransferMismatch(received, amount);
        token.forceApprove(address(vToken), amount);
        uint256 err = vToken.mintBehalf(owner, amount);
        if (err != 0) revert VenusError(err);
        token.forceApprove(address(vToken), 0);
        uint256 minted = vToken.balanceOf(owner) - vBefore;
        if (minted == 0) revert VenusError(type(uint256).max);
        heldV += minted;
        if (IERC20Lite(token).balanceOf(address(this)) != held) revert Residual();
        emit Supplied(msg.sender, amount, minted, bal - amount, grossSupplied);
    }

    function _withdraw(uint256 bal) internal returns (uint256 got) {
        uint256 rate = vToken.exchangeRateCurrent();
        uint256 vHeld = _min(heldV, _min(vToken.balanceOf(owner), vToken.allowance(owner, address(this))));
        if (vHeld == 0) revert NothingToDo(S_NOTHING_HELD);
        uint256 vWant = _ceilDiv((mid() - bal) * 1e18, rate);
        uint256 vCash = vToken.getCash() * 1e18 / rate;
        uint256 v = _min(vWant, _min(vHeld, vCash));
        if (v * rate / 1e18 < minAction && v != vHeld) {
            revert NothingToDo(v == vCash ? S_LIQUIDITY_SHORT : S_NOTHING_HELD);
        }
        if (v == 0) revert NothingToDo(S_LIQUIDITY_SHORT);

        heldV -= _min(heldV, v);
        actions += 1;
        uint256 held = IERC20Lite(token).balanceOf(address(this));
        address(vToken).safeTransferFrom(owner, address(this), v);
        uint256 err = vToken.redeem(v);
        if (err != 0) revert VenusError(err);
        got = IERC20Lite(token).balanceOf(address(this)) - held;
        token.safeTransfer(owner, got);
        if (vToken.balanceOf(address(this)) != 0) revert Residual();
        emit Withdrew(msg.sender, got, v, bal + got, heldV);
    }

    /// @notice What act() would do now, from stored Venus values.
    function preview() external view returns (uint8 state, uint256 amount, uint256 walletBalance, uint256 heldUnderlying) {
        walletBalance = IERC20Lite(token).balanceOf(owner);
        uint256 rate = vToken.exchangeRateStored();
        uint256 vHeld = _min(heldV, _min(vToken.balanceOf(owner), vToken.allowance(owner, address(this))));
        heldUnderlying = vHeld * rate / 1e18;
        if (ended) return (S_ENDED, 0, walletBalance, heldUnderlying);
        if (block.timestamp >= expiresAt) return (S_EXPIRED, 0, walletBalance, heldUnderlying);
        bool collateral = comptroller.checkMembership(owner, address(vToken));
        if (collateral && minHealthAfter == 0) return (S_COLLATERAL, 0, walletBalance, heldUnderlying);
        if (walletBalance > ceiling) {
            amount = _supplyAmount(walletBalance);
            return (amount < minAction ? S_CAP_REACHED : S_WOULD_SUPPLY, amount, walletBalance, heldUnderlying);
        }
        if (walletBalance >= floor) return (S_IN_BAND, 0, walletBalance, heldUnderlying);
        if (vHeld == 0) return (S_NOTHING_HELD, 0, walletBalance, heldUnderlying);
        uint256 cash = vToken.getCash();
        amount = _min(mid() - walletBalance, _min(heldUnderlying, cash));
        if (amount < minAction && amount != heldUnderlying) {
            return (cash < mid() - walletBalance ? S_LIQUIDITY_SHORT : S_NOTHING_HELD, amount, walletBalance, heldUnderlying);
        }
        // In collateral mode the health check runs in act(), after the withdrawal; the worker simulates first.
        state = S_WOULD_WITHDRAW;
    }

    function _venusHeadroom() internal view returns (uint256) {
        uint256 cap = comptroller.supplyCaps(address(vToken));
        if (cap == 0) return 0;
        uint256 total = vToken.totalSupply() * vToken.exchangeRateStored() / 1e18;
        if (total >= cap) return 0;
        // Written without a product so an unlimited cap (type(uint256).max, as Venus sets on BSC testnet) cannot overflow.
        uint256 room = cap - total;
        return room - room / 1000;
    }

    function _ceilDiv(uint256 a, uint256 b) internal pure returns (uint256) {
        return a == 0 ? 0 : (a - 1) / b + 1;
    }
}
