// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {PcsFixture, IPoolFull} from "./utils/PcsFixture.sol";
import {LoanGuardV2} from "../../src/charters/loan/LoanGuardV2.sol";
import {LoanGuardFactoryV2} from "../../src/charters/loan/LoanGuardFactoryV2.sol";
import {YieldSweep} from "../../src/charters/yield/YieldSweep.sol";
import {YieldSweepFactory} from "../../src/charters/yield/YieldSweepFactory.sol";
import {GridBand} from "../../src/charters/grid/GridBand.sol";
import {GridBandFactory} from "../../src/charters/grid/GridBandFactory.sol";
import {IComptroller} from "../../src/charters/VenusInterfaces.sol";
import {IComptrollerSupply} from "../../src/charters/base/VenusSupply.sol";
import {IPancakeV3Factory} from "../../src/charters/base/PancakeInterfaces.sol";
import {MockERC20, MockOracle, MockVToken} from "./mocks/VenusMocks.sol";
import {MockSupplyComptroller, MockVTokenSupply} from "./mocks/VenusSupplyMocks.sol";

/// Several charters on one wallet. Allowances are ceilings, not reservations: the charters compete for the same
/// balance, and one charter's action can change another's trigger or funds. These tests pin down every coupling
/// the product must explain.
contract CrossCategoryTest is PcsFixture {
    uint256 constant E = 1e18;
    MockERC20 usdt;
    MockERC20 wbnb;
    MockOracle oracle;
    MockSupplyComptroller comp;
    MockVToken vUSDTdebt; // the borrow side of vUSDT
    MockVTokenSupply vUSDTsupply; // the supply side of a stablecoin market
    LoanGuardFactoryV2 lgf;
    YieldSweepFactory ysf;
    GridBandFactory gbf;
    IPoolFull pool;
    address owner = makeAddr("owner");
    address keel = makeAddr("keel");
    address sink = makeAddr("sink");

    function setUp() public {
        vm.warp(1_762_700_000);
        _deployPcs();
        usdt = new MockERC20("USDT", 18);
        wbnb = new MockERC20("WBNB", 18);
        oracle = new MockOracle();
        comp = new MockSupplyComptroller(address(oracle));
        vUSDTdebt = new MockVToken(address(usdt), address(comp));
        oracle.set(address(vUSDTdebt), 1e18);
        vUSDTsupply = new MockVTokenSupply(address(usdt), address(comp), 2e26);
        comp.setSupplyCap(address(vUSDTsupply), 1e12 * E);
        address[] memory m = new address[](1);
        m[0] = address(vUSDTdebt);
        lgf = new LoanGuardFactoryV2(IComptroller(address(comp)), m);
        m[0] = address(vUSDTsupply);
        ysf = new YieldSweepFactory(IComptrollerSupply(address(comp)), m);

        bool wbnbIs0 = address(wbnb) < address(usdt);
        (MockERC20 lo, MockERC20 hi) = wbnbIs0 ? (wbnb, usdt) : (usdt, wbnb);
        pool = _pool(lo, hi, wbnbIs0 ? int24(63970) : int24(-63970), wbnbIs0 ? 10_000 * E : 6_000_000 * E, wbnbIs0 ? 6_000_000 * E : 10_000 * E);
        vm.warp(block.timestamp + 3600);
        address[] memory pools = new address[](1);
        pools[0] = address(pool);
        gbf = new GridBandFactory(IPancakeV3Factory(address(pcs)), pools);

        // market cash for withdrawals
        usdt.mint(sink, 1e6 * E);
        vm.startPrank(sink);
        usdt.approve(address(vUSDTsupply), type(uint256).max);
        vUSDTsupply.mintFor(sink, 1e6 * E);
        vm.stopPrank();

        // the owner: a 1,000 USDT Venus loan at health 1.5, and 1,000 USDT in the wallet
        address[] memory assets = new address[](1);
        assets[0] = address(vUSDTdebt);
        comp.setAssets(owner, assets);
        comp.setWeighted(owner, 1500 * E);
        vUSDTdebt.setBorrow(owner, 1000 * E);
        usdt.mint(owner, 1000 * E);
    }

    function _guard() internal returns (LoanGuardV2 g) {
        LoanGuardFactoryV2.Create memory a = LoanGuardFactoryV2.Create({
            p: LoanGuardV2.Params(address(vUSDTdebt), 1.4e18, 1.8e18, 500 * E, 10 * E),
            expiresAt: uint64(block.timestamp + 30 days),
            tipPerAction: 0,
            tipBudget: 0
        });
        vm.startPrank(owner);
        g = LoanGuardV2(lgf.create(a, bytes32("lg")));
        usdt.approve(address(g), 500 * E);
        vm.stopPrank();
    }

    function _sweep(uint256 floor, uint256 ceiling, uint256 minHealth) internal returns (YieldSweep s) {
        YieldSweepFactory.Create memory a = YieldSweepFactory.Create({
            p: YieldSweep.Params(address(vUSDTsupply), floor, ceiling, 20 * E, 5_000 * E, minHealth),
            expiresAt: uint64(block.timestamp + 30 days),
            tipPerAction: 0,
            tipBudget: 0
        });
        vm.startPrank(owner);
        s = YieldSweep(ysf.create(a, bytes32("ys")));
        usdt.approve(address(s), 5_000 * E);
        vUSDTsupply.approve(address(s), type(uint256).max);
        vm.stopPrank();
    }

    function _grid() internal returns (GridBand g) {
        bool b0 = address(wbnb) < address(usdt);
        int24 bt = b0 ? _tick(pool) : -_tick(pool);
        address[] memory ex = new address[](1);
        ex[0] = keel;
        GridBandFactory.Create memory a;
        a.p = GridBand.Params(address(pool), address(wbnb), bt - 1250, 200, 6, 200 * E, 0, 2_000 * E, 100 * E, 300, 20, 30, 5000);
        a.expiresAt = uint64(block.timestamp + 30 days);
        a.executors = ex;
        a.fullFrom = 6;
        vm.startPrank(owner);
        g = GridBand(gbf.create(a, bytes32("gb")));
        usdt.approve(address(g), 2_000 * E);
        wbnb.approve(address(g), 100 * E);
        vm.stopPrank();
    }

    function _gridDown(GridBand g, uint256 slot) internal {
        bool b0 = address(wbnb) < address(usdt);
        int24 bt = g.level(slot) - 20;
        _moveAndSettle(pool, b0 ? bt : -bt, 400);
    }

    /// Borrowing USDT on Venus makes vUSDT a collateral market for the owner, so a Yield Sweep on that market holds
    /// by default: supplying would change the loan, withdrawing could endanger it.
    function test_borrowedMarketIsCollateral_sweepHoldsByDefault() public {
        comp.setMember(owner, address(vUSDTsupply), true);
        YieldSweep s = _sweep(200 * E, 300 * E, 0);
        (uint8 st,,,) = s.preview();
        assertEq(st, 5);
        vm.expectRevert(YieldSweep.CollateralInUse.selector);
        s.act();
    }

    /// In collateral mode the sweep's limit must sit above the guard's target, or a withdrawal could drag health into
    /// the guard's zone and the guard would spend the refilled wallet. The product enforces minHealthAfter >= target
    /// + 0.2 when both exist; the contract enforces whatever limit was set.
    function test_collateralModeSweep_neverPushesHealthIntoTheGuardsZone() public {
        comp.setMember(owner, address(vUSDTsupply), true);
        LoanGuardV2 g = _guard();
        YieldSweep s = _sweep(200 * E, 300 * E, 2.0e18);
        comp.setWeighted(owner, 3000 * E); // health 3.0 with savings counted
        s.act(); // supply 750
        vm.prank(owner);
        usdt.transfer(sink, 150 * E); // wallet 100
        comp.setWeighted(owner, 1900 * E); // what health would be after withdrawing: 1.9
        vm.expectRevert(abi.encodeWithSelector(YieldSweep.HealthTooLow.selector, 1.9e18, 2.0e18));
        s.act();
        vm.expectRevert(); // and the guard is not triggered either: 1.9 is above its 1.4
        g.act();
    }

    /// Two allowances on one balance: the grid spends the wallet first, so the guard can only use what is left.
    function test_allowanceIsNotAReservation_gridCanStarveTheGuard() public {
        LoanGuardV2 g = _guard();
        GridBand gb = _grid();
        _gridDown(gb, 2);
        for (uint256 i; i < 4; ++i) {
            vm.prank(keel);
            gb.act(); // four buys of 200 USDT
        }
        assertEq(usdt.balanceOf(owner), 200 * E);
        comp.setWeighted(owner, 1300 * E); // the loan now needs about 278
        (uint8 st,,, uint256 available,) = g.preview();
        assertEq(st, 1);
        assertEq(available, 200 * E, "only the wallet's 200 is usable, not the 500 allowance");
        assertEq(g.act(), 200 * E);
    }

    /// The sweep refills the wallet from Venus after the grid spends it, so the next grid buy is funded.
    function test_sweepRefillsTheWallet_forTheGridsNextBuy() public {
        YieldSweep s = _sweep(400 * E, 600 * E, 0);
        GridBand gb = _grid();
        usdt.mint(owner, 1000 * E); // 2,000 in the wallet
        s.act(); // supplies down to 500
        assertEq(usdt.balanceOf(owner), 500 * E);
        _gridDown(gb, 4);
        vm.prank(keel);
        gb.act(); // 300 left
        vm.prank(keel);
        gb.act(); // 100 left: under the floor
        s.act(); // refill to 500
        assertApproxEqAbs(usdt.balanceOf(owner), 500 * E, 1e10);
    }

    /// Revoking one allowance or ending one charter changes nothing for the others.
    function test_oneCharterStopping_leavesTheOthersWorking() public {
        LoanGuardV2 g = _guard();
        YieldSweep s = _sweep(200 * E, 300 * E, 0);
        vm.startPrank(owner);
        s.end();
        usdt.approve(address(g), 500 * E);
        vm.stopPrank();
        comp.setWeighted(owner, 1300 * E);
        assertGt(g.act(), 0);
    }
}
