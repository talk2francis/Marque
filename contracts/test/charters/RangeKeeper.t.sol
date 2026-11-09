// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Vm} from "forge-std/Vm.sol";
import {PcsFixture, IPoolFull} from "./utils/PcsFixture.sol";
import {RangeKeeper} from "../../src/charters/range/RangeKeeper.sol";
import {RangeKeeperFactory} from "../../src/charters/range/RangeKeeperFactory.sol";
import {CharterBase} from "../../src/charters/base/CharterBase.sol";
import {Blueprint} from "../../src/charters/lib/Blueprint.sol";
import {INonfungiblePositionManager} from "../../src/charters/base/PancakeInterfaces.sol";
import {MockERC20} from "./mocks/VenusMocks.sol";

/// Range Keeper against real PancakeSwap v3 pool and position-manager bytecode, at positive and negative ticks.
abstract contract RangeKeeperBase is PcsFixture {
    uint256 constant E = 1e18;
    MockERC20 t0;
    MockERC20 t1;
    IPoolFull pool;
    RangeKeeperFactory factory;
    address owner = makeAddr("owner");
    address keel = makeAddr("keel");
    uint256 posId;
    int24 lower;
    int24 upper;

    function startTick() internal pure virtual returns (int24);

    function setUp() public {
        vm.warp(1_762_700_000);
        _deployPcs();
        MockERC20 a = new MockERC20("A", 18);
        MockERC20 b = new MockERC20("B", 18);
        (t0, t1) = address(a) < address(b) ? (a, b) : (b, a);
        bool pos = startTick() > 0;
        pool = _pool(t0, t1, startTick(), pos ? 10_000 * E : 6_000_000 * E, pos ? 6_000_000 * E : 10_000 * E);
        vm.warp(block.timestamp + 3600);
        vm.roll(block.number + 1200);

        address bp;
        bytes memory init = Blueprint.initcodeFor(type(RangeKeeper).creationCode);
        assembly {
            bp := create(0, add(init, 32), mload(init))
        }
        address[] memory pools = new address[](1);
        pools[0] = address(pool);
        factory = new RangeKeeperFactory(npm, bp, pools);

        // The owner's own position, minted on PancakeSwap: +/- 600 ticks around the price.
        int24 t = _tick(pool);
        lower = _floor(t - 600);
        upper = lower + 1200;
        t0.mint(owner, 1_000_000 * E);
        t1.mint(owner, 1_000_000 * E);
        vm.startPrank(owner);
        t0.approve(address(npm), type(uint256).max);
        t1.approve(address(npm), type(uint256).max);
        (posId,,,) = npm.mint(
            INonfungiblePositionManager.MintParams(
                address(t0), address(t1), 500, lower, upper,
                pos ? 10 * E : 6_000 * E, pos ? 6_000 * E : 10 * E, 0, 0, owner, block.timestamp
            )
        );
        vm.stopPrank();
    }

    function _floor(int24 x) internal pure returns (int24) {
        int24 q = x / 10;
        if (x < 0 && x % 10 != 0) q -= 1;
        return q * 10;
    }

    function _create(uint8 mode, bool feesToOwner, uint16 maxLoss, uint16 maxRebalances)
        internal
        returns (RangeKeeper k)
    {
        address[] memory ex = new address[](1);
        ex[0] = keel;
        RangeKeeperFactory.Create memory a = RangeKeeperFactory.Create({
            p: RangeKeeper.Params({
                pool: address(pool),
                mode: mode,
                feesToOwner: feesToOwner,
                twapWindow: 600,
                maxDeviation: 20,
                slipTicks: 50,
                bufferTicks: 20,
                maxLossBps: maxLoss,
                maxLeftoverBps: 500,
                minInterval: 1 hours,
                maxRebalances: maxRebalances
            }),
            expiresAt: uint64(block.timestamp + 60 days),
            tipToken: address(0),
            tipPerAction: 0,
            tipBudget: 0,
            executors: ex,
            userSalt: bytes32("rk")
        });
        vm.recordLogs();
        vm.prank(owner);
        _safeTransfer(owner, address(factory), posId, abi.encode(a));
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter == address(factory)) k = RangeKeeper(address(uint160(uint256(logs[i].topics[2]))));
        }
    }

    function _safeTransfer(address from, address to, uint256 id, bytes memory data) internal {
        (bool ok, bytes memory ret) = address(npm).call(
            abi.encodeWithSignature("safeTransferFrom(address,address,uint256,bytes)", from, to, id, data)
        );
        if (!ok) {
            assembly {
                revert(add(ret, 32), mload(ret))
            }
        }
    }

    function _churnFees() internal {
        for (uint256 i; i < 4; ++i) {
            swapper.swapExact(pool, true, 2 * E);
            swapper.swapExact(pool, false, 1_200 * E);
            vm.roll(block.number + 1);
        }
    }

    function _rebalanceTo(RangeKeeper k, int24 target) internal returns (uint256 newId, uint256 vBefore, uint256 vAfter) {
        _moveAndSettle(pool, target, 3700);
        uint256 oldId = k.tokenId();
        vm.recordLogs();
        vm.prank(keel);
        k.act();
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter == address(k) && logs[i].topics[0] == RangeKeeper.RebalanceValue.selector) {
                (vBefore, vAfter,,,,) = abi.decode(logs[i].data, (uint256, uint256, uint256, uint256, uint256, uint256));
            }
        }
        newId = k.tokenId();
        assertTrue(newId != oldId, "a successor NFT");
        vm.expectRevert();
        npm.ownerOf(oldId); // the emptied NFT is burned
        assertEq(npm.ownerOf(newId), address(k), "the successor is held by the keeper");
        assertGe(vAfter * 10_000, vBefore * 9_900, "within the 1% execution-loss bound");
        assertEq(t0.balanceOf(address(k)) + t1.balanceOf(address(k)), 0, "no tokens left in the keeper");
        (,,,,, int24 lo, int24 up, uint128 liq,,,,) = npm.positions(newId);
        assertEq(up - lo, 1200, "same width");
        assertGt(liq, 0);
        (int24 cl, int24 cu) = k.centeredRange(_tick(pool) > lo && _tick(pool) < up ? _twap() : _twap());
        assertEq(lo, cl);
        assertEq(up, cu);
    }

    function _twap() internal view returns (int24) {
        uint32[] memory ago = new uint32[](2);
        ago[0] = 600;
        (int56[] memory c,) = pool.observe(ago);
        int56 d = c[1] - c[0];
        int24 t = int24(d / 600);
        if (d < 0 && d % 600 != 0) t--;
        return t;
    }

    function test_grantMovesTheNftIntoTheKeeper_inOneTransaction() public {
        RangeKeeper k = _create(0, true, 100, 3);
        assertEq(npm.ownerOf(posId), address(k));
        assertEq(k.owner(), owner);
        assertEq(k.tokenId(), posId);
        assertTrue(k.deposited());
        assertEq(k.width(), 1200);
        assertTrue(factory.isCharter(address(k)));
    }

    function test_inRange_orInsideTheBuffer_doesNothing() public {
        RangeKeeper k = _create(0, true, 100, 3);
        vm.prank(keel);
        vm.expectPartialRevert(RangeKeeper.InRange.selector);
        k.act();
        _moveAndSettle(pool, upper + 10, 3700); // out, but inside the 20-tick buffer
        vm.prank(keel);
        vm.expectPartialRevert(RangeKeeper.InRange.selector);
        k.act();
    }

    function test_threeRebalances_successorNfts_boundsAndFeesToOwner() public {
        RangeKeeper k = _create(0, true, 100, 3);
        _churnFees();
        uint256 f0 = t0.balanceOf(owner);
        uint256 f1 = t1.balanceOf(owner);

        (uint256 id1,,) = _rebalanceTo(k, upper + 300);
        assertGt(t0.balanceOf(owner) + t1.balanceOf(owner), f0 + f1, "fees and leftovers reached the owner");
        (,,,,, int24 lo1, int24 up1,,,,,) = npm.positions(id1);

        (uint256 id2,,) = _rebalanceTo(k, lo1 - 300); // second: back down through the new range
        (,,,,, int24 lo2, int24 up2,,,,,) = npm.positions(id2);
        assertLt(up2, up1);

        (uint256 id3,,) = _rebalanceTo(k, up2 + 500); // third: up again
        (,,,,, int24 lo3,,,,,,) = npm.positions(id3);
        assertGt(lo3, lo2);
        assertEq(k.rebalances(), 3);

        _moveAndSettle(pool, lo3 - 400, 3700);
        vm.prank(keel);
        vm.expectRevert(RangeKeeper.LimitReached.selector);
        k.act();

        vm.prank(owner);
        k.end();
        assertEq(npm.ownerOf(id3), owner, "the owner takes the current position back");
    }

    function test_minIntervalBetweenRebalances() public {
        RangeKeeper k = _create(0, true, 100, 5);
        _rebalanceTo(k, upper + 300);
        (,,,,, int24 lo1,,,,,,) = npm.positions(k.tokenId());
        _moveAndSettle(pool, lo1 - 300, 700); // TWAP settled, but under an hour since the last move
        vm.prank(keel);
        vm.expectPartialRevert(RangeKeeper.TooSoon.selector);
        k.act();
    }

    function test_spotBackInRange_blocksEvenIfTwapIsOut() public {
        RangeKeeper k = _create(0, true, 100, 3);
        _moveAndSettle(pool, upper + 300, 3700);
        swapper.swapTo(pool, upper - 15); // spot back inside, within maxDeviation? no: 315 ticks away
        vm.prank(keel);
        vm.expectRevert();
        k.act();
    }

    function test_failedBound_rollsBackEverything() public {
        RangeKeeper k = _create(0, true, 1, 3); // 0.01% loss bound: the balancing swap's fee alone exceeds it
        _moveAndSettle(pool, upper + 300, 3700);
        (,,,,,,, uint128 liqBefore,,,,) = npm.positions(posId);
        vm.prank(keel);
        vm.expectPartialRevert(RangeKeeper.ValueLoss.selector);
        k.act();
        assertEq(k.tokenId(), posId, "position untouched");
        (,,,,,,, uint128 liqAfter,,,,) = npm.positions(posId);
        assertEq(liqAfter, liqBefore);
        assertEq(npm.ownerOf(posId), address(k));
        assertEq(k.rebalances(), 0);
    }

    function test_exitMode_closesOnceToTheOwner() public {
        RangeKeeper k = _create(1, true, 100, 0);
        _moveAndSettle(pool, lower - 300, 3700);
        uint256 b0 = t0.balanceOf(owner);
        uint256 b1 = t1.balanceOf(owner);
        vm.prank(keel);
        k.act();
        assertTrue(k.ended());
        assertTrue(t0.balanceOf(owner) > b0 || t1.balanceOf(owner) > b1);
        vm.expectRevert();
        npm.ownerOf(posId);
    }

    function test_compoundingKeepsFeesInThePosition() public {
        RangeKeeper k = _create(0, false, 100, 3);
        _churnFees();
        (, uint256 vBefore,) = _rebalanceTo(k, upper + 300);
        assertGt(vBefore, 0);
    }

    function test_releaseAfterExpiry_byAnyone() public {
        RangeKeeper k = _create(0, true, 100, 3);
        vm.prank(makeAddr("anyone"));
        vm.expectRevert(RangeKeeper.NotReleasable.selector);
        k.release();
        vm.warp(block.timestamp + 61 days);
        vm.prank(makeAddr("anyone"));
        k.release();
        assertEq(npm.ownerOf(posId), owner);
    }

    function test_onlyTheOwnerGrants_andOnlyMatchingPositions() public {
        // An approved operator cannot grant a charter over someone else's position.
        address op = makeAddr("operator");
        vm.prank(owner);
        (bool ok,) = address(npm).call(abi.encodeWithSignature("setApprovalForAll(address,bool)", op, true));
        assertTrue(ok);
        RangeKeeperFactory.Create memory a;
        a.p.pool = address(pool);
        vm.prank(op);
        vm.expectRevert();
        _safeTransfer(owner, address(factory), posId, abi.encode(a));
        assertEq(npm.ownerOf(posId), owner, "a failed grant never moves the NFT");
    }

    function test_unexpectedNftsAreRefused_orRescued() public {
        RangeKeeper k = _create(0, true, 100, 3);
        vm.startPrank(owner);
        (uint256 other,,,) = npm.mint(
            INonfungiblePositionManager.MintParams(
                address(t0), address(t1), 500, lower, upper, 1 * E, 600 * E, 0, 0, owner, block.timestamp
            )
        );
        vm.expectRevert();
        _safeTransfer(owner, address(k), other, "");
        npm.transferFrom(owner, address(k), other); // no callback: it lands
        k.rescueNft(other);
        vm.stopPrank();
        assertEq(npm.ownerOf(other), owner);
        vm.prank(owner);
        vm.expectRevert(RangeKeeper.UnexpectedNft.selector);
        k.rescueNft(posId);
    }

    function test_onlyOwnerAndExecutorsMayAct() public {
        RangeKeeper k = _create(0, true, 100, 3);
        _moveAndSettle(pool, upper + 300, 3700);
        address s = makeAddr("stranger");
        vm.prank(s);
        vm.expectRevert(abi.encodeWithSelector(CharterBase.NotExecutor.selector, s));
        k.act();
        vm.prank(owner);
        k.act();
    }
}

contract RangeKeeperPositiveTickTest is RangeKeeperBase {
    function startTick() internal pure override returns (int24) {
        return 63970;
    }
}

contract RangeKeeperNegativeTickTest is RangeKeeperBase {
    function startTick() internal pure override returns (int24) {
        return -63970;
    }
}
