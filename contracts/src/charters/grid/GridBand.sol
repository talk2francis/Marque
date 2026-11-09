// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {SafeToken} from "../SafeToken.sol";
import {CharterBase, IERC20Lite} from "../base/CharterBase.sol";
import {IPancakeV3Pool} from "../base/PancakeInterfaces.sol";
import {PoolOracle} from "../lib/PoolOracle.sol";
import {TickMathLite} from "../lib/TickMathLite.sol";

/// @title GridBand (Charters kind 3)
/// @notice A bounded buy-low, sell-one-step-higher grid on one PancakeSwap v3 pool, trading straight from and to the
/// owner's wallet. Funds never rest in this contract: the pool's swap callback pulls the input from the owner, and
/// the pool sends the output to the owner.
///
/// Grid. Prices are measured in "base ticks" bt: the pool tick, negated when the base token is token1, so a higher
/// bt always means a higher price of base in quote. Levels L_k = lowerBt + k * stepTicks, k = 0..slots. Slot s
/// spans [L_s, L_{s+1}] and is either EMPTY (waiting to buy `orderQuote` of quote worth of base when the price falls
/// to L_s) or FULL (holding the base it bought, waiting to sell exactly that base when the price rises to L_{s+1}).
/// A slot fires again only after its other half completes: buy, sell, buy, sell. Slots that start above the price
/// at creation start FULL with `baseOrder` of the owner's base (two-sided), or must not exist (buy-only).
///
/// Economic boundary, enforced on chain:
///  - decisions use the pool's TWAP over `twapWindow`, never the spot price;
///  - the spot tick must be within `maxDeviation` ticks of the TWAP, or nothing trades;
///  - the swap carries a hard price limit `slipTicks` beyond the TWAP in the adverse direction, so the average
///    execution price is never worse than TWAP * 1.0001^slipTicks (buys) or TWAP / 1.0001^slipTicks (sells);
///  - stepTicks >= 2 * (slipTicks + feeTicks) + 2 (checked by the factory), so every completed buy-then-sell
///    round trip returns at least the quote it spent, even with both legs filled at their worst allowed price;
///  - gross lifetime caps: quote spent on buys <= buyCap, base sold <= sellCap. Proceeds recycled into new buys
///    count again: turnover, not net position, is what is capped.
/// Closed execution: only the owner and the executors the owner named may act, because a swap's timing is worth
/// something to whoever chooses it. The bound above holds for any caller, executors included.
contract GridBand is CharterBase {
    using SafeToken for address;

    IPancakeV3Pool public immutable pool;
    address public immutable base;
    address public immutable quote;
    bool public immutable baseIsToken0;
    int24 public immutable lowerBt;
    int24 public immutable stepTicks;
    uint8 public immutable slots;
    uint256 public immutable orderQuote;
    uint256 public immutable buyCap;
    uint256 public immutable sellCap;
    uint32 public immutable twapWindow;
    uint24 public immutable maxDeviation;
    uint24 public immutable slipTicks;
    uint16 public immutable minFillBps;

    uint256 public quoteSpent;
    uint256 public baseSold;
    /// 0 = EMPTY (waiting to buy); otherwise FULL, holding this much base to sell.
    mapping(uint256 => uint256) public slotBase;
    /// Base each slot held when it last became FULL (bought, or placed at creation); the yardstick for sell dust.
    mapping(uint256 => uint256) public slotOrder;

    address private _payToken;
    uint256 private _payMax;

    uint8 internal constant S_IDLE = 0;
    uint8 internal constant S_WOULD_BUY = 1;
    uint8 internal constant S_WOULD_SELL = 2;
    uint8 internal constant S_ENDED = 3;
    uint8 internal constant S_EXPIRED = 4;
    uint8 internal constant S_UNSETTLED = 5;
    uint8 internal constant S_NO_FUNDS = 6;

    struct Params {
        address pool;
        address base;
        int24 lowerBt;
        int24 stepTicks;
        uint8 slots;
        uint256 orderQuote;
        uint256 baseOrder;
        uint256 buyCap;
        uint256 sellCap;
        uint32 twapWindow;
        uint24 maxDeviation;
        uint24 slipTicks;
        uint16 minFillBps;
    }

    event Traded(
        address indexed caller,
        uint256 indexed slot,
        bool buy,
        uint256 amountIn,
        uint256 amountOut,
        int24 twapTick,
        int24 spotTickBefore,
        int24 spotTickAfter
    );

    error NothingToDo();
    error FillTooSmall(uint256 filled, uint256 wanted);
    error BadCallback();

    /// @param fullFrom first slot index that starts FULL with p.baseOrder (== slots when none do)
    constructor(Common memory c, Params memory p, address quote_, bool baseIsToken0_, uint8 fullFrom)
        CharterBase(KIND_GRID_BAND, 2, false, c)
    {
        pool = IPancakeV3Pool(p.pool);
        base = p.base;
        quote = quote_;
        baseIsToken0 = baseIsToken0_;
        lowerBt = p.lowerBt;
        stepTicks = p.stepTicks;
        slots = p.slots;
        orderQuote = p.orderQuote;
        buyCap = p.buyCap;
        sellCap = p.sellCap;
        twapWindow = p.twapWindow;
        maxDeviation = p.maxDeviation;
        slipTicks = p.slipTicks;
        minFillBps = p.minFillBps;
        for (uint256 s = fullFrom; s < p.slots; ++s) {
            slotBase[s] = p.baseOrder;
            slotOrder[s] = p.baseOrder;
        }
    }

    function level(uint256 k) public view returns (int24) {
        return int24(int256(lowerBt) + int256(k) * stepTicks);
    }

    /// @notice Make the next grid trade, if the TWAP says one is due. Owner or named executors only.
    function act() external nonReentrant returns (uint256 slot, bool buy, uint256 amountIn, uint256 amountOut) {
        _checkLive();
        _checkCaller();
        (int24 twap, int24 spot) = PoolOracle.settled(pool, twapWindow, maxDeviation);
        bool found;
        (found, slot, buy, amountIn) = _next(_bt(twap));
        if (!found) revert NothingToDo();

        actions += 1;
        uint256 wanted = amountIn;
        // An allowance is a ceiling, not a reservation: trade only what the owner's wallet still makes available.
        address tokenIn = buy ? quote : base;
        amountIn = _min(amountIn, _min(IERC20Lite(tokenIn).allowance(owner, address(this)), IERC20Lite(tokenIn).balanceOf(owner)));
        if (amountIn * 10_000 < wanted * minFillBps) revert FillTooSmall(amountIn, wanted);
        (amountIn, amountOut) = _swap(buy, amountIn, twap);
        if (amountIn * 10_000 < wanted * minFillBps) revert FillTooSmall(amountIn, wanted);

        if (buy) {
            // A buy that returned no base would leave the slot empty and buy again: refuse it.
            if (amountOut == 0) revert FillTooSmall(0, wanted);
            quoteSpent += amountIn;
            slotBase[slot] = amountOut;
            slotOrder[slot] = amountOut;
        } else {
            baseSold += amountIn;
            uint256 rest = slotBase[slot] - amountIn;
            // A sell that stopped at the price limit keeps the rest for later, unless the rest is dust.
            // Dust is measured against the slot's whole order, so partial sells cannot repeat down to nothing.
            slotBase[slot] = rest * 20 < slotOrder[slot] ? 0 : rest;
        }
        emit Traded(msg.sender, slot, buy, amountIn, amountOut, twap, spot, PoolOracle.spotTick(pool));
        _payTip();
    }

    /// Sells first (lowest FULL slot whose sell level the TWAP has reached), then buys (highest EMPTY slot whose buy
    /// level the TWAP has fallen to). Amounts are bounded by the lifetime caps.
    function _next(int24 bt) internal view returns (bool found, uint256 slot, bool buy, uint256 amount) {
        for (uint256 s; s < slots; ++s) {
            uint256 held = slotBase[s];
            if (held != 0 && bt >= level(s + 1)) {
                uint256 room = sellCap - baseSold;
                if (room == 0) break;
                return (true, s, false, _min(held, room));
            }
        }
        uint256 left = buyCap - quoteSpent;
        if (left == 0) return (false, 0, false, 0);
        for (uint256 s = slots; s > 0; --s) {
            if (slotBase[s - 1] == 0 && bt <= level(s - 1)) {
                return (true, s - 1, true, _min(orderQuote, left));
            }
        }
    }

    function _swap(bool buy, uint256 amountIn, int24 twap) internal returns (uint256 inUsed, uint256 out) {
        address tokenIn = buy ? quote : base;
        bool zeroForOne = tokenIn == pool.token0();
        // The adverse direction for this trade, in pool ticks: buying base raises bt, selling lowers it.
        int256 sign = baseIsToken0 ? int256(1) : int256(-1);
        int256 limitBt = int256(_bt(twap)) + (buy ? int256(uint256(slipTicks)) : -int256(uint256(slipTicks)));
        uint160 limit = TickMathLite.getSqrtRatioAtTick(int24(limitBt * sign));

        _payToken = tokenIn;
        _payMax = amountIn;
        (int256 d0, int256 d1) = pool.swap(owner, zeroForOne, int256(amountIn), limit, "");
        _payToken = address(0);
        _payMax = 0;
        if (zeroForOne) {
            inUsed = uint256(d0);
            out = uint256(-d1);
        } else {
            inUsed = uint256(d1);
            out = uint256(-d0);
        }
    }

    /// @notice PancakeSwap v3 swap callback: pays the pool from the owner's wallet, only during this charter's own
    /// swap, only the token and at most the amount this charter asked to sell.
    function pancakeV3SwapCallback(int256 amount0Delta, int256 amount1Delta, bytes calldata) external {
        if (msg.sender != address(pool) || _payToken == address(0)) revert BadCallback();
        uint256 owed = amount0Delta > 0 ? uint256(amount0Delta) : uint256(amount1Delta);
        address t = amount0Delta > 0 ? pool.token0() : pool.token1();
        if (t != _payToken || owed > _payMax) revert BadCallback();
        t.safeTransferFrom(owner, address(pool), owed);
    }

    /// @notice What act() would do now. Reverts if the pool cannot produce its TWAP (not enough history).
    function preview()
        external
        view
        returns (uint8 state, uint256 slot, bool buy, uint256 amountIn, int24 twapTick, int24 spotTick)
    {
        twapTick = PoolOracle.twapTick(pool, twapWindow);
        spotTick = PoolOracle.spotTick(pool);
        if (ended) return (S_ENDED, 0, false, 0, twapTick, spotTick);
        if (block.timestamp >= expiresAt) return (S_EXPIRED, 0, false, 0, twapTick, spotTick);
        bool found;
        (found, slot, buy, amountIn) = _next(_bt(twapTick));
        if (!found) return (S_IDLE, 0, false, 0, twapTick, spotTick);
        int256 d = int256(spotTick) - int256(twapTick);
        if ((d < 0 ? -d : d) > int256(uint256(maxDeviation))) return (S_UNSETTLED, slot, buy, amountIn, twapTick, spotTick);
        address tokenIn = buy ? quote : base;
        uint256 avail = _min(IERC20Lite(tokenIn).allowance(owner, address(this)), IERC20Lite(tokenIn).balanceOf(owner));
        if (avail * 10_000 < amountIn * minFillBps) return (S_NO_FUNDS, slot, buy, amountIn, twapTick, spotTick);
        state = buy ? S_WOULD_BUY : S_WOULD_SELL;
    }

    function _bt(int24 tick) internal view returns (int24) {
        return baseIsToken0 ? tick : -tick;
    }
}
