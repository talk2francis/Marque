// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {YieldSweep} from "../../src/charters/yield/YieldSweep.sol";
import {YieldSweepFactory} from "../../src/charters/yield/YieldSweepFactory.sol";
import {CharterBase} from "../../src/charters/base/CharterBase.sol";
import {IComptrollerSupply} from "../../src/charters/base/VenusSupply.sol";
import {MockERC20, MockOracle, MockVToken} from "./mocks/VenusMocks.sol";
import {MockSupplyComptroller, MockVTokenSupply} from "./mocks/VenusSupplyMocks.sol";

contract YieldSweepTest is Test {
    uint256 constant E = 1e18;
    MockOracle oracle;
    MockSupplyComptroller comp;
    MockERC20 usdt;
    MockVTokenSupply vUSDT;
    YieldSweepFactory factory;
    address owner = makeAddr("owner");
    address keeper = makeAddr("keeper");
    address lp = makeAddr("lp");

    function setUp() public {
        vm.warp(1_762_700_000);
        oracle = new MockOracle();
        comp = new MockSupplyComptroller(address(oracle));
        usdt = new MockERC20("USDT", 18);
        vUSDT = new MockVTokenSupply(address(usdt), address(comp), 2e26); // 0.02 underlying per vToken
        comp.setSupplyCap(address(vUSDT), 1e9 * E);
        address[] memory m = new address[](1);
        m[0] = address(vUSDT);
        factory = new YieldSweepFactory(IComptrollerSupply(address(comp)), m);
        // Other suppliers give the market cash to pay out.
        usdt.mint(lp, 100_000 * E);
        vm.startPrank(lp);
        usdt.approve(address(vUSDT), type(uint256).max);
        vUSDT.mintFor(lp, 100_000 * E);
        vm.stopPrank();
        usdt.mint(owner, 1_000 * E);
    }

    function _create(uint256 floor, uint256 ceiling, uint256 minAction, uint256 cap, uint256 minHealth)
        internal
        returns (YieldSweep s)
    {
        YieldSweepFactory.Create memory a = YieldSweepFactory.Create({
            p: YieldSweep.Params(address(vUSDT), floor, ceiling, minAction, cap, minHealth),
            expiresAt: uint64(block.timestamp + 60 days),
            tipPerAction: 0,
            tipBudget: 0
        });
        uint256 vAllow = factory.vTokenAllowanceFor(address(vUSDT), cap);
        address predicted = factory.predict(owner, a, bytes32("y"));
        vm.startPrank(owner);
        usdt.approve(predicted, cap);
        vUSDT.approve(predicted, vAllow);
        s = YieldSweep(factory.create(a, bytes32("y")));
        vm.stopPrank();
        assertEq(address(s), predicted);
    }

    function _std() internal returns (YieldSweep) {
        return _create(200 * E, 300 * E, 20 * E, 5_000 * E, 0);
    }

    function test_suppliesExcessDownToMid_andVTokensLandWithOwner() public {
        YieldSweep s = _std();
        (uint8 st, uint256 amt,,) = s.preview();
        assertEq(st, 1);
        assertEq(amt, 750 * E);
        vm.prank(keeper);
        (bool supplied, uint256 amount) = s.act();
        assertTrue(supplied);
        assertEq(amount, 750 * E);
        assertEq(usdt.balanceOf(owner), 250 * E, "wallet at mid");
        assertEq(vUSDT.balanceOf(owner), 750 * E * 1e18 / 2e26, "vTokens owned by the owner");
        assertEq(s.heldV(), vUSDT.balanceOf(owner));
        assertEq(usdt.balanceOf(address(s)), 0);
        assertEq(vUSDT.balanceOf(address(s)), 0);
        assertEq(usdt.allowance(address(s), address(vUSDT)), 0);
    }

    function test_inBandDoesNothing_andHysteresisPreventsChurn() public {
        YieldSweep s = _std();
        s.act(); // wallet 250
        vm.prank(owner);
        usdt.transfer(lp, 40 * E); // 210: still inside [200, 300]
        vm.expectRevert(abi.encodeWithSelector(YieldSweep.InBand.selector, 210 * E));
        s.act();
        usdt.mint(owner, 80 * E); // 290: still inside
        vm.expectRevert(abi.encodeWithSelector(YieldSweep.InBand.selector, 290 * E));
        s.act();
        assertEq(s.actions(), 1);
    }

    function test_withdrawsBackToMid_whenWalletFallsUnderFloor() public {
        YieldSweep s = _std();
        s.act();
        vm.prank(owner);
        usdt.transfer(lp, 150 * E); // wallet 100
        vm.prank(keeper);
        (bool supplied, uint256 got) = s.act();
        assertFalse(supplied);
        assertApproxEqAbs(got, 150 * E, 1e9);
        assertApproxEqAbs(usdt.balanceOf(owner), 250 * E, 1e9);
        assertEq(vUSDT.balanceOf(address(s)), 0);
        assertEq(usdt.balanceOf(address(s)), 0);
    }

    function test_withdrawalIncludesInterestAtTheCurrentRate() public {
        YieldSweep s = _std();
        s.act();
        vUSDT.setAccrue(2e24); // rate rises 1% on the next accrual
        vm.prank(owner);
        usdt.transfer(lp, 150 * E);
        s.act();
        // wallet back at mid; fewer vTokens were needed because each is now worth more
        assertApproxEqAbs(usdt.balanceOf(owner), 250 * E, 1e10);
        uint256 vLeft = vUSDT.balanceOf(owner);
        assertGt(vLeft * 2.02e26 / 1e18, 600 * E, "remaining supply carries the interest");
    }

    function test_grossLifetimeCapIsNotResetByRecycling() public {
        YieldSweep s = _create(200 * E, 300 * E, 20 * E, 1_000 * E, 0);
        s.act(); // supplies 750
        vm.prank(owner);
        usdt.transfer(lp, 200 * E);
        s.act(); // withdraws back to 250
        usdt.mint(owner, 600 * E); // 850 in wallet
        (uint8 st, uint256 amt,,) = s.preview();
        assertEq(st, 1);
        assertEq(amt, 250 * E, "only 250 of the 1,000 lifetime cap is left");
        s.act();
        assertEq(s.grossSupplied(), 1_000 * E);
        usdt.mint(owner, 500 * E);
        (st,,,) = s.preview();
        assertEq(st, 6, "cap reached");
        vm.expectRevert(abi.encodeWithSelector(YieldSweep.NothingToDo.selector, uint8(6)));
        s.act();
    }

    function test_neverWithdrawsTheOwnersEarlierDeposits() public {
        // The owner already had 500 USDT supplied before the charter.
        usdt.mint(owner, 500 * E);
        vm.startPrank(owner);
        usdt.approve(address(vUSDT), 500 * E);
        vUSDT.mintFor(owner, 500 * E);
        vm.stopPrank();
        uint256 own = vUSDT.balanceOf(owner);
        YieldSweep s = _std();
        // wallet 1,000: supply 750; then spend down to 0
        s.act();
        vm.prank(owner);
        usdt.transfer(lp, 250 * E);
        s.act(); // withdraws 250
        vm.prank(owner);
        usdt.transfer(lp, 250 * E);
        s.act(); // withdraws 250
        vm.prank(owner);
        usdt.transfer(lp, 250 * E);
        s.act(); // the last 250 of its own supply
        vm.prank(owner);
        usdt.transfer(lp, 250 * E);
        (uint8 st,,,) = s.preview();
        assertEq(st, 8, "nothing of its own left");
        vm.expectRevert();
        s.act();
        assertApproxEqAbs(vUSDT.balanceOf(owner), own, 2, "the earlier deposit is untouched");
    }

    function test_ownerRedeemingManuallyShrinksWhatTheCharterMayWithdraw() public {
        YieldSweep s = _std();
        s.act(); // heldV = 750 worth
        uint256 half = vUSDT.balanceOf(owner) / 2;
        vUSDT.redeemAs(owner, half);
        // the owner later deposits again on their own
        vm.startPrank(owner);
        usdt.approve(address(vUSDT), 300 * E);
        vUSDT.mintFor(owner, 300 * E);
        usdt.transfer(lp, usdt.balanceOf(owner) - 50 * E);
        vm.stopPrank();
        s.act(); // reconciles heldV to the owner's balance before acting
        assertLe(s.heldV(), vUSDT.balanceOf(owner));
    }

    function test_liquidityShortage_paysWhatVenusCan_neverPromisesMore() public {
        YieldSweep s = _std();
        s.act();
        // Borrowers take almost all the cash.
        vUSDT.lend(lp, usdt.balanceOf(address(vUSDT)) - 30 * E);
        vm.prank(owner);
        usdt.transfer(lp, 200 * E); // wallet 50: wants 200 back
        (uint8 st, uint256 amt,,) = s.preview();
        assertEq(st, 2, "30 is above the 20 minimum: partial withdrawal");
        assertApproxEqAbs(amt, 30 * E, 1e9);
        s.act();
        assertApproxEqAbs(usdt.balanceOf(owner), 80 * E, 1e10);
        assertEq(vUSDT.getCash(), 0, "the market is fully drawn");
        (st,,,) = s.preview();
        assertEq(st, 7, "liquidity short");
        vm.expectRevert(abi.encodeWithSelector(YieldSweep.NothingToDo.selector, uint8(7)));
        s.act();
    }

    function test_redeemFeeIsMeasuredNotAssumed() public {
        YieldSweep s = _std();
        s.act();
        vUSDT.setRedeemFee(10); // 0.1%
        vm.prank(owner);
        usdt.transfer(lp, 150 * E);
        (, uint256 got) = s.act();
        assertApproxEqAbs(got, 150 * E * 9990 / 10_000, 1e10);
        assertEq(usdt.balanceOf(address(s)), 0);
    }

    function test_venusSupplyCapHeadroomBoundsSupply() public {
        YieldSweep s = _std();
        comp.setSupplyCap(address(vUSDT), 100_000 * E + 100 * E); // 100 of headroom left
        (uint8 st, uint256 amt,,) = s.preview();
        assertEq(st, 1);
        assertApproxEqAbs(amt, 100 * E * 999 / 1000, 1e10);
        s.act();
        comp.setSupplyCap(address(vUSDT), 1); // supply closed
        usdt.mint(owner, 500 * E);
        (st,,,) = s.preview();
        assertEq(st, 6);
    }

    /// BSC testnet's vUSDT and vUSDC carry an unlimited supply cap (type(uint256).max); the headroom must not overflow.
    function test_unlimitedVenusSupplyCap_suppliesNormally() public {
        YieldSweep s = _std();
        comp.setSupplyCap(address(vUSDT), type(uint256).max);
        (uint8 st, uint256 amt,,) = s.preview();
        assertEq(st, 1);
        assertEq(amt, 750 * E);
        vm.prank(keeper);
        (bool supplied, uint256 amount) = s.act();
        assertTrue(supplied);
        assertEq(amount, 750 * E);
    }

    function test_holdsInACollateralMarketByDefault() public {
        YieldSweep s = _std();
        comp.setMember(owner, address(vUSDT), true);
        (uint8 st,,,) = s.preview();
        assertEq(st, 5);
        vm.expectRevert(YieldSweep.CollateralInUse.selector);
        s.act();
    }

    function test_collateralModeWithdrawsOnlyWhileHealthStaysAboveLimit() public {
        YieldSweep s = _create(200 * E, 300 * E, 20 * E, 5_000 * E, 1.5e18);
        comp.setMember(owner, address(vUSDT), true);
        // a loan elsewhere: 100 USD of debt in a USDC market; collateral weight set directly
        MockERC20 usdc = new MockERC20("USDC", 18);
        MockVToken vUSDC = new MockVToken(address(usdc), address(comp));
        oracle.set(address(vUSDC), 1e18);
        address[] memory assets = new address[](1);
        assets[0] = address(vUSDC);
        comp.setAssets(owner, assets);
        vUSDC.setBorrow(owner, 100 * E);
        comp.setWeighted(owner, 600 * E); // health 6.0 including the supply
        s.act(); // supply 750
        vm.prank(owner);
        usdt.transfer(lp, 150 * E);
        comp.setWeighted(owner, 140 * E); // health would be 1.4 after: below the 1.5 limit
        vm.expectRevert(abi.encodeWithSelector(YieldSweep.HealthTooLow.selector, 1.4e18, 1.5e18));
        s.act();
        comp.setWeighted(owner, 400 * E);
        s.act();
    }

    function test_endStopsEverything_andTheOwnerKeepsEverything() public {
        YieldSweep s = _std();
        s.act();
        uint256 v = vUSDT.balanceOf(owner);
        vm.prank(owner);
        s.end();
        vm.prank(owner);
        usdt.transfer(lp, 200 * E);
        vm.expectRevert(CharterBase.CharterEnded.selector);
        s.act();
        assertEq(vUSDT.balanceOf(owner), v, "the supply was always the owner's");
    }

    function test_factoryRejectsBandsWithoutHysteresis() public {
        YieldSweepFactory.Create memory a = YieldSweepFactory.Create({
            p: YieldSweep.Params(address(vUSDT), 200 * E, 230 * E, 20 * E, 5_000 * E, 0),
            expiresAt: uint64(block.timestamp + 60 days),
            tipPerAction: 0,
            tipBudget: 0
        });
        vm.expectRevert(YieldSweepFactory.BadBand.selector);
        factory.create(a, 0);
        a.p.ceiling = 300 * E;
        a.p.minHealthAfter = 1.05e18;
        vm.expectRevert(YieldSweepFactory.BadBand.selector);
        factory.create(a, 0);
    }

    function test_tipComesFromItsOwnBudget() public {
        YieldSweepFactory.Create memory a = YieldSweepFactory.Create({
            p: YieldSweep.Params(address(vUSDT), 200 * E, 300 * E, 20 * E, 5_000 * E, 0),
            expiresAt: uint64(block.timestamp + 60 days),
            tipPerAction: 1 * E,
            tipBudget: 2 * E
        });
        address predicted = factory.predict(owner, a, bytes32("t"));
        vm.startPrank(owner);
        usdt.approve(predicted, 5_000 * E + 2 * E);
        vUSDT.approve(predicted, type(uint256).max);
        YieldSweep s = YieldSweep(factory.create(a, bytes32("t")));
        vm.stopPrank();
        vm.prank(keeper);
        s.act();
        assertEq(usdt.balanceOf(keeper), 1 * E);
        assertEq(s.tipsPaid(), 1 * E);
        assertEq(s.grossSupplied(), 750 * E, "capital and tips are counted apart");
    }

    /// Any sequence of wallet changes and calls: gross supply never exceeds the cap, the charter never holds funds,
    /// and it never withdraws more vTokens than it supplied.
    function testFuzz_walletChurn(uint64[8] memory moves, bool[8] memory spend) public {
        YieldSweep s = _create(200 * E, 300 * E, 20 * E, 3_000 * E, 0);
        uint256 supplied;
        uint256 withdrawnV;
        for (uint256 i; i < 8; ++i) {
            uint256 amt = bound(uint256(moves[i]), 0, 900) * E;
            if (spend[i]) {
                uint256 b = usdt.balanceOf(owner);
                vm.prank(owner);
                usdt.transfer(lp, amt > b ? b : amt);
            } else {
                usdt.mint(owner, amt);
            }
            uint256 vBefore = vUSDT.balanceOf(owner);
            try s.act() returns (bool isSupply, uint256 a) {
                if (isSupply) supplied += a;
                else withdrawnV += vBefore - vUSDT.balanceOf(owner);
            } catch {}
            assertEq(usdt.balanceOf(address(s)), 0);
            assertEq(vUSDT.balanceOf(address(s)), 0);
            assertLe(s.grossSupplied(), 3_000 * E);
            assertLe(s.heldV(), vUSDT.balanceOf(owner));
        }
        assertEq(s.grossSupplied(), supplied);
        assertLe(withdrawnV, supplied * 1e18 / 2e26 + 1);
    }
}
