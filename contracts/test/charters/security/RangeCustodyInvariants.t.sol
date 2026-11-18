// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {Vm} from "forge-std/Vm.sol";
import {PcsFixture, IPoolFull, Swapper} from "../utils/PcsFixture.sol";
import {RangeKeeper} from "../../../src/charters/range/RangeKeeper.sol";
import {RangeKeeperFactory} from "../../../src/charters/range/RangeKeeperFactory.sol";
import {Blueprint} from "../../../src/charters/lib/Blueprint.sol";
import {INonfungiblePositionManager, IPancakeV3Pool} from "../../../src/charters/base/PancakeInterfaces.sol";
import {MockERC20} from "../mocks/VenusMocks.sol";

/// Random price paths, keeper and stranger calls, owner end, expiry and permissionless release against a Range
/// Keeper on real PancakeSwap v3 bytecode. Custody is the property under test (review R-07): the managed NFT is only
/// ever held by the keeper or the owner, the keeper never keeps tokens, a stranger never moves anything, and once
/// returned the owner holds the position.
contract RangeHandler is Test {
    RangeKeeper public k;
    INonfungiblePositionManager public npm;
    IPancakeV3Pool public pool;
    Swapper public swapper;
    MockERC20 public t0;
    MockERC20 public t1;
    address public owner;
    address public keel;
    address public stranger = makeAddr("stranger");
    bool public strangerMoved;
    uint256 public keelActs;
    bool public rescueTookManaged;
    int24 public center;

    constructor(RangeKeeper k_, INonfungiblePositionManager n, IPancakeV3Pool p, Swapper s, MockERC20 a, MockERC20 b, address o, address kl) {
        k = k_;
        npm = n;
        pool = p;
        swapper = s;
        t0 = a;
        t1 = b;
        owner = o;
        keel = kl;
        (, center,,,,,) = p.slot0();
    }

    function movePrice(int16 delta, uint16 secs) external {
        int24 target = int24(bound(int256(center) + int256(delta), int256(center) - 4_000, int256(center) + 4_000));
        swapper.swapTo(pool, target);
        uint256 s = bound(uint256(secs), 60, 4_000);
        vm.warp(block.timestamp + s);
        vm.roll(block.number + s);
    }

    function keelAct() external {
        vm.prank(keel);
        try k.act() {
            keelActs += 1;
        } catch {}
    }

    function strangerAct() external {
        vm.prank(stranger);
        try k.act() {
            strangerMoved = true;
        } catch {}
    }

    function ownerRescuesManaged() external {
        uint256 id = k.tokenId();
        address before = _holder(id);
        vm.prank(owner);
        try k.rescueNft(id) {
            if (before == address(k) && !k.returned()) rescueTookManaged = true;
        } catch {}
    }

    /// Terminal actions are rare (about 3% of calls) so most of each run exercises the live keeper.
    function ownerEnds(uint8 r) external {
        if (r >= 8) return;
        vm.prank(owner);
        k.end();
    }

    function expireAndRelease(uint8 r) external {
        if (r >= 8) return;
        vm.warp(k.expiresAt());
        vm.prank(stranger);
        try k.release() {} catch {}
    }

    function _holder(uint256 id) public view returns (address h) {
        try npm.ownerOf(id) returns (address a) {
            h = a;
        } catch {}
    }
}

/// forge-config: default.invariant.runs = 24
/// forge-config: default.invariant.depth = 25
/// forge-config: default.invariant.fail-on-revert = false
contract RangeCustodyInvariantTest is PcsFixture {
    uint256 constant E = 1e18;
    RangeHandler h;
    RangeKeeper k;
    MockERC20 t0;
    MockERC20 t1;
    IPoolFull pool;
    address owner = makeAddr("owner");
    address keel = makeAddr("keel");

    function setUp() public {
        vm.warp(1_762_700_000);
        _deployPcs();
        MockERC20 a = new MockERC20("A", 18);
        MockERC20 b = new MockERC20("B", 18);
        (t0, t1) = address(a) < address(b) ? (a, b) : (b, a);
        pool = _pool(t0, t1, 63970, 10_000 * E, 6_000_000 * E);
        vm.warp(block.timestamp + 3600);
        vm.roll(block.number + 1200);
        address bp;
        bytes memory init = Blueprint.initcodeFor(type(RangeKeeper).creationCode);
        assembly {
            bp := create(0, add(init, 32), mload(init))
        }
        address[] memory pools = new address[](1);
        pools[0] = address(pool);
        RangeKeeperFactory factory = new RangeKeeperFactory(npm, bp, pools);
        int24 t = _tick(pool);
        int24 lower = (t - 600) / 10 * 10;
        t0.mint(owner, 1_000_000 * E);
        t1.mint(owner, 1_000_000 * E);
        vm.startPrank(owner);
        t0.approve(address(npm), type(uint256).max);
        t1.approve(address(npm), type(uint256).max);
        (uint256 posId,,,) = npm.mint(
            INonfungiblePositionManager.MintParams(address(t0), address(t1), 500, lower, lower + 1200, 10 * E, 6_000 * E, 0, 0, owner, block.timestamp)
        );
        address[] memory ex = new address[](1);
        ex[0] = keel;
        RangeKeeperFactory.Create memory c = RangeKeeperFactory.Create({
            p: RangeKeeper.Params(address(pool), 0, true, 600, 20, 50, 20, 100, 500, 10 minutes, 20),
            expiresAt: uint64(block.timestamp + 30 days),
            tipToken: address(0),
            tipPerAction: 0,
            tipBudget: 0,
            executors: ex,
            userSalt: bytes32("inv")
        });
        vm.recordLogs();
        (bool ok,) = address(npm).call(
            abi.encodeWithSignature("safeTransferFrom(address,address,uint256,bytes)", owner, address(factory), posId, abi.encode(c))
        );
        require(ok, "grant");
        vm.stopPrank();
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter == address(factory)) k = RangeKeeper(address(uint160(uint256(logs[i].topics[2]))));
        }
        h = new RangeHandler(k, npm, pool, swapper, t0, t1, owner, keel);
        targetContract(address(h));
        bytes4[] memory sel = new bytes4[](6);
        sel[0] = RangeHandler.movePrice.selector;
        sel[1] = RangeHandler.keelAct.selector;
        sel[2] = RangeHandler.strangerAct.selector;
        sel[3] = RangeHandler.ownerRescuesManaged.selector;
        sel[4] = RangeHandler.ownerEnds.selector;
        sel[5] = RangeHandler.expireAndRelease.selector;
        targetSelector(StdInvariant.FuzzSelector({addr: address(h), selectors: sel}));
    }

    /// Reachability: a keeper rebalance happens through the handler, and custody holds after it.
    function test_handlerReachesRebalance() public {
        h.movePrice(2_000, 700);
        h.keelAct();
        assertEq(h.keelActs(), 1, "rebalance reached");
        assertEq(k.rebalances(), 1);
        invariant_managedNftIsWithKeeperOrOwner();
        invariant_keeperHoldsNoTokens();
    }

    function invariant_managedNftIsWithKeeperOrOwner() public view {
        address holder = h._holder(k.tokenId());
        assertTrue(holder == address(k) || holder == owner, "custody left keeper/owner");
        if (k.returned()) assertEq(holder, owner, "returned means the owner holds it");
        if (!k.returned()) assertEq(holder, address(k), "not returned means the keeper holds it");
    }

    function invariant_keeperHoldsNoTokens() public view {
        assertEq(t0.balanceOf(address(k)) + t1.balanceOf(address(k)), 0);
    }

    function invariant_strangersNeverMoveAnything() public view {
        assertFalse(h.strangerMoved(), "a non-executor acted");
        assertFalse(h.rescueTookManaged(), "rescueNft moved the managed position");
    }

    function invariant_rebalanceLimit() public view {
        assertLe(k.rebalances(), k.maxRebalances());
    }
}
