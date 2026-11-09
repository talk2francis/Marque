// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {PcsFixture, IPoolFull} from "./utils/PcsFixture.sol";
import {GridBand} from "../../src/charters/grid/GridBand.sol";
import {GridBandFactory} from "../../src/charters/grid/GridBandFactory.sol";
import {CharterBase} from "../../src/charters/base/CharterBase.sol";
import {PoolOracle} from "../../src/charters/lib/PoolOracle.sol";
import {PoolMath} from "../../src/charters/lib/PoolMath.sol";
import {TickMathLite} from "../../src/charters/lib/TickMathLite.sol";
import {IPancakeV3Factory} from "../../src/charters/base/PancakeInterfaces.sol";
import {MockERC20} from "./mocks/VenusMocks.sol";

/// Grid Band against real PancakeSwap v3 pool bytecode. Run twice: base as token0 and base as token1.
abstract contract GridBandBase is PcsFixture {
    uint256 constant E = 1e18;
    int24 constant STEP = 200;
    MockERC20 base;
    MockERC20 quote;
    IPoolFull pool;
    GridBandFactory factory;
    address owner = makeAddr("owner");
    address keel = makeAddr("keel");
    address keel2 = makeAddr("keel2");
    int24 bt0;

    function baseIsToken0() internal pure virtual returns (bool);

    function setUp() public {
        vm.warp(1_762_700_000);
        _deployPcs();
        MockERC20 a = new MockERC20("A", 18);
        MockERC20 b = new MockERC20("B", 18);
        (MockERC20 lo, MockERC20 hi) = address(a) < address(b) ? (a, b) : (b, a);
        (base, quote) = baseIsToken0() ? (lo, hi) : (hi, lo);
        int24 tick = baseIsToken0() ? int24(63970) : int24(-63970); // 600 quote per base
        (uint256 d0, uint256 d1) = baseIsToken0() ? (10_000 * E, 6_000_000 * E) : (6_000_000 * E, 10_000 * E);
        pool = _pool(lo, hi, tick, d0, d1);
        vm.warp(block.timestamp + 3600);
        vm.roll(block.number + 1200);
        address[] memory pools = new address[](1);
        pools[0] = address(pool);
        factory = new GridBandFactory(IPancakeV3Factory(address(pcs)), pools);
        bt0 = _bt(_tick(pool));
        quote.mint(owner, 10_000 * E);
        base.mint(owner, 10 * E);
    }

    function _bt(int24 t) internal pure returns (int24) {
        return baseIsToken0() ? t : -t;
    }

    function _toTick(int24 bt) internal pure returns (int24) {
        return baseIsToken0() ? bt : -bt;
    }

    function _params(int24 lowerBt, uint256 baseOrder, uint256 buyCap, uint256 sellCap)
        internal
        view
        returns (GridBandFactory.Create memory a)
    {
        address[] memory ex = new address[](2);
        ex[0] = keel;
        ex[1] = keel2;
        a.p = GridBand.Params({
            pool: address(pool),
            base: address(base),
            lowerBt: lowerBt,
            stepTicks: STEP,
            slots: 6,
            orderQuote: 600 * E,
            baseOrder: baseOrder,
            buyCap: buyCap,
            sellCap: sellCap,
            twapWindow: 300,
            maxDeviation: 20,
            slipTicks: 30,
            minFillBps: 5000
        });
        a.expiresAt = uint64(block.timestamp + 30 days);
        a.executors = ex;
    }

    function _grid(GridBandFactory.Create memory a) internal returns (GridBand g) {
        a.fullFrom = factory.fullFromNow(a.p);
        address predicted = factory.predict(owner, a, bytes32("g"));
        vm.startPrank(owner);
        quote.approve(predicted, a.p.buyCap); // approvals first, to the predicted address: one batch for Pass
        base.approve(predicted, a.p.sellCap);
        g = GridBand(factory.create(a, bytes32("g")));
        vm.stopPrank();
        assertEq(address(g), predicted);
    }

    /// Buy-only grid: six slots, every buy level below today's price.
    function _buyOnly(uint256 buyCap) internal returns (GridBand) {
        return _grid(_params(bt0 - 1250, 0, buyCap, 100 * E));
    }

    function _go(int24 bt) internal {
        _moveAndSettle(pool, _toTick(bt), 400);
    }

    function test_idleAbovePrice() public {
        GridBand g = _buyOnly(3_000 * E);
        (uint8 st,,,,,) = g.preview();
        assertEq(st, 0);
        vm.prank(keel);
        vm.expectRevert(GridBand.NothingToDo.selector);
        g.act();
    }

    function test_buyThenSellRoundTrip_isProfitable_andRearms() public {
        GridBand g = _buyOnly(3_000 * E);
        int24 l5 = g.level(5);
        _go(l5 - 20);
        uint256 q0 = quote.balanceOf(owner);
        uint256 b0 = base.balanceOf(owner);
        vm.prank(keel);
        (uint256 slot, bool isBuy, uint256 inAmt, uint256 out) = g.act();
        assertEq(slot, 5);
        assertTrue(isBuy);
        assertEq(inAmt, 600 * E);
        assertEq(quote.balanceOf(owner), q0 - inAmt, "quote left the owner's wallet");
        assertEq(base.balanceOf(owner), b0 + out, "base went straight to the owner");
        assertEq(g.slotBase(5), out);
        assertEq(quote.balanceOf(address(g)) + base.balanceOf(address(g)), 0, "the charter holds nothing");

        // The same level does not fire again until its sell completes.
        vm.prank(keel);
        vm.expectRevert(GridBand.NothingToDo.selector);
        g.act();

        _go(g.level(6) + 20);
        vm.prank(keel);
        (slot, isBuy, inAmt, out) = g.act();
        assertEq(slot, 5);
        assertFalse(isBuy);
        assertGe(out, 600 * E, "the round trip returned at least the quote it spent");
        assertEq(g.slotBase(5), 0, "re-armed");

        _go(l5 - 20);
        vm.prank(keel);
        (slot, isBuy,,) = g.act();
        assertEq(slot, 5);
        assertTrue(isBuy, "fires again after the round trip");
    }

    function test_gapDownFillsOneSlotPerCall_inOrder() public {
        GridBand g = _buyOnly(6_000 * E);
        _go(g.level(2) - 20);
        for (uint256 want = 5; want >= 2; --want) {
            vm.prank(keel);
            (uint256 slot, bool isBuy,,) = g.act();
            assertEq(slot, want);
            assertTrue(isBuy);
        }
        vm.prank(keel);
        vm.expectRevert(GridBand.NothingToDo.selector);
        g.act();
        assertEq(g.quoteSpent(), 4 * 600 * E);
    }

    function test_grossBuyCapHolds_evenWhenProceedsRecycle() public {
        GridBand g = _buyOnly(1_200 * E);
        for (uint256 i; i < 3; ++i) {
            _go(g.level(5) - 20);
            vm.prank(keel);
            if (i < 2) {
                g.act();
                _go(g.level(6) + 20);
                vm.prank(keel);
                g.act();
            } else {
                vm.expectRevert(GridBand.NothingToDo.selector);
                g.act();
            }
        }
        assertEq(g.quoteSpent(), 1_200 * E, "two buys of 600, then the gross cap stops it");
    }

    function test_onlyOwnerAndNamedExecutorsMayAct() public {
        GridBand g = _buyOnly(3_000 * E);
        _go(g.level(5) - 20);
        vm.prank(makeAddr("stranger"));
        vm.expectRevert(abi.encodeWithSelector(CharterBase.NotExecutor.selector, makeAddr("stranger")));
        g.act();
        vm.prank(owner);
        g.act();
    }

    function test_refusesWhenSpotIsFarFromTwap() public {
        GridBand g = _buyOnly(3_000 * E);
        int24 l5 = g.level(5);
        swapper.swapTo(pool, _toTick(l5 - 20)); // spot moved, the TWAP has not
        vm.prank(keel);
        vm.expectRevert();
        g.act();
        vm.warp(block.timestamp + 400);
        vm.roll(block.number + 400);
        vm.prank(keel);
        g.act();
    }

    /// The economic boundary: with the spot pushed to the worst allowed edge before each leg, a buy never pays
    /// more than TWAP * 1.0001^slip and the round trip still returns at least what it spent.
    function test_worstAllowedExecution_isBounded_andRoundTripStillNonNegative() public {
        GridBand g = _buyOnly(3_000 * E);
        int24 l5 = g.level(5);
        _go(l5 - 20);
        int24 twap = PoolOracle.twapTick(pool, 300);
        swapper.swapTo(pool, _toTick(_bt(twap) + 19)); // adverse for a buy, inside maxDeviation
        vm.prank(keel);
        (,, uint256 qIn, uint256 bOut) = g.act();
        uint160 limit = TickMathLite.getSqrtRatioAtTick(_toTick(_bt(twap) + 30));
        uint256 bOutAtLimit = baseIsToken0() ? PoolMath.amount0In1(limit, bOut) : PoolMath.amount1In0(limit, bOut);
        assertGe(bOutAtLimit, qIn, "average buy price within TWAP + slip");

        _go(g.level(6) + 20);
        twap = PoolOracle.twapTick(pool, 300);
        swapper.swapTo(pool, _toTick(_bt(twap) - 19)); // adverse for a sell
        vm.prank(keel);
        (,,, uint256 qOut) = g.act();
        assertGe(qOut, qIn, "worst-case round trip does not lose quote");
    }

    function test_thinPool_fillBelowMinimumReverts() public {
        MockERC20 x = new MockERC20("X", 18);
        MockERC20 y = new MockERC20("Y", 18);
        (MockERC20 lo, MockERC20 hi) = address(x) < address(y) ? (x, y) : (y, x);
        IPoolFull thin = _pool(lo, hi, 0, 50 * E, 50 * E);
        vm.warp(block.timestamp + 3600);
        address[] memory pools = new address[](1);
        pools[0] = address(thin);
        GridBandFactory f2 = new GridBandFactory(IPancakeV3Factory(address(pcs)), pools);
        GridBandFactory.Create memory a = _params(-1250, 0, 3_000 * E, 0);
        a.p.pool = address(thin);
        a.p.base = address(lo);
        a.fullFrom = 6;
        lo.mint(owner, 0);
        hi.mint(owner, 10_000 * E);
        vm.startPrank(owner);
        GridBand g = GridBand(f2.create(a, bytes32("t")));
        hi.approve(address(g), type(uint256).max);
        vm.stopPrank();
        _moveAndSettle(thin, g.level(5) - 20, 400);
        vm.prank(keel);
        vm.expectPartialRevert(GridBand.FillTooSmall.selector); // the 0.3% limit stops a 600 order in a thin pool
        g.act();
    }

    function test_allowanceIsNotAReservation() public {
        GridBand g = _buyOnly(3_000 * E);
        _go(g.level(5) - 20);
        vm.prank(owner);
        quote.transfer(makeAddr("elsewhere"), 9_800 * E); // the owner spends the wallet down to 200
        (uint8 st,,,,,) = g.preview();
        assertEq(st, 6, "no funds");
        vm.prank(keel);
        vm.expectRevert(abi.encodeWithSelector(GridBand.FillTooSmall.selector, 200 * E, 600 * E));
        g.act();
    }

    function test_twoSidedGrid_sellsTheOwnersBaseAboveThePrice() public {
        // levels straddle the price: slots 4 and 5 start FULL with 1 base each
        GridBand g = _grid(_params(bt0 - 650, 1 * E, 3_000 * E, 2 * E));
        assertEq(g.slotBase(3), 0);
        assertEq(g.slotBase(4), 1 * E);
        assertEq(g.slotBase(5), 1 * E);
        _go(g.level(5) + 20);
        uint256 b0 = base.balanceOf(owner);
        vm.prank(keel);
        (uint256 slot, bool isBuy, uint256 inAmt,) = g.act();
        assertEq(slot, 4);
        assertFalse(isBuy);
        assertEq(base.balanceOf(owner), b0 - inAmt);
    }

    function test_factoryEnforcesTheEconomicBoundary() public {
        GridBandFactory.Create memory a = _params(bt0 - 1250, 0, 3_000 * E, 0);
        a.p.stepTicks = factory.minStep(address(pool), 30) - 1;
        vm.expectRevert(abi.encodeWithSelector(GridBandFactory.BadGrid.selector, uint8(3)));
        factory.create(a, 0);
        a = _params(bt0 - 1250, 0, 3_000 * E, 0);
        a.p.maxDeviation = 30;
        vm.expectRevert(abi.encodeWithSelector(GridBandFactory.BadGrid.selector, uint8(2)));
        factory.create(a, 0);
        a = _params(bt0 - 650, 0, 3_000 * E, 0); // slots above the price but no base for them
        vm.expectRevert(abi.encodeWithSelector(GridBandFactory.BadGrid.selector, uint8(8)));
        factory.create(a, 0);
    }

    function test_simultaneousKeepers_secondCallFindsNothing() public {
        GridBand g = _buyOnly(3_000 * E);
        _go(g.level(5) - 20);
        vm.prank(keel);
        g.act();
        vm.prank(keel2);
        vm.expectRevert(GridBand.NothingToDo.selector);
        g.act();
    }

    function test_callbackOutsideItsOwnSwapIsRefused() public {
        GridBand g = _buyOnly(3_000 * E);
        vm.expectRevert(GridBand.BadCallback.selector);
        g.pancakeV3SwapCallback(1, 0, "");
        vm.prank(address(pool));
        vm.expectRevert(GridBand.BadCallback.selector);
        g.pancakeV3SwapCallback(1, 0, "");
    }

    function test_endStops_andNothingIsHeld() public {
        GridBand g = _buyOnly(3_000 * E);
        _go(g.level(5) - 20);
        vm.prank(keel);
        g.act();
        vm.prank(owner);
        g.end();
        _go(g.level(6) + 20);
        vm.prank(keel);
        vm.expectRevert(CharterBase.CharterEnded.selector);
        g.act();
        assertEq(quote.balanceOf(address(g)) + base.balanceOf(address(g)), 0);
    }

    /// Random walks through the band: caps hold, nothing is ever held, and every completed slot round trip
    /// returns at least the quote its buy spent.
    function testFuzz_randomWalk(int16[6] memory moves) public {
        GridBand g = _buyOnly(3_000 * E);
        uint256[6] memory spentOn;
        int24 bt = bt0;
        for (uint256 i; i < 6; ++i) {
            bt = int24(bound(int256(bt) + int256(moves[i]), int256(g.level(0)) - 300, int256(bt0) + 300));
            _go(bt);
            for (uint256 k; k < 7; ++k) {
                vm.prank(keel);
                try g.act() returns (uint256 slot, bool isBuy, uint256 inAmt, uint256 out) {
                    if (isBuy) spentOn[slot] = inAmt;
                    else if (g.slotBase(slot) == 0) assertGe(out, spentOn[slot]);
                } catch {
                    break;
                }
            }
            assertLe(g.quoteSpent(), 3_000 * E);
            assertEq(quote.balanceOf(address(g)) + base.balanceOf(address(g)), 0);
        }
    }
}

contract GridBandBaseToken0Test is GridBandBase {
    function baseIsToken0() internal pure override returns (bool) {
        return true;
    }
}

contract GridBandBaseToken1Test is GridBandBase {
    function baseIsToken0() internal pure override returns (bool) {
        return false;
    }
}
