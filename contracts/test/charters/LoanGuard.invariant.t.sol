// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {CharterFactory} from "../../src/charters/CharterFactory.sol";
import {LoanGuard} from "../../src/charters/LoanGuard.sol";
import {IComptroller} from "../../src/charters/VenusInterfaces.sol";
import {MockERC20, MockOracle, MockComptroller, MockVToken} from "./mocks/VenusMocks.sol";

/// Drives two guards (two owners, the same user salt) through random markets, wallets, callers and time, and
/// records what each action was allowed to do. The invariant functions below check the eight stated invariants
/// after every step.
contract GuardHandler is Test {
    uint256 constant E = 1e18;
    uint256 public constant TRIGGER = 1.4e18;
    uint256 public constant TARGET = 1.8e18;

    CharterFactory public factory;
    MockComptroller public comp;
    MockOracle public oracle;
    MockERC20 public usdt;
    MockVToken public vUSDT;

    address[2] public owners;
    LoanGuard[2] public guards;
    address[3] internal callers;

    // Ghost accounting, per guard.
    uint256[2] public ghostOutflow; // tokens that left the owner through the guard: repaid + tips
    uint256[2] public ghostLastSpent;
    bool[2] public ghostSpentDecreased;
    bool[2] public ghostActedAboveTrigger;
    bool[2] public ghostActedWhenInert;
    bool[2] public ghostMissedTargetWithoutLimit;
    bool[2] public ghostTipToOwner;
    bool[2] public ghostOtherGuardMoved;
    bool[2] public ghostEndFailed;
    uint256 public acts;

    constructor() {
        vm.warp(1_762_600_000);
        oracle = new MockOracle();
        comp = new MockComptroller(address(oracle));
        usdt = new MockERC20("USDT", 18);
        vUSDT = new MockVToken(address(usdt), address(comp));
        oracle.set(address(vUSDT), 1e18);
        address[] memory m = new address[](1);
        m[0] = address(vUSDT);
        factory = new CharterFactory(IComptroller(address(comp)), m);
        callers = [makeAddr("keel"), makeAddr("backup"), makeAddr("stranger")];
        owners = [makeAddr("owner-a"), makeAddr("owner-b")];
        for (uint256 i; i < 2; ++i) {
            address o = owners[i];
            address[] memory assets = new address[](1);
            assets[0] = address(vUSDT);
            comp.setAssets(o, assets);
            comp.setWeighted(o, 1500 * E);
            vUSDT.setBorrow(o, 1000 * E);
            usdt.mint(o, 5000 * E);
            CharterFactory.Params memory p = CharterFactory.Params({
                vDebt: address(vUSDT), trigger: TRIGGER, target: TARGET, budget: 1500 * E, tip: 5 * E,
                expiresAt: uint64(block.timestamp + 30 days)
            });
            bytes32 salt = bytes32("same-salt");
            address predicted = factory.predict(o, p, salt);
            vm.startPrank(o);
            usdt.approve(predicted, 2000 * E);
            guards[i] = LoanGuard(factory.create(p, salt));
            vm.stopPrank();
        }
    }

    function _health(address o) internal view returns (uint256 hf) {
        (hf,,) = factory.healthOf(o);
    }

    // ------------------------------------------------------------- the world moves

    function moveCollateral(uint8 who, uint256 usd) external {
        comp.setWeighted(owners[who % 2], bound(usd, 0, 2600 * E));
    }

    function accrue(uint8 who, uint256 amount) external {
        vUSDT.setAccrue(owners[who % 2], bound(amount, 0, 50 * E));
    }

    function topUp(uint8 who, uint256 amount) external {
        usdt.mint(owners[who % 2], bound(amount, 0, 1000 * E));
    }

    function drain(uint8 who, uint256 amount) external {
        address o = owners[who % 2];
        uint256 a = bound(amount, 0, usdt.balanceOf(o));
        vm.prank(o);
        usdt.transfer(address(0xdead), a);
    }

    function setAllowance(uint8 who, uint256 amount) external {
        uint256 i = who % 2;
        vm.prank(owners[i]);
        usdt.approve(address(guards[i]), bound(amount, 0, 3000 * E));
    }

    function warp(uint256 secs) external {
        // Short steps, so a 30-day guard lives through many actions before it expires.
        vm.warp(block.timestamp + bound(secs, 0, 6 hours));
    }

    function end(uint8 who, uint8 chance) external {
        // Rare, so most of a run exercises live guards; the ended path is still reached in many runs.
        if (chance % 40 != 0) return;
        uint256 i = who % 2;
        vm.prank(owners[i]);
        try guards[i].end() {} catch { ghostEndFailed[i] = true; }
    }

    // ------------------------------------------------------------- the button

    struct Before {
        uint256 otherSpent;
        uint256 ownerBal;
        uint256 callerBal;
        bool inert;
        bool ownerCalls;
        address caller;
    }

    struct ActedLog {
        uint256 repaid;
        uint256 tipPaid;
        uint256 healthBefore;
        uint256 healthAfter;
        uint256 debtAfter;
        uint256 spentTotal;
    }

    function act(uint8 who, uint8 callerSeed) external {
        uint256 i = who % 2;
        LoanGuard g = guards[i];
        Before memory b;
        b.ownerCalls = callerSeed % 4 == 0;
        b.caller = b.ownerCalls ? owners[i] : callers[callerSeed % 3];
        b.otherSpent = guards[1 - i].spent();
        b.ownerBal = usdt.balanceOf(owners[i]);
        b.callerBal = usdt.balanceOf(b.caller);
        b.inert = g.ended() || block.timestamp >= g.expiresAt();

        vm.recordLogs();
        vm.prank(b.caller);
        try g.act() returns (uint256 repaid) {
            acts += 1;
            _afterAct(i, b, repaid);
        } catch {}
        if (guards[1 - i].spent() != b.otherSpent) ghostOtherGuardMoved[1 - i] = true;
    }

    function _afterAct(uint256 i, Before memory b, uint256 repaid) internal {
        LoanGuard g = guards[i];
        address o = owners[i];
        if (b.inert) ghostActedWhenInert[i] = true;
        uint256 spentAfter = g.spent();
        if (spentAfter < ghostLastSpent[i]) ghostSpentDecreased[i] = true;
        uint256 tipPaid = spentAfter - ghostLastSpent[i] - repaid;
        ghostLastSpent[i] = spentAfter;
        ghostOutflow[i] += repaid + tipPaid;
        if (b.ownerCalls && tipPaid != 0) ghostTipToOwner[i] = true;
        if (!b.ownerCalls && usdt.balanceOf(b.caller) != b.callerBal + tipPaid) ghostTipToOwner[i] = true;
        if (b.ownerBal - usdt.balanceOf(o) != (b.ownerCalls ? repaid : repaid + tipPaid)) ghostTipToOwner[i] = true;

        // The Acted event carries the health Venus showed in the same transaction.
        ActedLog memory l = _acted();
        if (l.repaid != repaid || l.tipPaid != tipPaid || l.spentTotal != spentAfter) ghostTipToOwner[i] = true;
        if (l.healthBefore >= TRIGGER) ghostActedAboveTrigger[i] = true;
        if (l.healthAfter < TARGET) {
            // Allowed only when a bound was hit.
            bool limited = spentAfter >= g.budget() || l.debtAfter == 0 || usdt.allowance(o, address(g)) == 0
                || usdt.balanceOf(o) == 0;
            if (!limited) ghostMissedTargetWithoutLimit[i] = true;
        }
    }

    function _acted() internal returns (ActedLog memory l) {
        bytes32 sig = keccak256("Acted(address,uint256,uint256,uint256,uint256,uint256,uint256,uint256)");
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 k; k < logs.length; ++k) {
            if (logs[k].topics[0] == sig) {
                // Seven static words: repaid, tipPaid, healthBefore, healthAfter, debtBefore, debtAfter, spentTotal.
                uint256[7] memory v = abi.decode(logs[k].data, (uint256[7]));
                l.repaid = v[0];
                l.tipPaid = v[1];
                l.healthBefore = v[2];
                l.healthAfter = v[3];
                l.debtAfter = v[5];
                l.spentTotal = v[6];
                return l;
            }
        }
        revert("no Acted event");
    }
}

contract LoanGuardInvariantTest is Test {
    GuardHandler h;
    uint256 constant E = 1e18;

    function setUp() public {
        h = new GuardHandler();
        targetContract(address(h));
    }

    /// 1. Tokens leave an owner only through act(), as repayment plus a tip to someone else.
    function invariant_ownerOutflowIsOnlyRepaymentAndTip() public view {
        for (uint256 i; i < 2; ++i) {
            assertFalse(h.ghostTipToOwner(i), "owner paid only repaid, caller got only the tip");
            assertEq(h.ghostOutflow(i), h.guards(i).spent(), "every token out is counted in spent");
        }
    }

    /// 2. spent never exceeds the budget and never decreases.
    function invariant_spentWithinBudgetAndMonotonic() public view {
        for (uint256 i; i < 2; ++i) {
            LoanGuard g = h.guards(i);
            assertLe(g.spent(), g.budget());
            assertFalse(h.ghostSpentDecreased(i));
        }
    }

    /// 3. Every action happened while Venus showed health strictly below the trigger.
    function invariant_actsOnlyBelowTrigger() public view {
        for (uint256 i; i < 2; ++i) assertFalse(h.ghostActedAboveTrigger(i));
    }

    /// 4. After an action, health is at the target, or a bound was hit.
    function invariant_targetOrABoundWasHit() public view {
        for (uint256 i; i < 2; ++i) assertFalse(h.ghostMissedTargetWithoutLimit(i));
    }

    /// 5. The guard never holds tokens and never leaves an allowance to the market.
    function invariant_guardHoldsNothing() public view {
        for (uint256 i; i < 2; ++i) {
            LoanGuard g = h.guards(i);
            assertEq(h.usdt().balanceOf(address(g)), 0);
            assertEq(h.usdt().allowance(address(g), address(h.vUSDT())), 0);
        }
    }

    /// 6. Ended or expired guards never act; ending always succeeds for the owner.
    function invariant_inertAfterEndOrExpiry() public view {
        for (uint256 i; i < 2; ++i) {
            assertFalse(h.ghostActedWhenInert(i));
            assertFalse(h.ghostEndFailed(i));
        }
    }

    /// 7. The charter's terms never change.
    function invariant_termsAreImmutable() public view {
        for (uint256 i; i < 2; ++i) {
            LoanGuard g = h.guards(i);
            assertEq(g.owner(), h.owners(i));
            assertEq(address(g.vDebt()), address(h.vUSDT()));
            assertEq(g.token(), address(h.usdt()));
            assertEq(g.trigger(), 1.4e18);
            assertEq(g.target(), 1.8e18);
            assertEq(g.budget(), 1500 * E);
            assertEq(g.tip(), 5 * E);
        }
    }

    /// 8. Two owners with the same salt get two guards that never share state.
    function invariant_guardsAreIsolated() public view {
        assertTrue(address(h.guards(0)) != address(h.guards(1)));
        assertFalse(h.ghostOtherGuardMoved(0));
        assertFalse(h.ghostOtherGuardMoved(1));
    }

    function afterInvariant() external view {
        // A suite that never acted proves little: the handler must actually reach the would-act state.
        assertGt(h.acts(), 0, "the run must include real actions");
    }
}
