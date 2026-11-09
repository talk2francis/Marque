// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {TickMathLite} from "./TickMathLite.sol";

/// @title PoolMath
/// @notice Full-precision mulDiv, concentrated-liquidity amounts and valuation at a tick. Independent MIT
/// implementations of standard formulas, differential-tested against PancakeSwap v3's own FullMath and
/// LiquidityAmounts bytecode (test/charters/MathDifferential.t.sol).
library PoolMath {
    uint256 internal constant Q96 = 0x1000000000000000000000000;

    error MulDivOverflow();

    /// floor(a * b / d) with a 512-bit intermediate. Reverts if d == 0 or the result exceeds 256 bits.
    function mulDiv(uint256 a, uint256 b, uint256 d) internal pure returns (uint256 result) {
        unchecked {
            uint256 lo;
            uint256 hi;
            assembly {
                let mm := mulmod(a, b, not(0))
                lo := mul(a, b)
                hi := sub(sub(mm, lo), lt(mm, lo))
            }
            if (hi == 0) {
                if (d == 0) revert MulDivOverflow();
                return lo / d;
            }
            if (d <= hi) revert MulDivOverflow();
            uint256 rem;
            assembly {
                rem := mulmod(a, b, d)
                hi := sub(hi, gt(rem, lo))
                lo := sub(lo, rem)
            }
            uint256 twos = d & (~d + 1);
            assembly {
                d := div(d, twos)
                lo := div(lo, twos)
                twos := add(div(sub(0, twos), twos), 1)
            }
            lo |= hi * twos;
            uint256 inv = (3 * d) ^ 2;
            inv *= 2 - d * inv;
            inv *= 2 - d * inv;
            inv *= 2 - d * inv;
            inv *= 2 - d * inv;
            inv *= 2 - d * inv;
            inv *= 2 - d * inv;
            result = lo * inv;
        }
    }

    function mulDivUp(uint256 a, uint256 b, uint256 d) internal pure returns (uint256 r) {
        r = mulDiv(a, b, d);
        unchecked {
            if (mulmod(a, b, d) != 0) r += 1;
        }
    }

    function _sort(uint160 a, uint160 b) private pure returns (uint160, uint160) {
        return a > b ? (b, a) : (a, b);
    }

    function liquidityForAmount0(uint160 a, uint160 b, uint256 amount0) internal pure returns (uint128) {
        (a, b) = _sort(a, b);
        uint256 mid = mulDiv(a, b, Q96);
        return _toU128(mulDiv(amount0, mid, b - a));
    }

    function liquidityForAmount1(uint160 a, uint160 b, uint256 amount1) internal pure returns (uint128) {
        (a, b) = _sort(a, b);
        return _toU128(mulDiv(amount1, Q96, b - a));
    }

    function liquidityForAmounts(uint160 p, uint160 a, uint160 b, uint256 amount0, uint256 amount1)
        internal
        pure
        returns (uint128 liquidity)
    {
        (a, b) = _sort(a, b);
        if (p <= a) {
            liquidity = liquidityForAmount0(a, b, amount0);
        } else if (p < b) {
            uint128 l0 = liquidityForAmount0(p, b, amount0);
            uint128 l1 = liquidityForAmount1(a, p, amount1);
            liquidity = l0 < l1 ? l0 : l1;
        } else {
            liquidity = liquidityForAmount1(a, b, amount1);
        }
    }

    function amount0ForLiquidity(uint160 a, uint160 b, uint128 liquidity) internal pure returns (uint256) {
        (a, b) = _sort(a, b);
        return mulDiv(uint256(liquidity) << 96, b - a, b) / a;
    }

    function amount1ForLiquidity(uint160 a, uint160 b, uint128 liquidity) internal pure returns (uint256) {
        (a, b) = _sort(a, b);
        return mulDiv(liquidity, b - a, Q96);
    }

    function amountsForLiquidity(uint160 p, uint160 a, uint160 b, uint128 liquidity)
        internal
        pure
        returns (uint256 amount0, uint256 amount1)
    {
        (a, b) = _sort(a, b);
        if (p <= a) {
            amount0 = amount0ForLiquidity(a, b, liquidity);
        } else if (p < b) {
            amount0 = amount0ForLiquidity(p, b, liquidity);
            amount1 = amount1ForLiquidity(a, p, liquidity);
        } else {
            amount1 = amount1ForLiquidity(a, b, liquidity);
        }
    }

    /// Value of (amount0, amount1) in token1 units at sqrt price p (token1 per token0 = (p / 2^96)^2).
    function valueIn1(uint160 p, uint256 amount0, uint256 amount1) internal pure returns (uint256) {
        return amount1 + amount0In1(p, amount0);
    }

    function amount0In1(uint160 p, uint256 amount0) internal pure returns (uint256) {
        if (p <= type(uint128).max) {
            uint256 pp = uint256(p) * p;
            return mulDiv(amount0, pp, 1 << 192);
        }
        return mulDiv(amount0, mulDiv(p, p, 1 << 64), 1 << 128);
    }

    function amount1In0(uint160 p, uint256 amount1) internal pure returns (uint256) {
        if (p <= type(uint128).max) {
            uint256 pp = uint256(p) * p;
            return mulDiv(amount1, 1 << 192, pp);
        }
        return mulDiv(amount1, 1 << 128, mulDiv(p, p, 1 << 64));
    }

    function sqrtAt(int24 tick) internal pure returns (uint160) {
        return TickMathLite.getSqrtRatioAtTick(tick);
    }

    function _toU128(uint256 x) private pure returns (uint128) {
        if (x > type(uint128).max) revert MulDivOverflow();
        return uint128(x);
    }
}
