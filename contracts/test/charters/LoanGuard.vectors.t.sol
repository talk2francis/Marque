// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {CharterFactory} from "../../src/charters/CharterFactory.sol";
import {LoanGuard} from "../../src/charters/LoanGuard.sol";
import {IComptroller} from "../../src/charters/VenusInterfaces.sol";
import {MockERC20, MockOracle, MockComptroller, MockVToken} from "./mocks/VenusMocks.sol";

/// Exports what the real contracts do for 60 deterministic cases, so packages/charters/src/health.ts can be
/// required to reproduce every number exactly (vectors/charters-act.json; checked by health.parity.test.ts).
/// Cases mix 6 and 18 decimal tokens, prices away from $1, a second debt market, budget, allowance and balance
/// limits, tips, and owner versus agent callers.
contract LoanGuardVectors is Test {
    uint256 constant N = 60;

    function _rand(uint256 i, string memory tag, uint256 lo, uint256 hi) internal pure returns (uint256) {
        return lo + uint256(keccak256(abi.encode(i, tag))) % (hi - lo + 1);
    }

    function test_exportVectors() public {
        vm.warp(1_762_600_000);
        string memory json = "[";
        for (uint256 i; i < N; ++i) {
            json = string.concat(json, i == 0 ? "" : ",", _case(i));
        }
        json = string.concat(json, "]\n");
        vm.writeFile("vectors/charters-act.json", json);
    }

    struct Case {
        uint8 decimals;
        uint256 price;
        uint256 debtInMarket;
        uint256 otherDebtUsd;
        uint256 collateralUsd;
        uint256 trigger;
        uint256 target;
        uint256 budget;
        uint256 tip;
        uint256 allowance;
        uint256 balance;
        bool ownerCalls;
    }

    function _setup(uint256 i) internal view returns (Case memory c) {
        c.decimals = i % 3 == 0 ? 6 : 18;
        uint256 unit = 10 ** c.decimals;
        // $0.95 to $1.05, scaled to 1e(36 - decimals) as Venus's oracle does.
        c.price = _rand(i, "price", 95, 105) * 10 ** (36 - c.decimals) / 100;
        c.debtInMarket = _rand(i, "debt", 100, 50_000) * unit + _rand(i, "debtFrac", 0, unit - 1);
        c.otherDebtUsd = i % 4 == 0 ? _rand(i, "other", 1, 20_000) * 1e18 : 0;
        c.trigger = _rand(i, "trigger", 102, 300) * 1e16;
        c.target = c.trigger + _rand(i, "gap", 5, 150) * 1e16;
        uint256 debtUsd = c.price * c.debtInMarket / 1e18 + c.otherDebtUsd;
        // Health between 0.5 and just over the trigger, so most cases act and some do not.
        c.collateralUsd = debtUsd * _rand(i, "hf", 50, c.trigger / 1e16 + 10) / 100;
        c.budget = _rand(i, "budget", 1, 60_000) * unit;
        c.tip = i % 5 == 0 ? c.budget / 10 : (i % 2 == 0 ? _rand(i, "tip", 0, 5) * unit : 0);
        c.allowance = i % 7 == 0 ? _rand(i, "allow", 0, 500) * unit : c.budget + c.tip;
        c.balance = i % 6 == 0 ? _rand(i, "bal", 0, 800) * unit : 100_000 * unit;
        c.ownerCalls = i % 3 == 1;
        if (i % 11 == 10) c.allowance = 0; // below the trigger with nothing to use
    }

    struct World {
        CharterFactory factory;
        LoanGuard guard;
        MockERC20 token;
        address owner;
    }

    function _deploy(uint256 i, Case memory c) internal returns (World memory w) {
        MockOracle oracle = new MockOracle();
        MockComptroller comp = new MockComptroller(address(oracle));
        w.token = new MockERC20("T", c.decimals);
        MockVToken vDebt = new MockVToken(address(w.token), address(comp));
        MockVToken vOther = new MockVToken(address(new MockERC20("O", 18)), address(comp));
        oracle.set(address(vDebt), c.price);
        oracle.set(address(vOther), 1e18);
        address[] memory m = new address[](1);
        m[0] = address(vDebt);
        w.factory = new CharterFactory(IComptroller(address(comp)), m);
        w.owner = makeAddr(string.concat("owner", vm.toString(i)));
        address[] memory assets = new address[](2);
        assets[0] = address(vDebt);
        assets[1] = address(vOther);
        comp.setAssets(w.owner, assets);
        vDebt.setBorrow(w.owner, c.debtInMarket);
        vOther.setBorrow(w.owner, c.otherDebtUsd);
        comp.setWeighted(w.owner, c.collateralUsd);
        w.token.mint(w.owner, c.balance);
        CharterFactory.Params memory p = CharterFactory.Params({
            vDebt: address(vDebt), trigger: c.trigger, target: c.target, budget: c.budget, tip: c.tip,
            expiresAt: uint64(block.timestamp + 30 days)
        });
        vm.startPrank(w.owner);
        w.guard = LoanGuard(w.factory.create(p, bytes32(i)));
        w.token.approve(address(w.guard), c.allowance);
        vm.stopPrank();
    }

    function _case(uint256 i) internal returns (string memory) {
        Case memory c = _setup(i);
        World memory w = _deploy(i, c);
        string memory k = vm.toString(i);
        _inputs(k, c, w);
        (uint8 state, uint256 hBefore, uint256 would, uint256 tipIfAgent,,) = w.guard.preview();
        vm.serializeUint(k, "previewState", state);
        vm.serializeString(k, "previewRepay", vm.toString(would));
        vm.serializeString(k, "previewTip", vm.toString(tipIfAgent));
        vm.serializeString(k, "healthBefore", vm.toString(hBefore));
        uint256 repaid;
        uint256 hAfter = hBefore;
        vm.prank(c.ownerCalls ? w.owner : makeAddr("agent"));
        try w.guard.act() returns (uint256 r) {
            repaid = r;
            (hAfter,,) = w.factory.healthOf(w.owner);
        } catch {}
        vm.serializeString(k, "repaid", vm.toString(repaid));
        vm.serializeString(k, "tipPaid", vm.toString(w.guard.spent() - repaid));
        return vm.serializeString(k, "healthAfter", vm.toString(hAfter));
    }

    function _inputs(string memory k, Case memory c, World memory w) internal {
        (, uint256 coll, uint256 debt) = w.factory.healthOf(w.owner);
        vm.serializeUint(k, "decimals", c.decimals);
        vm.serializeString(k, "price", vm.toString(c.price));
        vm.serializeString(k, "collateralUsd", vm.toString(coll));
        vm.serializeString(k, "debtUsd", vm.toString(debt));
        vm.serializeString(k, "debtInMarket", vm.toString(c.debtInMarket));
        vm.serializeString(k, "trigger", vm.toString(c.trigger));
        vm.serializeString(k, "target", vm.toString(c.target));
        vm.serializeString(k, "budget", vm.toString(c.budget));
        vm.serializeString(k, "tip", vm.toString(c.tip));
        vm.serializeString(k, "allowance", vm.toString(c.allowance));
        vm.serializeString(k, "balance", vm.toString(c.balance));
        vm.serializeBool(k, "callerIsOwner", c.ownerCalls);
    }
}
