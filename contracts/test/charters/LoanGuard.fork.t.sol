// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {CharterFactory} from "../../src/charters/CharterFactory.sol";
import {LoanGuard} from "../../src/charters/LoanGuard.sol";
import {IComptroller, IPriceOracle} from "../../src/charters/VenusInterfaces.sol";

interface IVBep20Full {
    function mint(uint256) external returns (uint256);
    function borrow(uint256) external returns (uint256);
    function borrowBalanceStored(address) external view returns (uint256);
    function underlying() external view returns (address);
}

interface IComptrollerFull {
    function enterMarkets(address[] calldata) external returns (uint256[] memory);
    function getAccountLiquidity(address) external view returns (uint256, uint256, uint256);
    function oracle() external view returns (address);
}

interface IERC20Full {
    function approve(address, uint256) external returns (bool);
    function balanceOf(address) external view returns (uint256);
}

/// Real Venus Core on a BSC fork. Not run in CI by default (needs an archive-capable RPC):
///   FORK_URL=<bsc rpc> forge test --match-contract LoanGuardFork -vvv
///   FORK_URL=<bsc testnet rpc> FORK_CHAIN=97 forge test --match-contract LoanGuardFork -vvv
/// Mandatory before any deployment (P2). Record block number, results and gas in CAPABILITY_REPORT.md.
contract LoanGuardFork is Test {
    address constant COMP_56 = 0xfD36E2c2a6789Db23113685031d7F16329158384;
    address constant VUSDT_56 = 0xfD5840Cd36d94D7229439859C0112a4185BC0255;
    address constant VUSDC_56 = 0xecA88125a5ADbe82614ffC12D0DB554E2e2867C8;
    address constant VFDUSD_56 = 0xC4eF4229FEc74Ccfe17B2bdeF7715fAC740BA0ba;
    address constant VBTC_56 = 0x882C173bC7Ff3b7786CA16dfeD3DFFfb9Ee7847B;

    CharterFactory factory;
    address user = makeAddr("fork-user");
    address agent = makeAddr("fork-agent");
    IComptrollerFull comp = IComptrollerFull(COMP_56);
    IVBep20Full vUSDT = IVBep20Full(VUSDT_56);
    IVBep20Full vBTC = IVBep20Full(VBTC_56);

    function setUp() public {
        string memory url = vm.envOr("FORK_URL", string(""));
        if (bytes(url).length == 0) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(url);
        address[] memory m = new address[](3);
        m[0] = VUSDT_56;
        m[1] = VUSDC_56;
        m[2] = VFDUSD_56;
        factory = new CharterFactory(IComptroller(COMP_56), m);
    }

    /// Supply BTCB, borrow USDT, push the BTC price down through a mocked oracle read,
    /// and require the guard to restore the target as Venus itself measures it.
    function test_fork_restoresTargetOnRealVenus() public {
        address btcb = vBTC.underlying();
        address usdt = vUSDT.underlying();
        deal(btcb, user, 1e18); // 1 BTCB
        deal(usdt, user, 50_000e18); // reserve held in the user's own wallet

        vm.startPrank(user);
        IERC20Full(btcb).approve(address(vBTC), type(uint256).max);
        require(vBTC.mint(1e18) == 0, "mint");
        address[] memory enter = new address[](1);
        enter[0] = address(vBTC);
        comp.enterMarkets(enter);
        (uint256 hf0,,) = factory.healthOf(user);
        console2.log("health before borrow", hf0);
        // Borrow a third of the BTC value in USDT.
        uint256 btcPrice = IPriceOracle(comp.oracle()).getUnderlyingPrice(address(vBTC)); // 1e18 scale for 18 dp
        uint256 borrowAmt = btcPrice / 3;
        require(vUSDT.borrow(borrowAmt) == 0, "borrow");
        vm.stopPrank();

        (uint256 hf1, uint256 coll, uint256 debt) = factory.healthOf(user);
        console2.log("health after borrow", hf1);
        console2.log("weighted collateral usd", coll);
        console2.log("debt usd", debt);

        CharterFactory.Params memory p = CharterFactory.Params({
            vDebt: VUSDT_56,
            trigger: hf1 - 0.2e18,
            target: hf1,
            budget: 50_000e18,
            tip: 0,
            expiresAt: uint64(block.timestamp + 7 days)
        });
        vm.startPrank(user);
        address g = factory.create(p, bytes32("fork"));
        IERC20Full(usdt).approve(g, 50_000e18);
        vm.stopPrank();

        // Healthy: refused.
        vm.expectRevert();
        vm.prank(agent);
        LoanGuard(g).act();

        // BTC falls 25%. Mock only the BTC spot read that the liquidation path uses.
        vm.mockCall(
            comp.oracle(),
            abi.encodeWithSelector(IPriceOracle.getUnderlyingPrice.selector, address(vBTC)),
            abi.encode(btcPrice * 75 / 100)
        );
        (uint256 hf2,,) = factory.healthOf(user);
        console2.log("health after drop", hf2);
        assertLt(hf2, p.trigger);

        uint256 debtBefore = vUSDT.borrowBalanceStored(user);
        vm.prank(agent);
        uint256 repaid = LoanGuard(g).act();
        console2.log("repaid", repaid);
        assertEq(debtBefore - vUSDT.borrowBalanceStored(user) >= repaid - 1, true);

        (uint256 hf3,,) = factory.healthOf(user);
        console2.log("health after act", hf3);
        assertGe(hf3, p.target, "target restored by Venus's own measure");
        (, uint256 liq, uint256 shortfall) = comp.getAccountLiquidity(user);
        assertGt(liq, 0);
        assertEq(shortfall, 0);
    }
}
