// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {YieldSweep} from "../../../src/charters/yield/YieldSweep.sol";
import {YieldSweepFactory} from "../../../src/charters/yield/YieldSweepFactory.sol";
import {LoanGuardV2} from "../../../src/charters/loan/LoanGuardV2.sol";
import {LoanGuardFactoryV2} from "../../../src/charters/loan/LoanGuardFactoryV2.sol";
import {IComptrollerSupply} from "../../../src/charters/base/VenusSupply.sol";
import {IComptroller} from "../../../src/charters/VenusInterfaces.sol";
import {MockERC20, MockOracle, MockComptroller, MockVToken} from "../mocks/VenusMocks.sol";
import {MockSupplyComptroller, MockVTokenSupply} from "../mocks/VenusSupplyMocks.sol";
import {RestrictingERC20} from "../mocks/RestrictingERC20.sol";

/// Regression tests for the remediation on security/charters-hardening-20261118. Every test here FAILS on the
/// deployed baseline (fcd8552) and PASSES on the candidate. They use only symbols that exist in both versions
/// (generic expectRevert, locally declared events) so the same file compiles against either.
contract SecurityRegressionTest is Test {
    uint256 constant E = 1e18;

    event TipSkipped(address indexed to, address indexed token, uint256 amount);
    event TipPaid(address indexed to, address indexed token, uint256 amount);

    MockOracle oracle;
    RestrictingERC20 usdt;
    address owner = makeAddr("owner");
    address keeper = makeAddr("keeper");
    address keeper2 = makeAddr("keeper2");
    address lp = makeAddr("lp");

    // ---------- Yield Sweep fixture ----------
    MockSupplyComptroller scomp;
    MockVTokenSupply vSup;
    YieldSweepFactory ysf;

    function _yield(uint256 tip, uint256 tipBudget) internal returns (YieldSweep s) {
        scomp = new MockSupplyComptroller(address(oracle));
        vSup = new MockVTokenSupply(address(usdt), address(scomp), 2e26);
        scomp.setSupplyCap(address(vSup), 1e9 * E);
        address[] memory m = new address[](1);
        m[0] = address(vSup);
        ysf = new YieldSweepFactory(IComptrollerSupply(address(scomp)), m);
        usdt.mint(lp, 100_000 * E);
        vm.startPrank(lp);
        usdt.approve(address(vSup), type(uint256).max);
        vSup.mintFor(lp, 100_000 * E);
        vm.stopPrank();
        YieldSweepFactory.Create memory a = YieldSweepFactory.Create({
            p: YieldSweep.Params(address(vSup), 200 * E, 300 * E, 20 * E, 5_000 * E, 0),
            expiresAt: uint64(block.timestamp + 60 days),
            tipPerAction: tip,
            tipBudget: tipBudget
        });
        address predicted = ysf.predict(owner, a, bytes32("y"));
        vm.startPrank(owner);
        usdt.approve(predicted, 5_000 * E + tipBudget);
        vSup.approve(predicted, ysf.vTokenAllowanceFor(address(vSup), 5_000 * E));
        s = YieldSweep(ysf.create(a, bytes32("y")));
        vm.stopPrank();
    }

    // ---------- Loan Guard v2 fixture ----------
    MockComptroller comp;
    MockVToken vDebt;
    LoanGuardFactoryV2 lgf;

    function _loan(uint256 tip, uint256 tipBudget) internal returns (LoanGuardV2 g) {
        comp = new MockComptroller(address(oracle));
        vDebt = new MockVToken(address(usdt), address(comp));
        oracle.set(address(vDebt), 1e18);
        address[] memory m = new address[](1);
        m[0] = address(vDebt);
        lgf = new LoanGuardFactoryV2(IComptroller(address(comp)), m);
        comp.setAssets(owner, m);
        comp.setWeighted(owner, 1500 * E);
        vDebt.setBorrow(owner, 1000 * E);
        LoanGuardFactoryV2.Create memory a = LoanGuardFactoryV2.Create({
            p: LoanGuardV2.Params(address(vDebt), 1.4e18, 1.8e18, 500 * E, 5 * E),
            expiresAt: uint64(block.timestamp + 30 days),
            tipPerAction: tip,
            tipBudget: tipBudget
        });
        address predicted = lgf.predict(owner, a, bytes32("l"));
        vm.startPrank(owner);
        usdt.approve(predicted, 500 * E + tipBudget);
        g = LoanGuardV2(lgf.create(a, bytes32("l")));
        vm.stopPrank();
    }

    function setUp() public {
        vm.warp(1_762_700_000);
        oracle = new MockOracle();
        usdt = new RestrictingERC20();
        usdt.mint(owner, 1_000 * E);
    }

    /// R-02 (MC-CX-001 / MC-CL-002): a tip the token refuses (revert) no longer rolls back the Yield Sweep action.
    function test_R02_yield_tipRevert_actionStands_tipNotCounted() public {
        YieldSweep s = _yield(1 * E, 10 * E);
        usdt.setBlocked(keeper, true);
        vm.expectEmit(true, true, false, true, address(s));
        emit TipSkipped(keeper, address(usdt), 1 * E);
        vm.prank(keeper);
        (bool supplied, uint256 amount) = s.act();
        assertTrue(supplied);
        assertEq(amount, 750 * E);
        assertEq(usdt.balanceOf(owner), 250 * E, "wallet at mid, no tip taken");
        assertEq(s.tipsPaid(), 0, "a skipped tip is not counted");
        assertEq(usdt.balanceOf(address(s)), 0);
    }

    /// R-02: a tip token that returns false (instead of reverting) is also skipped, not fatal.
    function test_R02_loan_tipReturnsFalse_repaymentStands() public {
        LoanGuardV2 g = _loan(2 * E, 20 * E);
        usdt.setBlocked(keeper, true);
        usdt.setReturnFalse(true);
        comp.setWeighted(owner, 1300 * E);
        vm.prank(keeper);
        uint256 repaid = g.act();
        assertGt(repaid, 0, "the repayment went through");
        assertEq(g.tipsPaid(), 0);
        assertEq(usdt.balanceOf(keeper), 0);
        assertEq(g.spent(), repaid);
    }

    /// R-02 (no regression): an ordinary tip is still paid and counted.
    function test_R02_loan_ordinaryTipStillPaid() public {
        LoanGuardV2 g = _loan(2 * E, 20 * E);
        comp.setWeighted(owner, 1300 * E);
        vm.expectEmit(true, true, false, true, address(g));
        emit TipPaid(keeper2, address(usdt), 2 * E);
        vm.prank(keeper2);
        g.act();
        assertEq(g.tipsPaid(), 2 * E);
        assertEq(usdt.balanceOf(keeper2), 2 * E);
    }

    /// R-05 (MC-CL-004): redeeming a dust final tranche no longer earns a full tip.
    function test_R05_yield_dustFinalTranche_paysNoTip() public {
        YieldSweep s = _yield(1 * E, 10 * E);
        vm.prank(keeper);
        s.act(); // supply 750: wallet 250
        uint256 tipAfterSupply = usdt.balanceOf(keeper);
        assertEq(tipAfterSupply, 1 * E, "a real action is still tipped");
        uint256 vb = vSup.balanceOf(owner);
        vm.prank(owner);
        vSup.redeemAs(owner, vb - 1);
        uint256 spend = usdt.balanceOf(owner) - 100 * E;
        vm.prank(owner);
        usdt.transfer(lp, spend); // wallet 100, below the floor
        vm.prank(keeper);
        (, uint256 amount) = s.act();
        assertLt(amount, s.minAction());
        assertEq(usdt.balanceOf(keeper), tipAfterSupply, "no tip for a dust action");
    }

    /// R-09 (MC-CX-002 / MC-CL-003): the zero address cannot take an executor slot.
    function test_R09_zeroExecutorRefused() public {
        YieldSweep s = _yield(0, 0);
        vm.prank(owner);
        vm.expectRevert();
        s.setExecutor(address(0), true);
        assertEq(s.executorCount(), 0);
        assertFalse(s.isExecutor(address(0)));
    }
}
