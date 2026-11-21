// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {LoanGuardV2} from "../../../src/charters/loan/LoanGuardV2.sol";
import {LoanGuardFactoryV2} from "../../../src/charters/loan/LoanGuardFactoryV2.sol";
import {IComptroller} from "../../../src/charters/VenusInterfaces.sol";
import {MockOracle, MockComptroller, MockVToken} from "../mocks/VenusMocks.sol";
import {RestrictingERC20} from "../mocks/RestrictingERC20.sol";

/// Stateful handler for the DEPLOYED v2 Loan Guard plus the shared CharterBase (tips, executors, end), which the
/// pre-existing invariant campaign (v1 only) never exercised (review R-07).
contract LoanV2Handler is Test {
    uint256 constant E = 1e18;
    LoanGuardV2 public g;
    MockComptroller public comp;
    MockVToken public vDebt;
    RestrictingERC20 public usdt;
    address public owner;
    address[3] public callers;
    address[4] public execCandidates;

    // Ghosts
    uint256 public ghostRepaid;
    uint256 public successfulActs;
    uint256 public tippedActs;
    uint256 public ghostTipsReceived;
    uint256 public ghostOwnerOutflowToGuardPath; // owner balance drop not explained by the owner's own transfers
    bool public actedWhileHealthy;
    bool public actedWhileDead;
    bool public tipAboveRate;
    uint256 public frozenSpent;
    uint256 public frozenTips;
    uint32 public frozenActions;
    bool public frozen;

    constructor(LoanGuardV2 g_, MockComptroller c, MockVToken v, RestrictingERC20 u, address o) {
        g = g_;
        comp = c;
        vDebt = v;
        usdt = u;
        owner = o;
        callers = [makeAddr("c0"), makeAddr("c1"), makeAddr("c2")];
        execCandidates = [address(0), makeAddr("e1"), makeAddr("e2"), makeAddr("e3")];
    }

    function setHealth(uint16 weightedUsd) external {
        comp.setWeighted(owner, bound(uint256(weightedUsd), 500, 4_000) * E);
    }

    function setDebt(uint16 debt) external {
        vDebt.setBorrow(owner, bound(uint256(debt), 0, 3_000) * E);
    }

    function ownerSpends(uint96 a) external {
        uint256 b = usdt.balanceOf(owner);
        uint256 x = bound(uint256(a), 0, b);
        vm.prank(owner);
        usdt.transfer(address(0xdead), x);
    }

    function ownerEarns(uint96 a) external {
        usdt.mint(owner, bound(uint256(a), 0, 500 * E));
    }

    function ownerAllows(uint96 a) external {
        vm.prank(owner);
        usdt.approve(address(g), bound(uint256(a), 0, 2_000 * E));
    }

    function toggleRestricted(uint8 who, bool b) external {
        usdt.setBlocked(callers[who % 3], b);
        usdt.setReturnFalse(b && who % 2 == 0);
    }

    function act(uint8 who, bool asOwner) external {
        address c = asOwner ? owner : callers[who % 3];
        (uint256 hf,,) = _health();
        bool live = g.live();
        uint256 spentBefore = g.spent();
        uint256 tipsBefore = g.tipsPaid();
        uint256 callerBefore = usdt.balanceOf(c);
        vm.prank(c);
        try g.act() returns (uint256 repaid) {
            if (!live) actedWhileDead = true;
            if (hf >= g.trigger()) actedWhileHealthy = true;
            ghostRepaid += repaid;
            successfulActs += 1;
            assertEq(g.spent() - spentBefore, repaid);
            uint256 tip = g.tipsPaid() - tipsBefore;
            if (tip > g.tipPerAction()) tipAboveRate = true;
            if (tip != 0) tippedActs += 1;
            if (c != owner) ghostTipsReceived += usdt.balanceOf(c) - callerBefore;
        } catch {}
    }

    function setExecutor(uint8 i, bool allowed) external {
        vm.prank(owner);
        try g.setExecutor(execCandidates[i % 4], allowed) {} catch {}
    }

    /// Ending and expiry are terminal, so they are rare (about 3% of calls) or a run spends its depth on a dead charter.
    function endIt(uint8 r) external {
        if (r >= 8) return;
        vm.prank(owner);
        g.end();
        _freeze();
    }

    function expire(uint8 r) external {
        if (r >= 8) return;
        vm.warp(g.expiresAt());
        _freeze();
    }

    function _freeze() internal {
        if (frozen) return;
        frozen = true;
        frozenSpent = g.spent();
        frozenTips = g.tipsPaid();
        frozenActions = g.actions();
    }

    function _health() internal view returns (uint256 hf, uint256 c, uint256 d) {
        LoanGuardFactoryV2 f = LoanGuardFactoryV2(g.factory());
        return f.healthOf(owner);
    }

    function countExecutors() external view returns (uint256 n) {
        for (uint256 i; i < 4; ++i) if (g.isExecutor(execCandidates[i])) n++;
    }
}

/// forge-config: default.invariant.runs = 64
/// forge-config: default.invariant.depth = 60
/// forge-config: default.invariant.fail-on-revert = false
contract LoanGuardV2InvariantTest is Test {
    uint256 constant E = 1e18;
    LoanV2Handler h;
    LoanGuardV2 g;
    RestrictingERC20 usdt;
    address owner = makeAddr("owner");

    function setUp() public {
        vm.warp(1_762_700_000);
        MockOracle oracle = new MockOracle();
        MockComptroller comp = new MockComptroller(address(oracle));
        usdt = new RestrictingERC20();
        MockVToken v = new MockVToken(address(usdt), address(comp));
        oracle.set(address(v), 1e18);
        address[] memory m = new address[](1);
        m[0] = address(v);
        LoanGuardFactoryV2 f = new LoanGuardFactoryV2(IComptroller(address(comp)), m);
        comp.setAssets(owner, m);
        comp.setWeighted(owner, 1500 * E);
        v.setBorrow(owner, 1000 * E);
        usdt.mint(owner, 2_000 * E);
        LoanGuardFactoryV2.Create memory a = LoanGuardFactoryV2.Create({
            p: LoanGuardV2.Params(address(v), 1.4e18, 1.8e18, 600 * E, 10 * E),
            expiresAt: uint64(block.timestamp + 30 days),
            tipPerAction: 2 * E,
            tipBudget: 15 * E
        });
        vm.startPrank(owner);
        address predicted = f.predict(owner, a, bytes32("inv"));
        usdt.approve(predicted, 615 * E);
        g = LoanGuardV2(f.create(a, bytes32("inv")));
        vm.stopPrank();
        h = new LoanV2Handler(g, comp, v, usdt, owner);
        targetContract(address(h));
        // Only the actions: the handler's getters would otherwise dilute the campaign.
        bytes4[] memory sel = new bytes4[](10);
        sel[0] = LoanV2Handler.setHealth.selector;
        sel[1] = LoanV2Handler.setDebt.selector;
        sel[2] = LoanV2Handler.ownerSpends.selector;
        sel[3] = LoanV2Handler.ownerEarns.selector;
        sel[4] = LoanV2Handler.ownerAllows.selector;
        sel[5] = LoanV2Handler.toggleRestricted.selector;
        sel[6] = LoanV2Handler.act.selector;
        sel[7] = LoanV2Handler.setExecutor.selector;
        sel[8] = LoanV2Handler.endIt.selector;
        sel[9] = LoanV2Handler.expire.selector;
        targetSelector(StdInvariant.FuzzSelector({addr: address(h), selectors: sel}));
    }

    /// Reachability: the handler really produces repayments and tips (the campaign is not vacuous).
    function test_handlerReachesRepaymentAndTip() public {
        h.setHealth(1000);
        h.act(1, false);
        assertEq(h.successfulActs(), 1, "repayment reached");
        assertEq(h.tippedActs(), 1, "tip reached");
        assertEq(g.tipsPaid(), 2 * E);
    }

    function invariant_budgetsHold() public view {
        assertLe(g.spent(), g.budget(), "repayments within budget");
        assertLe(g.tipsPaid(), g.tipBudget(), "tips within tip budget");
    }

    function invariant_spentIsExactlyWhatWasRepaid() public view {
        assertEq(g.spent(), h.ghostRepaid());
    }

    function invariant_tipsCountedEqualTipsReceived() public view {
        assertEq(g.tipsPaid(), h.ghostTipsReceived(), "every counted tip reached a caller, nothing else");
    }

    function invariant_guardHoldsNothing() public view {
        assertEq(usdt.balanceOf(address(g)), 0);
    }

    function invariant_actsOnlyBelowTriggerAndWhileLive() public view {
        assertFalse(h.actedWhileHealthy(), "acted at or above trigger");
        assertFalse(h.actedWhileDead(), "acted after end or expiry");
        assertFalse(h.tipAboveRate(), "tip above tipPerAction");
    }

    function invariant_inertAfterEndOrExpiry() public view {
        if (!h.frozen()) return;
        assertEq(g.spent(), h.frozenSpent());
        assertEq(g.tipsPaid(), h.frozenTips());
        assertEq(g.actions(), h.frozenActions());
    }

    function invariant_executorBookkeeping() public view {
        assertFalse(g.isExecutor(address(0)), "zero address is never an executor");
        assertEq(uint256(g.executorCount()), h.countExecutors());
        assertLe(g.executorCount(), g.MAX_EXECUTORS());
    }
}
