// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {YieldSweep} from "../../src/charters/yield/YieldSweep.sol";
import {YieldSweepFactory} from "../../src/charters/yield/YieldSweepFactory.sol";
import {GridBand} from "../../src/charters/grid/GridBand.sol";
import {GridBandFactory} from "../../src/charters/grid/GridBandFactory.sol";
import {RangeKeeper} from "../../src/charters/range/RangeKeeper.sol";
import {RangeKeeperFactory} from "../../src/charters/range/RangeKeeperFactory.sol";
import {Blueprint} from "../../src/charters/lib/Blueprint.sol";
import {IComptrollerSupply} from "../../src/charters/base/VenusSupply.sol";
import {IPancakeV3Factory, IPancakeV3Pool, INonfungiblePositionManager} from "../../src/charters/base/PancakeInterfaces.sol";
import {Swapper} from "./utils/PcsFixture.sol";

interface IERC20F {
    function approve(address, uint256) external returns (bool);
    function balanceOf(address) external view returns (uint256);
}

/// Real Venus and PancakeSwap v3 on a BSC mainnet fork. Skips without FORK_URL. Mandatory before deployment:
///   FORK_URL=<bsc archive rpc> forge test --match-contract ForkV2 -vvv
/// Record block number, gas per action and results in PROJECT_STATE.md. Never written against testnet fixtures.
abstract contract ForkSweepBase is Test {
    address owner = makeAddr("fork-owner");

    function _sweep(address comp, address v, address u, uint256 unit) internal {
        _sweepOn(comp, v, u, unit, owner);
    }

    function _sweepOn(address comp, address v, address u, uint256 unit, address who) internal {
        address[] memory m = new address[](1);
        m[0] = v;
        YieldSweepFactory f = new YieldSweepFactory(IComptrollerSupply(comp), m);
        deal(u, who, 1_000 * unit);
        YieldSweepFactory.Create memory a = YieldSweepFactory.Create({
            p: YieldSweep.Params(v, 200 * unit, 300 * unit, 20 * unit, 5_000 * unit, 0),
            expiresAt: uint64(block.timestamp + 30 days),
            tipPerAction: 0,
            tipBudget: 0
        });
        vm.startPrank(who);
        YieldSweep s = YieldSweep(f.create(a, bytes32("f")));
        IERC20F(u).approve(address(s), 5_000 * unit);
        IERC20F(v).approve(address(s), f.vTokenAllowanceFor(v, 5_000 * unit));
        vm.stopPrank();
        uint256 g0 = gasleft();
        s.act();
        console2.log("supply gas", g0 - gasleft());
        assertEq(IERC20F(u).balanceOf(who), 250 * unit);
        assertGt(IERC20F(v).balanceOf(who), 0, "mintBehalf minted to the owner on the deployed market");
        assertEq(IERC20F(v).balanceOf(address(s)), 0);
        deal(u, who, 100 * unit);
        vm.roll(block.number + 100);
        g0 = gasleft();
        s.act();
        console2.log("withdraw gas", g0 - gasleft());
        assertApproxEqAbs(IERC20F(u).balanceOf(who), 250 * unit, unit / 1e6);
        assertEq(IERC20F(u).balanceOf(address(s)), 0);
    }
}

contract ForkV2Test is ForkSweepBase {
    address constant COMP = 0xfD36E2c2a6789Db23113685031d7F16329158384;
    address constant VUSDC = 0xecA88125a5ADbe82614ffC12D0DB554E2e2867C8;
    address constant USDC = 0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d;
    address constant USDT = 0x55d398326f99059fF775485246999027B3197955;
    address constant WBNB = 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c;
    address constant BTCB = 0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c;
    address constant PCS = 0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865;
    address constant NPM = 0x46A15B0b27311cedF172AB29E4f4766fbE7F4364;
    address keel = makeAddr("fork-keel");

    function setUp() public {
        string memory url = vm.envOr("FORK_URL", string(""));
        if (bytes(url).length == 0) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(url);
    }

    function test_fork_yieldSweep_suppliesAndWithdrawsOnRealVenus() public {
        _sweep(COMP, VUSDC, USDC, 1e18);
    }

    function test_fork_yieldSweep_vUSDT() public {
        _sweep(COMP, 0xfD5840Cd36d94D7229439859C0112a4185BC0255, USDT, 1e18);
    }

    function test_fork_yieldSweep_vFDUSD() public {
        _sweep(COMP, 0xC4eF4229FEc74Ccfe17B2bdeF7715fAC740BA0ba, 0xc5f0f7b66764F6ec8C8Dff7BA683102295E16409, 1e18);
    }

    function test_fork_gridBand_buysAndSellsOnTheRealPool() public {
        _grid(IPancakeV3Factory(PCS).getPool(WBNB, USDT, 500), WBNB, USDT);
    }

    function test_fork_gridBand_WBNB_USDT_100() public {
        _grid(IPancakeV3Factory(PCS).getPool(WBNB, USDT, 100), WBNB, USDT);
    }

    function test_fork_gridBand_WBNB_USDC_100() public {
        _grid(IPancakeV3Factory(PCS).getPool(WBNB, USDC, 100), WBNB, USDC);
    }

    function test_fork_gridBand_BTCB_USDT_500() public {
        _grid(IPancakeV3Factory(PCS).getPool(BTCB, USDT, 500), BTCB, USDT);
    }

    function _grid(address pool, address base, address quote) internal {
        console2.log("grid pool", pool);
        GridBand g = _gridCreate(pool, base, quote);
        bool b0 = IPancakeV3Pool(pool).token0() == base;
        Swapper sw = new Swapper();
        deal(base, address(sw), 1e30);
        deal(quote, address(sw), 1e30);
        // Push the real pool down past level 5 with a large sell, then let the TWAP catch up.
        _moveTo(sw, pool, b0, g.level(5) - 20);
        uint256 baseBefore = IERC20F(base).balanceOf(owner);
        uint256 g0 = gasleft();
        vm.prank(keel);
        (uint256 slot, bool isBuy,,) = g.act();
        console2.log("grid buy gas", g0 - gasleft());
        assertEq(slot, 5);
        assertTrue(isBuy);
        assertGt(IERC20F(base).balanceOf(owner), baseBefore, "bought base lands with the owner");
        assertEq(IERC20F(base).balanceOf(address(g)), 0);
        assertEq(IERC20F(quote).balanceOf(address(g)), 0);
        // Back up through level 6: the same slot sells what it bought, one level higher.
        _moveTo(sw, pool, b0, g.level(6) + 20);
        vm.prank(keel);
        (slot, isBuy,,) = g.act();
        assertEq(slot, 5);
        assertFalse(isBuy);
        assertGe(IERC20F(quote).balanceOf(owner), 1_000e18, "a completed round trip returns at least what it spent");
    }

    function _moveTo(Swapper sw, address pool, bool b0, int24 baseTick) internal {
        sw.swapTo(IPancakeV3Pool(pool), b0 ? baseTick : -baseTick);
        vm.warp(block.timestamp + 400);
        vm.roll(block.number + 400);
    }

    function _gridCreate(address pool, address base, address quote) internal returns (GridBand g) {
        address[] memory pools = new address[](1);
        pools[0] = pool;
        GridBandFactory f = new GridBandFactory(IPancakeV3Factory(PCS), pools);
        (, int24 t,,,,,) = IPancakeV3Pool(pool).slot0();
        int24 bt = IPancakeV3Pool(pool).token0() == base ? t : -t;
        address[] memory ex = new address[](1);
        ex[0] = keel;
        GridBandFactory.Create memory a;
        a.p = GridBand.Params(pool, base, bt - 1250, 200, 6, 100e18, 0, 1_000e18, 10e18, 300, 20, 30, 5000);
        a.expiresAt = uint64(block.timestamp + 30 days);
        a.executors = ex;
        a.fullFrom = 6;
        deal(quote, owner, 1_000e18);
        vm.startPrank(owner);
        g = GridBand(f.create(a, bytes32("f")));
        IERC20F(quote).approve(address(g), 1_000e18);
        IERC20F(base).approve(address(g), 10e18);
        vm.stopPrank();
    }

    function test_fork_rangeKeeper_threeRebalancesOnTheRealPositionManager() public {
        _keep(IPancakeV3Factory(PCS).getPool(WBNB, USDT, 500));
    }

    function test_fork_rangeKeeper_WBNB_USDT_100() public {
        _keep(IPancakeV3Factory(PCS).getPool(WBNB, USDT, 100));
    }

    function test_fork_rangeKeeper_WBNB_USDC_100() public {
        _keep(IPancakeV3Factory(PCS).getPool(WBNB, USDC, 100));
    }

    function test_fork_rangeKeeper_BTCB_USDT_500() public {
        _keep(IPancakeV3Factory(PCS).getPool(BTCB, USDT, 500));
    }

    function _keep(address pool) internal {
        console2.log("keeper pool", pool);
        RangeKeeper k = _grantOnFork(pool);
        Swapper sw = new Swapper();
        deal(IPancakeV3Pool(pool).token0(), address(sw), 1e30);
        deal(IPancakeV3Pool(pool).token1(), address(sw), 1e30);
        for (uint256 i; i < 3; ++i) {
            (,,,,, int24 lo, int24 up,,,,,) = INonfungiblePositionManager(NPM).positions(k.tokenId());
            sw.swapTo(IPancakeV3Pool(pool), i == 1 ? lo - 300 : up + 300);
            vm.warp(block.timestamp + 3700);
            vm.roll(block.number + 3700);
            uint256 g0 = gasleft();
            vm.prank(keel);
            k.act();
            console2.log("rebalance gas", g0 - gasleft());
        }
        assertEq(k.rebalances(), 3);
        assertEq(INonfungiblePositionManager(NPM).ownerOf(k.tokenId()), address(k));
        vm.prank(owner);
        k.end();
        assertEq(INonfungiblePositionManager(NPM).ownerOf(k.tokenId()), owner);
    }

    function _grantOnFork(address pool) internal returns (RangeKeeper) {
        address[] memory pools = new address[](1);
        pools[0] = pool;
        bytes memory init = Blueprint.initcodeFor(type(RangeKeeper).creationCode);
        address bp;
        assembly {
            bp := create(0, add(init, 32), mload(init))
        }
        RangeKeeperFactory f = new RangeKeeperFactory(INonfungiblePositionManager(NPM), bp, pools);
        uint256 id = _mintOnFork(pool);
        address[] memory ex = new address[](1);
        ex[0] = keel;
        RangeKeeperFactory.Create memory a;
        a.p = RangeKeeper.Params(pool, 0, true, 600, 20, 50, 20, 100, 500, 1 hours, 3);
        a.expiresAt = uint64(block.timestamp + 30 days);
        a.executors = ex;
        a.userSalt = bytes32("f");
        vm.prank(owner);
        (bool ok,) = NPM.call(
            abi.encodeWithSignature("safeTransferFrom(address,address,uint256,bytes)", owner, address(f), id, abi.encode(a))
        );
        require(ok, "grant");
        return RangeKeeper(INonfungiblePositionManager(NPM).ownerOf(id));
    }

    function _mintOnFork(address pool) internal returns (uint256 id) {
        (, int24 t,,,,,) = IPancakeV3Pool(pool).slot0();
        int24 sp = IPancakeV3Pool(pool).tickSpacing();
        int24 lower = ((t - 600) / sp) * sp;
        address t0 = IPancakeV3Pool(pool).token0();
        address t1 = IPancakeV3Pool(pool).token1();
        deal(t0, owner, 1e24);
        deal(t1, owner, 1e24);
        vm.startPrank(owner);
        IERC20F(t0).approve(NPM, type(uint256).max);
        IERC20F(t1).approve(NPM, type(uint256).max);
        (id,,,) = INonfungiblePositionManager(NPM).mint(
            INonfungiblePositionManager.MintParams(t0, t1, IPancakeV3Pool(pool).fee(), lower, lower + 1200, 1e21, 1e21, 0, 0, owner, block.timestamp)
        );
        vm.stopPrank();
    }

}

/// Venus on BSC testnet (6-decimal USDT and USDC with unlimited supply caps). Skips without FORK_URL_97.
contract ForkV2TestnetTest is ForkSweepBase {
    address constant COMP97 = 0x94d1820b2D1c7c7452A163983Dc888CEC546b77D;

    function setUp() public {
        string memory url = vm.envOr("FORK_URL_97", string(""));
        if (bytes(url).length == 0) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(url);
    }

    function test_fork97_yieldSweep_vUSDT() public {
        _sweep(COMP97, 0xb7526572FFE56AB9D7489838Bf2E18e3323b441A, 0xA11c8D9DC9b66E209Ef60F0C8D969D3CD988782c, 1e6);
    }

    function test_fork97_yieldSweep_vUSDC() public {
        _sweep(COMP97, 0xD5C4C2e2facBEB59D0216D0595d63FcDc6F9A1a7, 0x16227D60f7a0e586C66B005219dfc887D13C9531, 1e6);
    }

    function test_fork97_yieldSweep_vFDUSD() public {
        _sweep(COMP97, 0xF06e662a00796c122AaAE935EC4F0Be3F74f5636, 0xcF27439fA231af9931ee40c4f27Bb77B83826F3C, 1e18);
    }
}
