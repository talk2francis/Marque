// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {SafeToken} from "../SafeToken.sol";
import {CharterBase, IERC20Lite} from "../base/CharterBase.sol";
import {IPancakeV3Pool, INonfungiblePositionManager} from "../base/PancakeInterfaces.sol";
import {PoolOracle} from "../lib/PoolOracle.sol";
import {PoolMath} from "../lib/PoolMath.sol";
import {TickMathLite} from "../lib/TickMathLite.sol";

/// @title RangeKeeper (Charters kind 4)
/// @notice Keeps one PancakeSwap v3 liquidity position in range, again and again, inside limits the owner set.
///
/// Custody, stated plainly: the owner's position NFT moves into this contract when the charter is granted, and every
/// successor NFT is minted to this contract. That is what lets it re-centre without asking the owner each time. The
/// contract can only: collect fees (to the owner, or back into the position), remove the position's liquidity,
/// swap between the pool's two tokens in that same pool within a hard price limit, mint the successor position with
/// the same width centred on the TWAP, burn the emptied NFT, and send every leftover token to the owner. The owner
/// takes the current NFT back at any time with end(); after expiry anyone can send it back with release().
///
/// Each rebalance is one transaction: if any step fails (price limit, value-loss bound, leftover bound, a pool or
/// position-manager revert), everything rolls back and the current position is untouched.
///
/// Trigger: the pool TWAP over `twapWindow` is beyond the range by more than `bufferTicks`, the spot tick is outside
/// the range on the same side, the spot is within `maxDeviation` of the TWAP, at least `minInterval` has passed since
/// the last rebalance, and fewer than `maxRebalances` have happened.
/// Economic bound per rebalance: value after (new position at TWAP plus leftovers sent to the owner) is at least
/// (1 - maxLossBps) of the old position's value at TWAP (plus compounded fees), and leftovers are at most
/// `maxLeftoverBps` of it, so most of the capital is really redeployed.
/// Mode EXIT instead removes everything to the owner once, and ends.
contract RangeKeeper is CharterBase {
    using SafeToken for address;

    uint8 public constant MODE_REBALANCE = 0;
    uint8 public constant MODE_EXIT = 1;

    INonfungiblePositionManager public immutable npm;
    IPancakeV3Pool public immutable pool;
    address public immutable token0;
    address public immutable token1;
    uint24 public immutable fee;
    int24 public immutable spacing;
    int24 public immutable width;
    uint8 public immutable mode;
    bool public immutable feesToOwner;
    uint32 public immutable twapWindow;
    uint24 public immutable maxDeviation;
    uint24 public immutable slipTicks;
    int24 public immutable bufferTicks;
    uint16 public immutable maxLossBps;
    uint16 public immutable maxLeftoverBps;
    uint32 public immutable minInterval;
    uint16 public immutable maxRebalances;

    uint256 public tokenId;
    uint16 public rebalances;
    uint64 public lastActionAt;
    bool public deposited;
    bool public returned;
    bool private _swapping;

    struct Params {
        address pool;
        uint8 mode;
        bool feesToOwner;
        uint32 twapWindow;
        uint24 maxDeviation;
        uint24 slipTicks;
        int24 bufferTicks;
        uint16 maxLossBps;
        uint16 maxLeftoverBps;
        uint32 minInterval;
        uint16 maxRebalances;
    }

    struct Step {
        int24 twap;
        int24 spot;
        uint160 sqrtTwap;
        int24 oldLower;
        int24 oldUpper;
        uint128 oldLiquidity;
        uint256 fees0;
        uint256 fees1;
        uint256 valueBefore;
        int24 newLower;
        int24 newUpper;
        uint256 swapIn;
        uint256 swapOut;
        bool swapZeroForOne;
        uint256 newId;
        uint128 newLiquidity;
        uint256 used0;
        uint256 used1;
        uint256 left0;
        uint256 left1;
        uint256 valueAfter;
    }

    event Rebalanced(
        address indexed caller,
        uint256 indexed oldTokenId,
        uint256 indexed newTokenId,
        int24 newLower,
        int24 newUpper,
        uint128 newLiquidity
    );
    event RebalanceValue(
        uint256 indexed newTokenId,
        uint256 valueBefore,
        uint256 valueAfter,
        uint256 fees0,
        uint256 fees1,
        uint256 left0,
        uint256 left1
    );
    event Exited(address indexed caller, uint256 indexed tokenId, uint256 amount0, uint256 amount1);
    event Returned(uint256 indexed tokenId, address to);

    error UnexpectedNft();
    error NotHeld();
    error InRange(int24 twap, int24 lower, int24 upper);
    error TooSoon(uint64 next);
    error LimitReached();
    error ValueLoss(uint256 before, uint256 afterValue);
    error TooMuchLeftOver(uint256 leftValue, uint256 cap);
    error BadCallback();
    error NotReleasable();

    constructor(
        Common memory c,
        Params memory p,
        INonfungiblePositionManager npm_,
        address t0,
        address t1,
        uint24 fee_,
        int24 spacing_,
        int24 width_,
        uint256 tokenId_
    ) CharterBase(KIND_RANGE_KEEPER, 2, false, c) {
        npm = npm_;
        pool = IPancakeV3Pool(p.pool);
        token0 = t0;
        token1 = t1;
        fee = fee_;
        spacing = spacing_;
        width = width_;
        mode = p.mode;
        feesToOwner = p.feesToOwner;
        twapWindow = p.twapWindow;
        maxDeviation = p.maxDeviation;
        slipTicks = p.slipTicks;
        bufferTicks = p.bufferTicks;
        maxLossBps = p.maxLossBps;
        maxLeftoverBps = p.maxLeftoverBps;
        minInterval = p.minInterval;
        maxRebalances = p.maxRebalances;
        tokenId = tokenId_;
    }

    /// Accepts exactly one NFT, once: the owner's position, forwarded by the factory in the same transaction that
    /// created this charter. Successor NFTs are minted here without a callback. Anything else is refused.
    function onERC721Received(address operator, address from, uint256 id, bytes calldata) external returns (bytes4) {
        if (msg.sender != address(npm) || operator != factory || from != factory || id != tokenId || deposited) {
            revert UnexpectedNft();
        }
        deposited = true;
        return this.onERC721Received.selector;
    }

    /// @notice Re-centre (or, in EXIT mode, close) the position when the TWAP says it has left its range.
    function act() external nonReentrant {
        _checkLive();
        _checkCaller();
        if (!deposited || returned || npm.ownerOf(tokenId) != address(this)) revert NotHeld();
        if (mode == MODE_REBALANCE && rebalances >= maxRebalances) revert LimitReached();
        if (block.timestamp < uint256(lastActionAt) + minInterval) revert TooSoon(lastActionAt + minInterval);

        Step memory s;
        (s.twap, s.spot) = PoolOracle.settled(pool, twapWindow, maxDeviation);
        (,,,,, s.oldLower, s.oldUpper, s.oldLiquidity,,,,) = npm.positions(tokenId);
        bool below = s.twap < s.oldLower - bufferTicks && s.spot < s.oldLower;
        bool above = s.twap >= s.oldUpper + bufferTicks && s.spot >= s.oldUpper;
        if (!below && !above) revert InRange(s.twap, s.oldLower, s.oldUpper);

        actions += 1;
        lastActionAt = uint64(block.timestamp);
        if (mode == MODE_EXIT) {
            _exit();
        } else {
            rebalances += 1;
            _rebalance(s);
        }
        _payTip();
    }

    function _exit() internal {
        uint256 id = tokenId;
        (,,,,,,, uint128 liq,,,,) = npm.positions(id);
        if (liq != 0) {
            npm.decreaseLiquidity(
                INonfungiblePositionManager.DecreaseLiquidityParams(id, liq, 0, 0, block.timestamp)
            );
        }
        (uint256 a0, uint256 a1) = npm.collect(
            INonfungiblePositionManager.CollectParams(id, owner, type(uint128).max, type(uint128).max)
        );
        npm.burn(id);
        returned = true;
        ended = true;
        emit Exited(msg.sender, id, a0, a1);
        emit Ended(msg.sender, uint64(block.timestamp));
    }

    function _rebalance(Step memory s) internal {
        uint256 oldId = tokenId;
        s.sqrtTwap = TickMathLite.getSqrtRatioAtTick(s.twap);
        {
            (uint256 x, uint256 y) = PoolMath.amountsForLiquidity(
                s.sqrtTwap, PoolMath.sqrtAt(s.oldLower), PoolMath.sqrtAt(s.oldUpper), s.oldLiquidity
            );
            s.valueBefore = PoolMath.valueIn1(s.sqrtTwap, x, y);
        }

        // 1. Fees first, so they are known exactly: to the owner, or kept here to be compounded.
        (s.fees0, s.fees1) = npm.collect(
            INonfungiblePositionManager.CollectParams(
                oldId, feesToOwner ? owner : address(this), type(uint128).max, type(uint128).max
            )
        );
        if (!feesToOwner) s.valueBefore += PoolMath.valueIn1(s.sqrtTwap, s.fees0, s.fees1);

        // 2. Remove all liquidity and collect the principal here.
        if (s.oldLiquidity != 0) {
            npm.decreaseLiquidity(
                INonfungiblePositionManager.DecreaseLiquidityParams(oldId, s.oldLiquidity, 0, 0, block.timestamp)
            );
        }
        npm.collect(
            INonfungiblePositionManager.CollectParams(oldId, address(this), type(uint128).max, type(uint128).max)
        );

        // 3. Same width, centred on the TWAP, aligned to the pool's tick spacing.
        (s.newLower, s.newUpper) = centeredRange(s.twap);

        // 4. Balance the two tokens for the new range with one swap in this pool, inside the hard price limit.
        _balance(s);

        _mintAndSettle(s, oldId);
    }

    function _mintAndSettle(Step memory s, uint256 oldId) internal {
        // 5. Mint the successor position to this contract, then burn the emptied NFT.
        uint256 b0 = IERC20Lite(token0).balanceOf(address(this));
        uint256 b1 = IERC20Lite(token1).balanceOf(address(this));
        token0.forceApprove(address(npm), b0);
        token1.forceApprove(address(npm), b1);
        (s.newId, s.newLiquidity, s.used0, s.used1) = npm.mint(
            INonfungiblePositionManager.MintParams(
                token0, token1, fee, s.newLower, s.newUpper, b0, b1, 0, 0, address(this), block.timestamp
            )
        );
        token0.forceApprove(address(npm), 0);
        token1.forceApprove(address(npm), 0);
        npm.burn(oldId);
        tokenId = s.newId;

        // 6. Everything not redeployed goes to the owner.
        s.left0 = IERC20Lite(token0).balanceOf(address(this));
        s.left1 = IERC20Lite(token1).balanceOf(address(this));
        if (s.left0 != 0) token0.safeTransfer(owner, s.left0);
        if (s.left1 != 0) token1.safeTransfer(owner, s.left1);

        // 7. The economic bound for the whole operation, measured at the TWAP.
        uint256 leftValue = PoolMath.valueIn1(s.sqrtTwap, s.left0, s.left1);
        s.valueAfter = PoolMath.valueIn1(s.sqrtTwap, s.used0, s.used1) + leftValue;
        if (s.valueAfter * 10_000 < s.valueBefore * (10_000 - uint256(maxLossBps))) {
            revert ValueLoss(s.valueBefore, s.valueAfter);
        }
        if (leftValue * 10_000 > s.valueBefore * maxLeftoverBps) {
            revert TooMuchLeftOver(leftValue, s.valueBefore * maxLeftoverBps / 10_000);
        }
        emit Rebalanced(msg.sender, oldId, s.newId, s.newLower, s.newUpper, s.newLiquidity);
        emit RebalanceValue(s.newId, s.valueBefore, s.valueAfter, s.fees0, s.fees1, s.left0, s.left1);
    }

    /// The target split for a range centred on the TWAP: the share of value that should sit in token1 is the share a
    /// unit of liquidity holds there at the TWAP. Swap the surplus side, exact input, limited to slipTicks past TWAP.
    function _balance(Step memory s) internal {
        _plan(s);
        if (s.swapIn == 0) return;
        uint160 limit = TickMathLite.getSqrtRatioAtTick(
            s.swapZeroForOne ? s.twap - int24(slipTicks) : s.twap + int24(slipTicks)
        );
        _swapping = true;
        (int256 d0, int256 d1) = pool.swap(address(this), s.swapZeroForOne, int256(s.swapIn), limit, "");
        _swapping = false;
        s.swapOut = uint256(-(s.swapZeroForOne ? d1 : d0));
    }

    function _plan(Step memory s) internal view {
        uint256 b0 = IERC20Lite(token0).balanceOf(address(this));
        uint256 b1 = IERC20Lite(token1).balanceOf(address(this));
        uint256 want1;
        {
            (uint256 ux, uint256 uy) = PoolMath.amountsForLiquidity(
                s.sqrtTwap, PoolMath.sqrtAt(s.newLower), PoolMath.sqrtAt(s.newUpper), 1e18
            );
            uint256 unitValue = PoolMath.valueIn1(s.sqrtTwap, ux, uy);
            if (unitValue == 0) return;
            want1 = PoolMath.mulDiv(PoolMath.valueIn1(s.sqrtTwap, b0, b1), uy, unitValue);
        }
        if (b1 > want1) {
            s.swapIn = b1 - want1;
            s.swapZeroForOne = false;
        } else {
            uint256 want0 = PoolMath.amount1In0(s.sqrtTwap, want1 - b1);
            s.swapIn = want0 > b0 ? b0 : want0;
            s.swapZeroForOne = true;
        }
    }

    /// @notice PancakeSwap v3 swap callback: pays the pool from this contract's own balance, only during its own swap.
    function pancakeV3SwapCallback(int256 amount0Delta, int256 amount1Delta, bytes calldata) external {
        if (msg.sender != address(pool) || !_swapping) revert BadCallback();
        if (amount0Delta > 0) token0.safeTransfer(address(pool), uint256(amount0Delta));
        if (amount1Delta > 0) token1.safeTransfer(address(pool), uint256(amount1Delta));
    }

    function centeredRange(int24 twap) public view returns (int24 lower, int24 upper) {
        int24 c = twap - width / 2;
        int24 q = c / spacing;
        if (c < 0 && c % spacing != 0) q -= 1;
        lower = q * spacing;
        upper = lower + width;
        int24 minT = (TickMathLite.MIN_TICK / spacing) * spacing;
        int24 maxT = (TickMathLite.MAX_TICK / spacing) * spacing;
        if (lower < minT) {
            lower = minT;
            upper = lower + width;
        }
        if (upper > maxT) {
            upper = maxT;
            lower = upper - width;
        }
    }

    /// @notice After expiry (or once ended), anyone can send the current position NFT back to the owner.
    function release() external nonReentrant {
        if (!ended && block.timestamp < expiresAt) revert NotReleasable();
        if (!_return()) revert NotHeld();
    }

    /// @notice Owner only: forward an NFT that is not the managed position (sent here by mistake) to the owner.
    function rescueNft(uint256 id) external onlyOwner nonReentrant {
        if (id == tokenId && !returned) revert UnexpectedNft();
        npm.transferFrom(address(this), owner, id);
    }

    function _afterEnd() internal override {
        _return();
    }

    function _return() internal returns (bool) {
        if (returned || !deposited) return false;
        uint256 id = tokenId;
        try npm.ownerOf(id) returns (address holder) {
            if (holder != address(this)) return false;
        } catch {
            return false;
        }
        // Ending must not depend on the position manager: if the transfer fails, the charter still ends and
        // release() can retry later.
        try npm.transferFrom(address(this), owner, id) {
            returned = true;
            emit Returned(id, owner);
            return true;
        } catch {
            return false;
        }
    }

    /// @notice What act() would do now: 0 in range, 1 would rebalance (or exit), 2 ended, 3 expired, 4 unsettled,
    /// 5 too soon, 6 limit reached, 7 not held.
    function preview() external view returns (uint8 state, int24 twapTick, int24 spotTick, int24 lower, int24 upper) {
        twapTick = PoolOracle.twapTick(pool, twapWindow);
        spotTick = PoolOracle.spotTick(pool);
        if (ended) return (2, twapTick, spotTick, 0, 0);
        if (block.timestamp >= expiresAt) return (3, twapTick, spotTick, 0, 0);
        if (!deposited || returned) return (7, twapTick, spotTick, 0, 0);
        (,,,,, lower, upper,,,,,) = npm.positions(tokenId);
        bool out = (twapTick < lower - bufferTicks && spotTick < lower) || (twapTick >= upper + bufferTicks && spotTick >= upper);
        if (!out) return (0, twapTick, spotTick, lower, upper);
        int256 d = int256(spotTick) - int256(twapTick);
        if ((d < 0 ? -d : d) > int256(uint256(maxDeviation))) return (4, twapTick, spotTick, lower, upper);
        if (block.timestamp < uint256(lastActionAt) + minInterval) return (5, twapTick, spotTick, lower, upper);
        if (mode == MODE_REBALANCE && rebalances >= maxRebalances) return (6, twapTick, spotTick, lower, upper);
        state = 1;
    }
}
