// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {CharterFactory} from "../../src/charters/CharterFactory.sol";
import {LoanGuard} from "../../src/charters/LoanGuard.sol";
import {IComptroller, IPriceOracle, IVToken} from "../../src/charters/VenusInterfaces.sol";
import {CharterRules} from "../../src/charters/CharterRules.sol";

interface IVBep20Full {
    function mint(uint256) external returns (uint256);
    function borrow(uint256) external returns (uint256);
    function borrowBalanceStored(address) external view returns (uint256);
    function underlying() external view returns (address);
    function getAccountSnapshot(address) external view returns (uint256, uint256, uint256, uint256);
}

interface IComptrollerFull {
    function enterMarkets(address[] calldata) external returns (uint256[] memory);
    function getAccountLiquidity(address) external view returns (uint256, uint256, uint256);
    function oracle() external view returns (address);
    function actionPaused(address, uint8) external view returns (bool);
    function markets(address) external view returns (bool, uint256, bool, uint256, uint256, uint96, bool);
}

interface IERC20Full {
    function approve(address, uint256) external returns (bool);
    function balanceOf(address) external view returns (uint256);
    function decimals() external view returns (uint8);
}

/// Real Venus Core on a fork of BSC mainnet (56) or BSC testnet (97). Skips without FORK_URL.
///   FORK_URL=<bsc archive rpc> forge test --match-contract LoanGuardFork -vv
///   FORK_URL=<bsc testnet rpc> forge test --match-contract LoanGuardFork -vv
/// Mandatory before any deployment. The chain is read from the fork, so one suite covers both.
contract LoanGuardFork is Test {
    uint8 constant REPAY = 3;

    struct Net {
        address comptroller;
        address[3] debt; // vUSDT, vUSDC, vFDUSD
        address collateral; // vBTC: supplied in every restore test
        address thresholdCollateral; // a market whose liquidation threshold differs from its collateral factor
        address thresholdDebt; // borrowed against it in the threshold test
    }

    Net net;
    CharterFactory factory;
    IComptrollerFull comp;
    address user = makeAddr("fork-user");
    address agent = makeAddr("fork-agent");

    function setUp() public {
        string memory url = vm.envOr("FORK_URL", string(""));
        if (bytes(url).length == 0) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(url);
        if (block.chainid == 56) {
            net = Net({
                comptroller: 0xfD36E2c2a6789Db23113685031d7F16329158384,
                debt: [
                    0xfD5840Cd36d94D7229439859C0112a4185BC0255,
                    0xecA88125a5ADbe82614ffC12D0DB554E2e2867C8,
                    0xC4eF4229FEc74Ccfe17B2bdeF7715fAC740BA0ba
                ],
                collateral: 0x882C173bC7Ff3b7786CA16dfeD3DFFfb9Ee7847B,
                thresholdCollateral: 0xC4eF4229FEc74Ccfe17B2bdeF7715fAC740BA0ba, // vFDUSD: CF 0.65, LT 0.75
                thresholdDebt: 0xfD5840Cd36d94D7229439859C0112a4185BC0255
            });
        } else if (block.chainid == 97) {
            net = Net({
                comptroller: 0x94d1820b2D1c7c7452A163983Dc888CEC546b77D,
                debt: [
                    0xb7526572FFE56AB9D7489838Bf2E18e3323b441A,
                    0xD5C4C2e2facBEB59D0216D0595d63FcDc6F9A1a7,
                    0xF06e662a00796c122AaAE935EC4F0Be3F74f5636
                ],
                collateral: 0xb6e9322C49FD75a367Fcb17B0Fcd62C5070EbCBe,
                thresholdCollateral: 0xb7526572FFE56AB9D7489838Bf2E18e3323b441A, // vUSDT: CF 0.75, LT 0.80
                thresholdDebt: 0xD5C4C2e2facBEB59D0216D0595d63FcDc6F9A1a7
            });
        } else {
            revert("fork a BSC chain (56 or 97)");
        }
        comp = IComptrollerFull(net.comptroller);
        address[] memory m = new address[](3);
        for (uint256 i; i < 3; ++i) {
            m[i] = net.debt[i];
        }
        factory = new CharterFactory(IComptroller(net.comptroller), m);
        console2.log("chain", block.chainid, "block", block.number);
    }

    // ------------------------------------------------------------------ helpers

    function _supply(address vToken, uint256 amount) internal {
        address u = IVBep20Full(vToken).underlying();
        deal(u, user, IERC20Full(u).balanceOf(user) + amount);
        vm.startPrank(user);
        IERC20Full(u).approve(vToken, amount);
        require(IVBep20Full(vToken).mint(amount) == 0, "mint");
        address[] memory enter = new address[](1);
        enter[0] = vToken;
        comp.enterMarkets(enter);
        vm.stopPrank();
    }

    function _borrow(address vToken, uint256 amount) internal {
        vm.prank(user);
        require(IVBep20Full(vToken).borrow(amount) == 0, "borrow");
    }

    /// Underlying units worth `usd` dollars (18-decimal USD) at the oracle price.
    function _units(address vToken, uint256 usd) internal view returns (uint256) {
        return usd * 1e18 / IPriceOracle(comp.oracle()).getUnderlyingPrice(vToken);
    }

    function _guard(address vDebt, uint256 trigger, uint256 target, uint256 budget, uint256 tip, bytes32 salt)
        internal
        returns (LoanGuard g, uint256 gasCreate)
    {
        CharterFactory.Params memory p = CharterFactory.Params({
            vDebt: vDebt,
            trigger: trigger,
            target: target,
            budget: budget,
            tip: tip,
            expiresAt: uint64(block.timestamp + 7 days)
        });
        address token = IVBep20Full(vDebt).underlying();
        address predicted = factory.predict(user, p, salt);
        vm.startPrank(user);
        IERC20Full(token).approve(predicted, budget);
        uint256 g0 = gasleft();
        g = LoanGuard(factory.create(p, salt));
        gasCreate = g0 - gasleft();
        vm.stopPrank();
        assertEq(address(g), predicted, "predicted address");
    }

    function _dropCollateralPrice(uint256 pct) internal {
        uint256 price = IPriceOracle(comp.oracle()).getUnderlyingPrice(net.collateral);
        vm.mockCall(
            comp.oracle(),
            abi.encodeWithSelector(IPriceOracle.getUnderlyingPrice.selector, net.collateral),
            abi.encode(price * (100 - pct) / 100)
        );
    }

    // ------------------------------------------------------------------ the tests

    /// A05: Venus's getAccountLiquidity weighs collateral by the liquidation threshold, not the collateral factor.
    /// The collateral here has the two set differently, so the result can only match one of them.
    function test_fork_liquidityUsesLiquidationThreshold() public {
        _supply(net.thresholdCollateral, _units(net.thresholdCollateral, 10_000e18));
        _borrow(net.thresholdDebt, _units(net.thresholdDebt, 3_000e18));

        (uint256 err, uint256 liq, uint256 shortfall) = comp.getAccountLiquidity(user);
        assertEq(err, 0);
        (, uint256 cf,, uint256 lt,,,) = comp.markets(net.thresholdCollateral);
        assertTrue(cf != lt, "this market must have CF and LT set apart");
        IPriceOracle oracle = IPriceOracle(comp.oracle());

        (, uint256 bal,, uint256 rate) = IVBep20Full(net.thresholdCollateral).getAccountSnapshot(user);
        uint256 p = oracle.getUnderlyingPrice(net.thresholdCollateral);
        uint256 byLT = (((lt * rate) / 1e18) * p / 1e18) * bal / 1e18;
        uint256 byCF = (((cf * rate) / 1e18) * p / 1e18) * bal / 1e18;
        (,, uint256 owed,) = IVBep20Full(net.thresholdDebt).getAccountSnapshot(user);
        uint256 debt = oracle.getUnderlyingPrice(net.thresholdDebt) * owed / 1e18;
        uint256 venusCollateral = debt + liq - shortfall;
        console2.log("venus collateral", venusCollateral);
        console2.log("by liquidation threshold", byLT);
        console2.log("by collateral factor", byCF);
        assertApproxEqAbs(venusCollateral, byLT, 10, "Venus weighs collateral by the liquidation threshold");
        assertTrue(venusCollateral > byCF + 1e15, "and not by the collateral factor");

        // The factory's health is Venus's own number.
        (uint256 hf, uint256 coll, uint256 d) = factory.healthOf(user);
        assertEq(coll, venusCollateral);
        assertEq(d, debt);
        assertEq(hf, venusCollateral * 1e18 / debt);
    }

    function test_fork_restoresTarget_vUSDT() public {
        _restore(net.debt[0], "usdt");
    }

    function test_fork_restoresTarget_vUSDC() public {
        _restore(net.debt[1], "usdc");
    }

    function test_fork_restoresTarget_vFDUSD() public {
        _restore(net.debt[2], "fdusd");
    }

    function _restore(address vDebt, bytes32 salt) internal {
        _supply(net.collateral, _units(net.collateral, 30_000e18));
        _borrow(vDebt, _units(vDebt, 10_000e18));
        (uint256 hf1,,) = factory.healthOf(user);
        console2.log("health after borrow", hf1);

        address token = IVBep20Full(vDebt).underlying();
        uint256 reserve = _units(vDebt, 20_000e18);
        deal(token, user, reserve);
        (LoanGuard g, uint256 gasCreate) = _guard(vDebt, hf1 - 0.3e18, hf1 - 0.05e18, reserve, 0, salt);

        vm.expectRevert(abi.encodeWithSelector(LoanGuard.Healthy.selector, hf1, hf1 - 0.3e18));
        vm.prank(agent);
        g.act();

        _dropCollateralPrice(25);
        (uint256 hf2,,) = factory.healthOf(user);
        console2.log("health after a 25% fall", hf2);
        assertLt(hf2, g.trigger());
        (uint8 state,, uint256 would,,,) = g.preview();
        assertEq(state, 1, "preview says it would act");

        uint256 debtBefore = IVBep20Full(vDebt).borrowBalanceStored(user);
        uint256 balBefore = IERC20Full(token).balanceOf(user);
        vm.prank(agent);
        uint256 g0 = gasleft();
        uint256 repaid = g.act();
        uint256 gasAct = g0 - gasleft();
        console2.log("repaid", repaid, "preview said", would);

        assertEq(IERC20Full(token).balanceOf(user), balBefore - repaid, "only the repayment left the wallet");
        assertGe(
            debtBefore - IVBep20Full(vDebt).borrowBalanceStored(user) + 1,
            repaid,
            "debt fell by the repayment"
        );
        assertEq(IERC20Full(token).balanceOf(address(g)), 0, "the guard holds nothing");
        (uint256 hf3,,) = factory.healthOf(user);
        console2.log("health after act", hf3);
        assertGe(hf3, g.target(), "target restored by Venus's own measure");
        (,, uint256 shortfall) = comp.getAccountLiquidity(user);
        assertEq(shortfall, 0);

        vm.prank(user);
        uint256 g1 = gasleft();
        g.end();
        uint256 gasEnd = g1 - gasleft();
        console2.log("gas create", gasCreate);
        console2.log("gas act", gasAct);
        console2.log("gas end", gasEnd);
    }

    /// Debt in two markets: the guard repays only its own market, and only up to the debt there.
    function test_fork_twoDebtMarkets() public {
        _supply(net.collateral, _units(net.collateral, 30_000e18));
        _borrow(net.debt[0], _units(net.debt[0], 6_000e18));
        _borrow(net.debt[1], _units(net.debt[1], 4_000e18));
        (uint256 hf1,,) = factory.healthOf(user);
        address token = IVBep20Full(net.debt[0]).underlying();
        uint256 reserve = _units(net.debt[0], 20_000e18);
        deal(token, user, reserve);
        (LoanGuard g,) = _guard(net.debt[0], hf1 - 0.3e18, hf1 - 0.05e18, reserve, 0, "two");
        uint256 otherBefore = IVBep20Full(net.debt[1]).borrowBalanceStored(user);
        _dropCollateralPrice(25);
        vm.prank(agent);
        uint256 repaid = g.act();
        assertGt(repaid, 0);
        assertGe(
            IVBep20Full(net.debt[1]).borrowBalanceStored(user), otherBefore, "the other loan is untouched"
        );
        (uint256 hf3,,) = factory.healthOf(user);
        assertTrue(hf3 >= g.target() || IVBep20Full(net.debt[0]).borrowBalanceStored(user) == 0);
    }

    /// When Venus pauses repayments in the market, act() reverts and nothing moves.
    function test_fork_repayPausedRevertsWithNothingMoved() public {
        address vDebt = net.debt[0];
        _supply(net.collateral, _units(net.collateral, 30_000e18));
        _borrow(vDebt, _units(vDebt, 10_000e18));
        (uint256 hf1,,) = factory.healthOf(user);
        address token = IVBep20Full(vDebt).underlying();
        deal(token, user, _units(vDebt, 20_000e18));
        (LoanGuard g,) = _guard(vDebt, hf1 - 0.3e18, hf1 - 0.05e18, _units(vDebt, 20_000e18), 0, "paused");
        _dropCollateralPrice(25);

        // Find Venus's own pause flag for (vDebt, REPAY) by recording the slot actionPaused reads, then set it.
        vm.record();
        assertFalse(comp.actionPaused(vDebt, REPAY));
        (bytes32[] memory reads,) = vm.accesses(net.comptroller);
        bool set;
        for (uint256 i; i < reads.length && !set; ++i) {
            bytes32 old = vm.load(net.comptroller, reads[i]);
            // The flag is false now, so its slot holds zero; non-zero slots (the Diamond's implementation
            // pointer among them) are left alone.
            if (old != bytes32(0)) continue;
            vm.store(net.comptroller, reads[i], bytes32(uint256(1)));
            // Some slots it reads are the Diamond's routing; a wrong write there reverts, so restore and move on.
            try comp.actionPaused(vDebt, REPAY) returns (bool paused) {
                if (paused) set = true;
                else vm.store(net.comptroller, reads[i], old);
            } catch {
                vm.store(net.comptroller, reads[i], old);
            }
        }
        assertTrue(set, "found the pause flag");

        uint256 bal = IERC20Full(token).balanceOf(user);
        uint256 debt = IVBep20Full(vDebt).borrowBalanceStored(user);
        vm.prank(agent);
        vm.expectRevert();
        g.act();
        assertEq(IERC20Full(token).balanceOf(user), bal, "nothing moved");
        assertEq(IVBep20Full(vDebt).borrowBalanceStored(user), debt);
        assertEq(g.spent(), 0);
    }

    /// An outside caller earns the owner's tip, paid after the repayment and counted inside the budget.
    function test_fork_tipToAgent() public {
        address vDebt = net.debt[0];
        _supply(net.collateral, _units(net.collateral, 30_000e18));
        _borrow(vDebt, _units(vDebt, 10_000e18));
        (uint256 hf1,,) = factory.healthOf(user);
        address token = IVBep20Full(vDebt).underlying();
        uint256 reserve = _units(vDebt, 20_000e18);
        uint256 tip = _units(vDebt, 1e18);
        deal(token, user, reserve);
        (LoanGuard g,) = _guard(vDebt, hf1 - 0.3e18, hf1 - 0.05e18, reserve, tip, "tip");
        _dropCollateralPrice(25);
        vm.prank(agent);
        uint256 repaid = g.act();
        assertEq(IERC20Full(token).balanceOf(agent), tip);
        assertEq(g.spent(), repaid + tip);
    }

    // ------------------------------------------------------------------ a stray copy (review L-1), on chain

    /// The review's attack, against the real comptroller: an attacker-made "market" that takes the tokens. A guard
    /// deployed outside the factory with it, or with a fake comptroller, or with a listed but unreviewed market,
    /// cannot exist; a faithful stray copy is bound to the real Venus market and the owner's own loan.
    function test_fork_strayDeploymentCannotUseAFakeMarket() public {
        address token = IVBep20Full(net.debt[0]).underlying();
        FakeMarket fake = new FakeMarket(token, net.comptroller);
        uint64 exp = uint64(block.timestamp + 30 days);
        vm.expectRevert(abi.encodeWithSelector(CharterRules.UnsupportedMarket.selector, address(fake)));
        new LoanGuard(
            user, IComptroller(net.comptroller), IVToken(address(fake)), token, 1.4e18, 1.8e18, 100e18, 0, exp
        );

        FakeComptroller fc = new FakeComptroller();
        vm.expectRevert(abi.encodeWithSelector(CharterRules.WrongComptroller.selector, address(fc)));
        new LoanGuard(
            user, IComptroller(address(fc)), IVToken(net.debt[0]), token, 1.4e18, 1.8e18, 100e18, 0, exp
        );

        // vBTC is listed on Venus but is not a reviewed debt market.
        address btc = IVBep20Full(net.collateral).underlying();
        vm.expectRevert(abi.encodeWithSelector(CharterRules.UnsupportedMarket.selector, net.collateral));
        new LoanGuard(
            user, IComptroller(net.comptroller), IVToken(net.collateral), btc, 1.4e18, 1.8e18, 100e18, 0, exp
        );

        LoanGuard ok = new LoanGuard(
            user, IComptroller(net.comptroller), IVToken(net.debt[0]), token, 1.4e18, 1.8e18, 100e18, 0, exp
        );
        assertEq(address(ok.vDebt()), net.debt[0]);
        assertFalse(factory.isGuard(address(ok)));
    }
}

/// A "market" that reports the real comptroller and swallows whatever it is asked to repay.
contract FakeMarket {
    address public underlying;
    address public comptroller;

    constructor(address u, address c) {
        underlying = u;
        comptroller = c;
    }
}

contract FakeComptroller {}
