// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {LoanGuardV2} from "../../src/charters/loan/LoanGuardV2.sol";
import {LoanGuardFactoryV2} from "../../src/charters/loan/LoanGuardFactoryV2.sol";
import {CharterBase} from "../../src/charters/base/CharterBase.sol";
import {FactoryBase} from "../../src/charters/base/FactoryBase.sol";
import {IComptroller} from "../../src/charters/VenusInterfaces.sol";
import {MockERC20, MockOracle, MockVAI, MockComptroller, MockVToken} from "./mocks/VenusMocks.sol";

contract LoanGuardV2Test is Test {
    uint256 constant E = 1e18;
    MockOracle oracle;
    MockComptroller comp;
    MockERC20 usdt;
    MockVToken vUSDT;
    LoanGuardFactoryV2 factory;
    address owner = makeAddr("owner");
    address keel = makeAddr("keel");

    function setUp() public {
        vm.warp(1_762_700_000);
        oracle = new MockOracle();
        comp = new MockComptroller(address(oracle));
        usdt = new MockERC20("USDT", 18);
        vUSDT = new MockVToken(address(usdt), address(comp));
        oracle.set(address(vUSDT), 1e18);
        address[] memory m = new address[](1);
        m[0] = address(vUSDT);
        factory = new LoanGuardFactoryV2(IComptroller(address(comp)), m);
        address[] memory assets = new address[](1);
        assets[0] = address(vUSDT);
        comp.setAssets(owner, assets);
        comp.setWeighted(owner, 1500 * E);
        vUSDT.setBorrow(owner, 1000 * E);
        usdt.mint(owner, 2000 * E);
    }

    function _create(uint256 budget, uint256 minRepay, uint256 tip, uint256 tipBudget, uint256 allowance)
        internal
        returns (LoanGuardV2 g)
    {
        LoanGuardFactoryV2.Create memory a = LoanGuardFactoryV2.Create({
            p: LoanGuardV2.Params(address(vUSDT), 1.4e18, 1.8e18, budget, minRepay),
            expiresAt: uint64(block.timestamp + 30 days),
            tipPerAction: tip,
            tipBudget: tipBudget
        });
        address predicted = factory.predict(owner, a, bytes32("s"));
        vm.startPrank(owner);
        usdt.approve(predicted, allowance);
        g = LoanGuardV2(factory.create(a, bytes32("s")));
        vm.stopPrank();
        assertEq(address(g), predicted);
    }

    function test_restoresTargetExactly_andHoldsNothing() public {
        LoanGuardV2 g = _create(500 * E, 5 * E, 0, 0, 500 * E);
        vm.expectRevert(abi.encodeWithSelector(LoanGuardV2.Healthy.selector, 1.5e18, 1.4e18));
        g.act();
        comp.setWeighted(owner, 1300 * E);
        (uint8 st,, uint256 would,,) = g.preview();
        assertEq(st, 1);
        vm.prank(keel);
        uint256 r = g.act();
        assertEq(r, would);
        (uint256 hf,,) = factory.healthOf(owner);
        assertGe(hf, 1.8e18);
        assertLe(hf, 1.8e18 + 1e9);
        assertEq(usdt.balanceOf(address(g)), 0);
        assertEq(g.actions(), 1);
    }

    function test_minRepay_blocksDust_butAllowsAFullPayoff() public {
        LoanGuardV2 g = _create(500 * E, 50 * E, 0, 0, 30 * E); // allowance only 30
        comp.setWeighted(owner, 1300 * E);
        (uint8 st,,,,) = g.preview();
        assertEq(st, 6, "below minimum");
        vm.expectRevert(abi.encodeWithSelector(LoanGuardV2.BelowMinimum.selector, 30 * E, 50 * E));
        g.act();
        // Paying a market's debt off entirely is allowed even under the minimum: 20 USDT left in this market,
        // the rest of the debt in USDC.
        MockVToken vUSDC = new MockVToken(address(new MockERC20("USDC", 18)), address(comp));
        oracle.set(address(vUSDC), 1e18);
        address[] memory assets = new address[](2);
        assets[0] = address(vUSDT);
        assets[1] = address(vUSDC);
        comp.setAssets(owner, assets);
        vUSDT.setBorrow(owner, 20 * E);
        vUSDC.setBorrow(owner, 980 * E);
        assertEq(g.act(), 20 * E);
        assertEq(vUSDT.borrows(owner), 0);
    }

    function test_tipsHaveTheirOwnBudget_andNeverReduceRepayment() public {
        LoanGuardV2 g = _create(300 * E, 5 * E, 2 * E, 3 * E, 303 * E);
        comp.setWeighted(owner, 1300 * E);
        vm.prank(keel);
        uint256 r = g.act();
        assertEq(usdt.balanceOf(keel), 2 * E);
        assertEq(g.spent(), r, "capital counts only repayment");
        assertEq(g.tipsPaid(), 2 * E);
        comp.setWeighted(owner, 900 * E);
        vm.prank(keel);
        g.act();
        assertEq(usdt.balanceOf(keel), 3 * E, "the tip budget caps total tips");
        assertEq(g.tipsPaid(), 3 * E);
    }

    function test_ownerPaysNoTip_andTipNeverRevertsTheAction() public {
        LoanGuardV2 g = _create(500 * E, 5 * E, 2 * E, 10 * E, 278 * E); // just enough for the repayment
        comp.setWeighted(owner, 1300 * E);
        vm.prank(keel);
        uint256 r = g.act(); // the repayment takes nearly all the allowance: the tip is cut to what is left
        assertEq(usdt.balanceOf(keel), 278 * E - r, "tip limited to the remaining allowance, action stands");
        assertLt(usdt.balanceOf(keel), 2 * E);
    }

    function test_endIsOwnerOnlyAndFinal() public {
        LoanGuardV2 g = _create(500 * E, 5 * E, 0, 0, 500 * E);
        vm.expectRevert(CharterBase.NotOwner.selector);
        g.end();
        vm.prank(owner);
        g.end();
        comp.setWeighted(owner, 1300 * E);
        vm.expectRevert(CharterBase.CharterEnded.selector);
        g.act();
        comp.setErr(9); // Venus failing does not matter for ending
        vm.prank(owner);
        g.end();
    }

    function test_factoryBounds() public {
        LoanGuardFactoryV2.Create memory a = LoanGuardFactoryV2.Create({
            p: LoanGuardV2.Params(address(vUSDT), 1.4e18, 1.8e18, 100 * E, 26 * E),
            expiresAt: uint64(block.timestamp + 30 days),
            tipPerAction: 0,
            tipBudget: 0
        });
        vm.expectRevert(LoanGuardFactoryV2.BadBudget.selector); // minRepay above a quarter of the budget
        factory.create(a, 0);
        a.p.minRepay = 5 * E;
        a.tipPerAction = 2 * E;
        a.tipBudget = 1 * E;
        vm.expectRevert(FactoryBase.BadTip.selector);
        factory.create(a, 0);
        a.tipBudget = 4 * E;
        a.expiresAt = uint64(block.timestamp + 181 days);
        vm.expectRevert(FactoryBase.BadExpiry.selector);
        factory.create(a, 0);
    }

    function testFuzz_boundsHold(uint96 collat, uint96 debt, uint96 budget, uint96 allow, uint96 bal) public {
        collat = uint96(bound(collat, 10 * E, 1e9 * E));
        debt = uint96(bound(debt, 1 * E, 1e9 * E));
        budget = uint96(bound(budget, 4, 1e9 * E));
        allow = uint96(bound(allow, 0, 1e9 * E));
        bal = uint96(bound(bal, 0, 1e9 * E));
        address o = makeAddr("fuzz");
        address[] memory assets = new address[](1);
        assets[0] = address(vUSDT);
        comp.setAssets(o, assets);
        comp.setWeighted(o, collat);
        vUSDT.setBorrow(o, debt);
        usdt.mint(o, bal);
        LoanGuardFactoryV2.Create memory a = LoanGuardFactoryV2.Create({
            p: LoanGuardV2.Params(address(vUSDT), 1.4e18, 1.8e18, budget, budget / 4),
            expiresAt: uint64(block.timestamp + 30 days),
            tipPerAction: 0,
            tipBudget: 0
        });
        vm.startPrank(o);
        LoanGuardV2 g = LoanGuardV2(factory.create(a, bytes32(uint256(collat))));
        usdt.approve(address(g), allow);
        vm.stopPrank();
        try g.act() returns (uint256 r) {
            assertLe(r, budget);
            assertLe(r, allow);
            assertLe(r, bal);
            assertLe(r, debt);
            assertTrue(r >= budget / 4 || r == debt, "never below the minimum unless it pays the debt off");
            assertEq(usdt.balanceOf(address(g)), 0);
        } catch {
            assertEq(usdt.balanceOf(o), bal);
            assertEq(vUSDT.borrows(o), debt);
        }
    }
}
