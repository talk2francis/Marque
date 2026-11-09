// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {PcsFixture, IPoolFull} from "./utils/PcsFixture.sol";
import {GridBand} from "../../src/charters/grid/GridBand.sol";
import {GridBandFactory} from "../../src/charters/grid/GridBandFactory.sol";
import {YieldSweep} from "../../src/charters/yield/YieldSweep.sol";
import {YieldSweepFactory} from "../../src/charters/yield/YieldSweepFactory.sol";
import {IComptrollerSupply} from "../../src/charters/base/VenusSupply.sol";
import {IPancakeV3Factory, IPancakeV3Pool} from "../../src/charters/base/PancakeInterfaces.sol";
import {MockERC20, MockOracle} from "./mocks/VenusMocks.sol";
import {MockSupplyComptroller, MockVTokenSupply} from "./mocks/VenusSupplyMocks.sol";
import {Swapper} from "./utils/PcsFixture.sol";

/// Random sequences of price moves, owner spending and keeper calls against a Grid Band and a Yield Sweep on the
/// same wallet. After every step: lifetime caps hold, neither charter holds funds, the sweep never claims vTokens the
/// owner does not have, and every completed grid round trip returned at least what its buy spent.
contract CharterHandler is Test {
    GridBand public grid;
    YieldSweep public sweep;
    IPancakeV3Pool public pool;
    Swapper public swapper;
    MockERC20 public usdt;
    address public owner;
    address public keel;
    bool public baseIs0;
    uint256[6] public spentOn;
    bool public roundTripLoss;

    constructor(GridBand g, YieldSweep s, IPancakeV3Pool p, Swapper sw, MockERC20 u, address o, address k, bool b0) {
        grid = g;
        sweep = s;
        pool = p;
        swapper = sw;
        usdt = u;
        owner = o;
        keel = k;
        baseIs0 = b0;
    }

    function movePrice(int16 delta) external {
        (, int24 t,,,,,) = pool.slot0();
        int24 lo = grid.level(0) - 300;
        int24 hi = grid.level(6) + 300;
        int24 bt = baseIs0 ? t : -t;
        bt = int24(bound(int256(bt) + int256(delta), int256(lo), int256(hi)));
        swapper.swapTo(pool, baseIs0 ? bt : -bt);
        vm.warp(block.timestamp + 400);
        vm.roll(block.number + 400);
    }

    function gridAct() external {
        vm.prank(keel);
        try grid.act() returns (uint256 slot, bool isBuy, uint256 inAmt, uint256 out) {
            if (isBuy) spentOn[slot] = inAmt;
            else if (grid.slotBase(slot) == 0 && out < spentOn[slot]) roundTripLoss = true;
        } catch {}
    }

    function sweepAct() external {
        try sweep.act() {} catch {}
    }

    function ownerSpends(uint96 amt) external {
        uint256 b = usdt.balanceOf(owner);
        uint256 a = bound(uint256(amt), 0, b);
        vm.prank(owner);
        usdt.transfer(address(0xdead), a);
    }

    function ownerEarns(uint96 amt) external {
        usdt.mint(owner, bound(uint256(amt), 0, 2_000 ether));
    }
}

/// Each run deploys real PancakeSwap v3 bytecode, so the budget is set here rather than at the default 256 x 500.
/// forge-config: default.invariant.runs = 128
/// forge-config: default.invariant.depth = 100
contract CharterInvariants is PcsFixture {
    uint256 constant E = 1e18;
    CharterHandler h;
    GridBand grid;
    YieldSweep sweep;
    MockERC20 usdt;
    MockERC20 wbnb;
    MockVTokenSupply vUSDT;
    address owner = makeAddr("owner");
    IPoolFull pool;
    bool b0;
    GridBandFactory gbf;
    YieldSweepFactory ysf;

    function setUp() public {
        vm.warp(1_762_700_000);
        _deployPcs();
        usdt = new MockERC20("USDT", 18);
        wbnb = new MockERC20("WBNB", 18);
        b0 = address(wbnb) < address(usdt);
        (MockERC20 lo, MockERC20 hi) = b0 ? (wbnb, usdt) : (usdt, wbnb);
        pool = _pool(lo, hi, b0 ? int24(63970) : int24(-63970), b0 ? 10_000 * E : 6_000_000 * E, b0 ? 6_000_000 * E : 10_000 * E);
        vm.warp(block.timestamp + 3600);
        address[] memory pools = new address[](1);
        pools[0] = address(pool);
        gbf = new GridBandFactory(IPancakeV3Factory(address(pcs)), pools);

        MockOracle oracle = new MockOracle();
        MockSupplyComptroller comp = new MockSupplyComptroller(address(oracle));
        vUSDT = new MockVTokenSupply(address(usdt), address(comp), 2e26);
        comp.setSupplyCap(address(vUSDT), 1e12 * E);
        usdt.mint(address(this), 1e6 * E);
        usdt.approve(address(vUSDT), type(uint256).max);
        vUSDT.mintFor(address(this), 1e6 * E);
        address[] memory m = new address[](1);
        m[0] = address(vUSDT);
        ysf = new YieldSweepFactory(IComptrollerSupply(address(comp)), m);

        _charters(makeAddr("keel"));
        h = new CharterHandler(grid, sweep, pool, swapper, usdt, owner, makeAddr("keel"), b0);
        targetContract(address(h));
    }

    function _charters(address keel) internal {
        address[] memory ex = new address[](1);
        ex[0] = keel;
        int24 bt = b0 ? _tick(pool) : -_tick(pool);
        GridBandFactory.Create memory ga;
        ga.p = GridBand.Params(address(pool), address(wbnb), bt - 1250, 200, 6, 200 * E, 0, 3_000 * E, 100 * E, 300, 20, 30, 5000);
        ga.expiresAt = uint64(block.timestamp + 90 days);
        ga.executors = ex;
        ga.fullFrom = 6;
        YieldSweepFactory.Create memory ya = YieldSweepFactory.Create({
            p: YieldSweep.Params(address(vUSDT), 400 * E, 600 * E, 20 * E, 6_000 * E, 0),
            expiresAt: uint64(block.timestamp + 90 days),
            tipPerAction: 0,
            tipBudget: 0
        });
        usdt.mint(owner, 3_000 * E);
        vm.startPrank(owner);
        grid = GridBand(gbf.create(ga, bytes32("g")));
        sweep = YieldSweep(ysf.create(ya, bytes32("s")));
        usdt.approve(address(grid), 3_000 * E);
        wbnb.approve(address(grid), 100 * E);
        usdt.approve(address(sweep), 6_000 * E);
        vUSDT.approve(address(sweep), type(uint256).max);
        vm.stopPrank();
    }

    function invariant_capsHold() public view {
        assertLe(grid.quoteSpent(), 3_000 * E);
        assertLe(grid.baseSold(), 100 * E);
        assertLe(sweep.grossSupplied(), 6_000 * E);
    }

    function invariant_chartersHoldNothing() public view {
        assertEq(usdt.balanceOf(address(grid)) + wbnb.balanceOf(address(grid)), 0);
        assertEq(usdt.balanceOf(address(sweep)), 0);
        assertEq(vUSDT.balanceOf(address(sweep)), 0);
    }

    function invariant_sweepNeverClaimsMoreThanTheOwnerHas() public view {
        assertLe(sweep.heldV(), vUSDT.balanceOf(owner));
    }

    function invariant_noLosingGridRoundTrip() public view {
        assertFalse(h.roundTripLoss());
    }
}
