// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {TickMathLite} from "../../src/charters/lib/TickMathLite.sol";
import {PoolMath} from "../../src/charters/lib/PoolMath.sol";

interface ITickMathTest {
    function getSqrtRatioAtTick(int24 tick) external pure returns (uint160);
}

interface IFullMathTest {
    function mulDiv(uint256 a, uint256 b, uint256 d) external pure returns (uint256);
}

interface ILiquidityAmountsTest {
    function getLiquidityForAmounts(uint160 p, uint160 a, uint160 b, uint256 x, uint256 y) external pure returns (uint128);
    function getAmountsForLiquidity(uint160 p, uint160 a, uint160 b, uint128 l) external pure returns (uint256, uint256);
}

/// Our MIT math against PancakeSwap v3's own deployed libraries (their test harness bytecode, solc 0.7.6).
contract MathDifferentialTest is Test {
    ITickMathTest tm;
    IFullMathTest fm;
    ILiquidityAmountsTest la;

    function setUp() public {
        tm = ITickMathTest(deployCode("test/fixtures/pcs/TickMathTest.json"));
        fm = IFullMathTest(deployCode("test/fixtures/pcs/FullMathTest.json"));
        la = ILiquidityAmountsTest(deployCode("test/fixtures/pcs/LiquidityAmountsTest.json"));
    }

    function testFuzz_sqrtRatioAtTick_isBitIdentical(int24 tick) public view {
        tick = int24(bound(int256(tick), TickMathLite.MIN_TICK, TickMathLite.MAX_TICK));
        assertEq(TickMathLite.getSqrtRatioAtTick(tick), tm.getSqrtRatioAtTick(tick));
    }

    function test_sqrtRatioBounds() public view {
        assertEq(TickMathLite.getSqrtRatioAtTick(TickMathLite.MIN_TICK), TickMathLite.MIN_SQRT_RATIO);
        assertEq(TickMathLite.getSqrtRatioAtTick(TickMathLite.MAX_TICK), TickMathLite.MAX_SQRT_RATIO);
        assertEq(TickMathLite.getSqrtRatioAtTick(0), uint160(1) << 96);
    }

    function testFuzz_mulDiv_matches(uint256 a, uint256 b, uint256 d) public {
        d = bound(d, 1, type(uint256).max);
        (bool ok, bytes memory ret) = address(fm).staticcall(abi.encodeWithSelector(IFullMathTest.mulDiv.selector, a, b, d));
        if (!ok) {
            vm.expectRevert(PoolMath.MulDivOverflow.selector);
            this.ours(a, b, d);
        } else {
            assertEq(PoolMath.mulDiv(a, b, d), abi.decode(ret, (uint256)));
        }
    }

    function ours(uint256 a, uint256 b, uint256 d) external pure returns (uint256) {
        return PoolMath.mulDiv(a, b, d);
    }

    function testFuzz_amountsForLiquidity_match(int24 tp, int24 ta, int24 tb, uint128 l) public view {
        tp = int24(bound(int256(tp), -400_000, 400_000));
        ta = int24(bound(int256(ta), -400_000, 400_000));
        tb = int24(bound(int256(tb), -400_000, 400_000));
        vm.assume(ta != tb);
        uint160 p = TickMathLite.getSqrtRatioAtTick(tp);
        uint160 a = TickMathLite.getSqrtRatioAtTick(ta);
        uint160 b = TickMathLite.getSqrtRatioAtTick(tb);
        (uint256 x, uint256 y) = PoolMath.amountsForLiquidity(p, a, b, l);
        (uint256 x2, uint256 y2) = la.getAmountsForLiquidity(p, a, b, l);
        assertEq(x, x2);
        assertEq(y, y2);
    }

    function testFuzz_liquidityForAmounts_match(int24 tp, int24 ta, int24 tb, uint96 x, uint96 y) public view {
        tp = int24(bound(int256(tp), -200_000, 200_000));
        ta = int24(bound(int256(ta), -200_000, 200_000));
        tb = int24(bound(int256(tb), -200_000, 200_000));
        vm.assume(ta != tb);
        uint160 p = TickMathLite.getSqrtRatioAtTick(tp);
        uint160 a = TickMathLite.getSqrtRatioAtTick(ta);
        uint160 b = TickMathLite.getSqrtRatioAtTick(tb);
        (bool ok, bytes memory ret) =
            address(la).staticcall(abi.encodeWithSelector(ILiquidityAmountsTest.getLiquidityForAmounts.selector, p, a, b, uint256(x), uint256(y)));
        vm.assume(ok);
        assertEq(PoolMath.liquidityForAmounts(p, a, b, x, y), abi.decode(ret, (uint128)));
    }
}
