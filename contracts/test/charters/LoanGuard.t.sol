// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {CharterFactory} from "../../src/charters/CharterFactory.sol";
import {LoanGuard} from "../../src/charters/LoanGuard.sol";
import {HealthMath} from "../../src/charters/HealthMath.sol";
import {IComptroller} from "../../src/charters/VenusInterfaces.sol";
import {
    MockERC20,
    MockQuietERC20,
    MockFeeERC20,
    MockOracle,
    MockVAI,
    MockComptroller,
    MockVToken
} from "./mocks/VenusMocks.sol";

contract LoanGuardTest is Test {
    MockOracle oracle;
    MockComptroller comp;
    MockERC20 usdt;
    MockVToken vUSDT;
    MockERC20 usdc;
    MockVToken vUSDC;
    CharterFactory factory;

    address owner = makeAddr("owner");
    address keel = makeAddr("keel");
    address stranger = makeAddr("stranger");

    uint256 constant E = 1e18;

    function setUp() public {
        vm.warp(1_762_600_000);
        oracle = new MockOracle();
        comp = new MockComptroller(address(oracle));
        usdt = new MockERC20("USDT", 18);
        usdc = new MockERC20("USDC", 18);
        vUSDT = new MockVToken(address(usdt), address(comp));
        vUSDC = new MockVToken(address(usdc), address(comp));
        oracle.set(address(vUSDT), 1e18); // $1, 18 decimals: price scaled to 1e(36-18)
        oracle.set(address(vUSDC), 1e18);
        address[] memory m = new address[](2);
        m[0] = address(vUSDT);
        m[1] = address(vUSDC);
        factory = new CharterFactory(IComptroller(address(comp)), m);

        // Owner: $1,500 of liquidation-weighted collateral, 1,000 USDT borrowed. Health 1.50.
        address[] memory assets = new address[](1);
        assets[0] = address(vUSDT);
        comp.setAssets(owner, assets);
        comp.setWeighted(owner, 1500 * E);
        vUSDT.setBorrow(owner, 1000 * E);
        usdt.mint(owner, 2000 * E);
    }

    function _params(uint256 budget, uint256 tip) internal view returns (CharterFactory.Params memory p) {
        p = CharterFactory.Params({
            vDebt: address(vUSDT),
            trigger: 1.4e18,
            target: 1.8e18,
            budget: budget,
            tip: tip,
            expiresAt: uint64(block.timestamp + 30 days)
        });
    }

    function _guard(uint256 budget, uint256 tip, uint256 allowance) internal returns (LoanGuard g) {
        CharterFactory.Params memory p = _params(budget, tip);
        bytes32 salt = keccak256("one");
        address predicted = factory.predict(owner, p, salt);
        vm.startPrank(owner);
        usdt.approve(predicted, allowance); // approve first, then create: one touch for Pass
        g = LoanGuard(factory.create(p, salt));
        vm.stopPrank();
        assertEq(address(g), predicted, "predicted address");
    }

    function _health(address a) internal view returns (uint256 hf) {
        (hf,,) = factory.healthOf(a);
    }

    // ---------------------------------------------------------------- creation

    function test_createRecordsEverything() public {
        LoanGuard g = _guard(500 * E, 0, 500 * E);
        assertEq(g.owner(), owner);
        assertEq(g.token(), address(usdt));
        assertEq(address(g.vDebt()), address(vUSDT));
        assertEq(g.trigger(), 1.4e18);
        assertEq(g.target(), 1.8e18);
        assertEq(g.budget(), 500 * E);
        assertTrue(factory.isGuard(address(g)));
        assertEq(factory.guards(), 1);
        assertEq(g.KIND(), 1);
    }

    function test_createRejectsBadParams() public {
        CharterFactory.Params memory p = _params(100 * E, 0);
        vm.startPrank(owner);

        p.vDebt = address(0xBEEF);
        vm.expectRevert(abi.encodeWithSelector(CharterFactory.UnsupportedMarket.selector, address(0xBEEF)));
        factory.create(p, 0);
        p.vDebt = address(vUSDT);

        p.trigger = 1.01e18;
        vm.expectRevert(CharterFactory.BadTrigger.selector);
        factory.create(p, 0);
        p.trigger = 11e18;
        vm.expectRevert(CharterFactory.BadTrigger.selector);
        factory.create(p, 0);
        p.trigger = 1.4e18;

        p.target = 1.44e18; // gap under 0.05
        vm.expectRevert(CharterFactory.BadTarget.selector);
        factory.create(p, 0);
        p.target = 1.8e18;

        p.budget = 0;
        vm.expectRevert(CharterFactory.BadBudget.selector);
        factory.create(p, 0);
        p.budget = 100 * E;

        p.tip = 10 * E + 1; // over a tenth of the budget
        vm.expectRevert(CharterFactory.BadTip.selector);
        factory.create(p, 0);
        p.tip = 0;

        p.expiresAt = uint64(block.timestamp + 12 hours);
        vm.expectRevert(CharterFactory.BadExpiry.selector);
        factory.create(p, 0);
        p.expiresAt = uint64(block.timestamp + 91 days);
        vm.expectRevert(CharterFactory.BadExpiry.selector);
        factory.create(p, 0);
        vm.stopPrank();
    }

    function test_factoryRejectsForeignMarket() public {
        MockVToken foreign = new MockVToken(address(usdt), address(0xC0FFEE));
        address[] memory m = new address[](1);
        m[0] = address(foreign);
        vm.expectRevert(abi.encodeWithSelector(CharterFactory.WrongComptroller.selector, address(foreign)));
        new CharterFactory(IComptroller(address(comp)), m);
    }

    function test_sameSaltDifferentOwnersDoNotCollide() public {
        CharterFactory.Params memory p = _params(100 * E, 0);
        vm.prank(owner);
        address a = factory.create(p, bytes32("s"));
        vm.prank(stranger);
        address b = factory.create(p, bytes32("s"));
        assertTrue(a != b);
        assertEq(LoanGuard(b).owner(), stranger);
    }

    // ---------------------------------------------------------------- acting

    function test_healthyLoanCannotBeTouched() public {
        LoanGuard g = _guard(500 * E, 0, 500 * E);
        vm.expectRevert(abi.encodeWithSelector(LoanGuard.Healthy.selector, 1.5e18, 1.4e18));
        vm.prank(keel);
        g.act();
    }

    function test_actRepaysExactlyToTarget() public {
        LoanGuard g = _guard(500 * E, 0, 500 * E);
        comp.setWeighted(owner, 1300 * E); // collateral falls: health 1.30
        assertEq(_health(owner), 1.3e18);

        (uint8 state,, uint256 would,,,) = g.preview();
        assertEq(state, 1, "would act");

        vm.prank(keel);
        uint256 repaid = g.act();
        assertEq(repaid, would, "preview matches act");

        // 1300 / 1.8 = 722.22..., so about 277.78 USDT is repaid.
        assertApproxEqAbs(repaid, 277_777_777_777_777_777_779, 2);
        uint256 hf = _health(owner);
        assertGe(hf, 1.8e18, "at or above target");
        assertLe(hf, 1.8e18 + 1e9, "and not meaningfully past it");
        assertEq(usdt.balanceOf(owner), 2000 * E - repaid);
        assertEq(usdt.balanceOf(address(g)), 0, "guard holds nothing");
        assertEq(usdt.allowance(address(g), address(vUSDT)), 0, "no lingering protocol allowance");
        assertEq(g.spent(), repaid);
        assertEq(g.acts(), 1);

        vm.expectRevert(); // restored: a second call is refused
        g.act();
    }

    function test_budgetBoundsTheRepayment() public {
        LoanGuard g = _guard(100 * E, 0, 1000 * E);
        comp.setWeighted(owner, 1300 * E);
        vm.prank(keel);
        assertEq(g.act(), 100 * E);
        assertEq(g.remaining(), 0);
        // 1300 / 900 = 1.44: back above the trigger. Let it fall again with the budget spent.
        comp.setWeighted(owner, 1200 * E);
        (uint8 state,,,,,) = g.preview();
        assertEq(state, 5, "below trigger, nothing left to use");
        vm.expectRevert(LoanGuard.NothingAvailable.selector);
        vm.prank(keel);
        g.act();
    }

    function test_allowanceAndBalanceBoundTheRepayment() public {
        LoanGuard g = _guard(500 * E, 0, 60 * E);
        comp.setWeighted(owner, 1300 * E);
        vm.prank(keel);
        assertEq(g.act(), 60 * E, "allowance bound");

        vm.prank(owner);
        usdt.approve(address(g), 500 * E);
        vm.prank(owner);
        usdt.transfer(stranger, 2000 * E - 60 * E - 25 * E); // leave 25 USDT in the wallet
        vm.prank(keel);
        assertEq(g.act(), 25 * E, "balance bound");
    }

    function test_neverRepaysMoreThanTheDebtInThisMarket() public {
        // Most of the debt sits in USDC; the guard covers USDT only.
        address[] memory assets = new address[](2);
        assets[0] = address(vUSDT);
        assets[1] = address(vUSDC);
        comp.setAssets(owner, assets);
        vUSDT.setBorrow(owner, 50 * E);
        vUSDC.setBorrow(owner, 950 * E);
        LoanGuard g = _guard(500 * E, 0, 500 * E);
        comp.setWeighted(owner, 1300 * E);
        vm.prank(keel);
        assertEq(g.act(), 50 * E);
        assertEq(vUSDT.borrows(owner), 0);
    }

    function test_vaiDebtCountsTowardHealth() public {
        MockVAI vai = new MockVAI();
        comp.setVai(address(vai));
        vai.set(owner, 100 * E); // health 1500 / 1100 = 1.36
        LoanGuard g = _guard(500 * E, 0, 500 * E);
        vm.prank(keel);
        uint256 repaid = g.act();
        // 1500 / 1.8 = 833.33; debt 1100; repay about 266.67 of USDT
        assertApproxEqAbs(repaid, 266_666_666_666_666_666_668, 2);
        assertGe(_health(owner), 1.8e18);
    }

    function test_interestIsAccruedBeforeMeasuring() public {
        LoanGuard g = _guard(500 * E, 0, 500 * E);
        comp.setWeighted(owner, 1440 * E); // 1.44, above the 1.40 trigger on stored values
        vUSDT.setAccrue(owner, 40 * E); // accrual pushes debt to 1040: 1.3846
        vm.prank(keel);
        uint256 repaid = g.act();
        assertGt(repaid, 0);
        assertGe(_health(owner), 1.8e18);
    }

    function test_tipGoesToTheAgentNotTheOwnerAndCountsInBudget() public {
        LoanGuard g = _guard(500 * E, 2 * E, 1000 * E);
        comp.setWeighted(owner, 1300 * E);
        vm.prank(keel);
        uint256 repaid = g.act();
        assertEq(usdt.balanceOf(keel), 2 * E);
        assertEq(g.spent(), repaid + 2 * E);

        // The owner pressing Protect now pays no tip.
        comp.setWeighted(owner, 1000 * E);
        uint256 before = usdt.balanceOf(owner);
        vm.prank(owner);
        uint256 r2 = g.act();
        assertEq(usdt.balanceOf(owner), before - r2);
        assertEq(usdt.balanceOf(keel), 2 * E);
    }

    function test_tipNeverCrowdsOutRepayment() public {
        LoanGuard g = _guard(100 * E, 10 * E, 1000 * E);
        comp.setWeighted(owner, 1300 * E); // needs ~277, budget 100
        vm.prank(keel);
        assertEq(g.act(), 100 * E);
        assertEq(usdt.balanceOf(keel), 0, "no tip once the budget is spent on the loan");
    }

    function test_tipNeverExceedsTheRepaymentItRewards() public {
        // Health is low because of USDC debt; this guard's USDT market holds only dust.
        address[] memory assets = new address[](2);
        assets[0] = address(vUSDT);
        assets[1] = address(vUSDC);
        comp.setAssets(owner, assets);
        vUSDT.setBorrow(owner, 3);
        vUSDC.setBorrow(owner, 1000 * E);
        LoanGuard g = _guard(500 * E, 20 * E, 1000 * E);
        comp.setWeighted(owner, 1300 * E);
        (uint8 state,, uint256 would, uint256 tipIfAgent,,) = g.preview();
        assertEq(state, 1);
        assertEq(would, 3);
        assertEq(tipIfAgent, 3, "preview caps the tip at the repayment");
        vm.prank(keel);
        assertEq(g.act(), 3);
        assertEq(usdt.balanceOf(keel), 3, "the tip is the dust repaid, not the full 20 USDT");
        assertEq(g.spent(), 6);
    }

    function test_manyEnteredMarketsAreStillReadable() public {
        // Venus sets no per-account market limit; an owner in 30 markets must still be protectable.
        address[] memory assets = new address[](30);
        assets[0] = address(vUSDT);
        for (uint256 i = 1; i < 30; ++i) {
            MockVToken extra = new MockVToken(address(usdc), address(comp));
            oracle.set(address(extra), 1e18);
            assets[i] = address(extra);
        }
        comp.setAssets(owner, assets);
        LoanGuard g = _guard(500 * E, 0, 500 * E);
        comp.setWeighted(owner, 1300 * E);
        vm.prank(keel);
        assertGt(g.act(), 0);
        assertGe(_health(owner), 1.8e18);
    }

    // ---------------------------------------------------------------- ending

    function test_onlyOwnerEnds_andEndedGuardIsInert() public {
        LoanGuard g = _guard(500 * E, 0, 500 * E);
        vm.expectRevert(LoanGuard.NotOwner.selector);
        vm.prank(keel);
        g.end();

        vm.prank(owner);
        g.end();
        assertTrue(g.ended());
        comp.setWeighted(owner, 1300 * E);
        vm.expectRevert(LoanGuard.CharterEnded.selector);
        vm.prank(keel);
        g.act();
        (uint8 state,,,,,) = g.preview();
        assertEq(state, 2);
    }

    function test_expiredGuardIsInert_butOwnerCanStillEnd() public {
        LoanGuard g = _guard(500 * E, 0, 500 * E);
        comp.setWeighted(owner, 1300 * E);
        vm.warp(block.timestamp + 30 days);
        vm.expectRevert(LoanGuard.CharterExpired.selector);
        g.act();
        (uint8 state,,,,,) = g.preview();
        assertEq(state, 3);
        vm.prank(owner);
        g.end(); // stop works after expiry, with oracle down too
        comp.setErr(9);
        vm.prank(owner);
        g.end();
        assertTrue(g.ended());
    }

    function test_revokingTheAllowanceAloneStopsIt() public {
        LoanGuard g = _guard(500 * E, 0, 500 * E);
        vm.prank(owner);
        usdt.approve(address(g), 0);
        comp.setWeighted(owner, 1300 * E);
        vm.expectRevert(LoanGuard.NothingAvailable.selector);
        g.act();
    }

    // ---------------------------------------------------------------- failure paths

    function test_venusErrorsRevertWithoutSideEffects() public {
        LoanGuard g = _guard(500 * E, 0, 500 * E);
        comp.setWeighted(owner, 1300 * E);

        vUSDT.setErrors(3, 0);
        vm.expectRevert(abi.encodeWithSelector(LoanGuard.VenusError.selector, 3));
        g.act();

        vUSDT.setErrors(0, 4);
        vm.expectRevert(abi.encodeWithSelector(LoanGuard.VenusError.selector, 4));
        g.act();

        vUSDT.setErrors(0, 0);
        comp.setErr(1);
        vm.expectRevert(abi.encodeWithSelector(HealthMath.VenusError.selector, 1));
        g.act();
        assertEq(g.spent(), 0);
        assertEq(usdt.balanceOf(owner), 2000 * E);
    }

    function test_zeroPriceRefuses() public {
        LoanGuard g = _guard(500 * E, 0, 500 * E);
        comp.setWeighted(owner, 1300 * E);
        oracle.set(address(vUSDT), 0);
        vm.expectRevert();
        g.act();
    }

    function test_repayThatDoesNotReduceDebtReverts() public {
        LoanGuard g = _guard(500 * E, 0, 500 * E);
        comp.setWeighted(owner, 1300 * E);
        vUSDT.setSwallow(true);
        vm.expectRevert();
        g.act();
        assertEq(usdt.balanceOf(owner), 2000 * E, "whole call rolled back");
    }

    function test_reentryIsRefused() public {
        LoanGuard g = _guard(500 * E, 0, 500 * E);
        comp.setWeighted(owner, 1300 * E);
        vUSDT.setReenter(address(g));
        vm.expectRevert(LoanGuard.Reentrant.selector);
        g.act();
    }

    function test_feeOnTransferTokenIsRefused() public {
        MockFeeERC20 fee = new MockFeeERC20();
        MockVToken vFee = new MockVToken(address(fee), address(comp));
        oracle.set(address(vFee), 1e18);
        address[] memory m = new address[](1);
        m[0] = address(vFee);
        CharterFactory f2 = new CharterFactory(IComptroller(address(comp)), m);
        address[] memory assets = new address[](1);
        assets[0] = address(vFee);
        comp.setAssets(owner, assets);
        vFee.setBorrow(owner, 1000 * E);
        fee.mint(owner, 1000 * E);
        CharterFactory.Params memory p = _params(500 * E, 0);
        p.vDebt = address(vFee);
        vm.startPrank(owner);
        address g = f2.create(p, 0);
        fee.approve(g, 500 * E);
        vm.stopPrank();
        comp.setWeighted(owner, 1300 * E);
        vm.expectRevert();
        LoanGuard(g).act();
    }

    function test_quietUsdtStyleTokenWorks() public {
        MockQuietERC20 q = new MockQuietERC20();
        MockVToken vQ = new MockVToken(address(q), address(comp));
        oracle.set(address(vQ), 1e18);
        address[] memory m = new address[](1);
        m[0] = address(vQ);
        CharterFactory f2 = new CharterFactory(IComptroller(address(comp)), m);
        address[] memory assets = new address[](1);
        assets[0] = address(vQ);
        comp.setAssets(owner, assets);
        vQ.setBorrow(owner, 1000 * E);
        q.mint(owner, 1000 * E);
        CharterFactory.Params memory p = _params(500 * E, 0);
        p.vDebt = address(vQ);
        vm.startPrank(owner);
        address g = f2.create(p, 0);
        q.approve(g, 500 * E);
        vm.stopPrank();
        comp.setWeighted(owner, 1300 * E);
        assertGt(LoanGuard(g).act(), 0);
        assertEq(q.allowance(g, address(vQ)), 0);
    }

    function test_sweepReturnsStrayTokensToOwnerOnly() public {
        LoanGuard g = _guard(500 * E, 0, 500 * E);
        usdc.mint(address(g), 7 * E);
        vm.expectRevert(LoanGuard.NotOwner.selector);
        vm.prank(stranger);
        g.sweep(address(usdc));
        vm.prank(owner);
        g.sweep(address(usdc));
        assertEq(usdc.balanceOf(owner), 7 * E);
    }

    // ---------------------------------------------------------------- properties

    /// Whatever the collateral, debt, budget and allowance: one act never exceeds any bound,
    /// only ever moves the owner's tokens into the owner's own loan, and either restores the
    /// target or exhausts what the owner made available.
    function testFuzz_actRespectsEveryBound(uint96 collat, uint96 debt, uint96 budget, uint96 allow, uint96 bal)
        public
    {
        collat = uint96(bound(collat, 10 * E, 1e9 * E));
        debt = uint96(bound(debt, 1 * E, 1e9 * E));
        budget = uint96(bound(budget, 1, 1e9 * E));
        allow = uint96(bound(allow, 0, 1e9 * E));
        bal = uint96(bound(bal, 0, 1e9 * E));

        address o = makeAddr("fuzz-owner");
        address[] memory assets = new address[](1);
        assets[0] = address(vUSDT);
        comp.setAssets(o, assets);
        comp.setWeighted(o, collat);
        vUSDT.setBorrow(o, debt);
        usdt.mint(o, bal);

        CharterFactory.Params memory p = _params(budget, 0);
        vm.startPrank(o);
        address g = factory.create(p, bytes32(uint256(collat)));
        usdt.approve(g, allow);
        vm.stopPrank();

        uint256 hf0 = _health(o);
        vm.prank(keel);
        try LoanGuard(g).act() returns (uint256 repaid) {
            assertLt(hf0, 1.4e18, "acted only below trigger");
            assertLe(repaid, budget);
            assertLe(repaid, allow);
            assertLe(repaid, bal);
            assertLe(repaid, debt);
            assertEq(usdt.balanceOf(o), uint256(bal) - repaid);
            assertEq(vUSDT.borrows(o), uint256(debt) - repaid);
            assertEq(usdt.balanceOf(g), 0);
            uint256 hf1 = _health(o);
            bool limited = repaid == budget || repaid == allow || repaid == bal || repaid == debt;
            assertTrue(hf1 >= 1.8e18 || limited, "target reached or a limit hit");
        } catch {
            assertEq(usdt.balanceOf(o), bal, "a refused act moves nothing");
            assertEq(vUSDT.borrows(o), debt);
        }
    }
}
