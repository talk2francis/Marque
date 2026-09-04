// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MarqueRegistry} from "../src/MarqueRegistry.sol";

/**
 * The contract's entire value is that a timestamp cannot be moved after the
 * fact. These tests exist to prove that specific property, and to prove the
 * contract has no way to take custody of anything.
 */
contract MarqueRegistryTest is Test {
    MarqueRegistry internal registry;

    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    event Anchored(address indexed anchorer, bytes32 indexed leaf, uint64 blockTime);
    event CallSealed(address indexed sealer, bytes32 indexed callHash, bytes32 indexed agentId, uint64 blockTime);

    function setUp() public {
        registry = new MarqueRegistry();
    }

    // ---------------------------------------------------------------- anchor

    function test_anchor_recordsBlockAndEmits() public {
        bytes32 leaf = keccak256("receipt-1");
        vm.roll(1000);
        vm.warp(1_700_000_000);

        vm.expectEmit(true, true, false, true);
        emit Anchored(alice, leaf, uint64(1_700_000_000));

        vm.prank(alice);
        registry.anchor(leaf);

        assertEq(registry.anchoredAt(leaf), 1000);
        assertTrue(registry.isAnchored(leaf));
        assertEq(registry.anchorCount(), 1);
    }

    function test_anchor_firstWriteWins() public {
        bytes32 leaf = keccak256("receipt-1");
        vm.roll(1000);
        vm.prank(alice);
        registry.anchor(leaf);

        // The whole point of an anchor is its EARLIEST timestamp. A later call,
        // by anyone, must not be able to move it forward.
        vm.roll(5000);
        vm.prank(bob);
        registry.anchor(leaf);

        assertEq(registry.anchoredAt(leaf), 1000, "anchor timestamp was moved");
        assertEq(registry.anchorCount(), 2, "duplicate should still be counted and emitted");
    }

    function test_anchor_rejectsEmptyHash() public {
        vm.expectRevert(MarqueRegistry.EmptyHash.selector);
        registry.anchor(bytes32(0));
    }

    function test_anchor_isPermissionless() public {
        // Anyone may anchor. A permissioned anchor would be a WEAKER guarantee:
        // the operator would then choose what history says.
        vm.prank(bob);
        registry.anchor(keccak256("someone-elses-receipt"));
        assertTrue(registry.isAnchored(keccak256("someone-elses-receipt")));
    }

    function test_anchorBatch() public {
        bytes32[] memory leaves = new bytes32[](3);
        leaves[0] = keccak256("a");
        leaves[1] = keccak256("b");
        leaves[2] = keccak256("c");

        vm.roll(2000);
        vm.prank(alice);
        registry.anchorBatch(leaves);

        assertEq(registry.anchoredAt(leaves[0]), 2000);
        assertEq(registry.anchoredAt(leaves[2]), 2000);
        assertEq(registry.anchorCount(), 3);
    }

    function test_anchorBatch_rejectsEmptyHashAnywhere() public {
        bytes32[] memory leaves = new bytes32[](2);
        leaves[0] = keccak256("a");
        leaves[1] = bytes32(0);
        vm.expectRevert(MarqueRegistry.EmptyHash.selector);
        registry.anchorBatch(leaves);
    }

    // ------------------------------------------------------------- sealCall

    function test_sealCall_recordsAndEmits() public {
        bytes32 callHash = keccak256("recommendation-1");
        bytes32 agentId = keccak256("56:0x8004:318810");
        vm.roll(3000);
        vm.warp(1_700_000_500);

        vm.expectEmit(true, true, true, true);
        emit CallSealed(alice, callHash, agentId, uint64(1_700_000_500));

        vm.prank(alice);
        registry.sealCall(callHash, agentId);

        assertEq(registry.sealedAt(callHash), 3000);
        assertTrue(registry.isSealed(callHash));
        assertEq(registry.sealCount(), 1);
    }

    function test_sealCall_cannotBeBackdatedByResealing() public {
        // A sealed call is only evidence because it PRECEDED the outcome. If a
        // later seal could overwrite the block, a track record could be
        // assembled after the fact — which is the exact thing this prevents.
        bytes32 callHash = keccak256("recommendation-1");
        bytes32 agentId = keccak256("agent");

        vm.roll(100);
        registry.sealCall(callHash, agentId);

        vm.roll(999_999);
        registry.sealCall(callHash, agentId);

        assertEq(registry.sealedAt(callHash), 100, "seal block was rewritten");
    }

    function test_sealCall_rejectsEmptyHash() public {
        vm.expectRevert(MarqueRegistry.EmptyHash.selector);
        registry.sealCall(bytes32(0), keccak256("agent"));
    }

    function test_unsealedAndUnanchoredReadAsZero() public view {
        assertFalse(registry.isAnchored(keccak256("never")));
        assertFalse(registry.isSealed(keccak256("never")));
        assertEq(registry.anchoredAt(keccak256("never")), 0);
    }

    // --------------------------------------------------------- custody proof

    function test_contractCannotReceiveValue() public {
        // No receive, no fallback, no payable function. The contract must not be
        // able to hold funds even if someone tries to send some.
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        (bool ok,) = address(registry).call{value: 1 ether}("");
        assertFalse(ok, "registry accepted value");
        assertEq(address(registry).balance, 0);
    }

    function test_hasNoAdminSurface() public view {
        // A contract with no owner cannot be captured, paused or upgraded. This
        // is asserted by bytecode size as a smoke test: an admin surface would
        // make the contract materially larger than a two-function anchor.
        uint256 size = address(registry).code.length;
        assertLt(size, 4000, "contract grew past a plausible anchor-only size");
    }

    // ------------------------------------------------------------- fuzzing

    function testFuzz_anchorAnyNonZeroLeaf(bytes32 leaf) public {
        vm.assume(leaf != bytes32(0));
        registry.anchor(leaf);
        assertTrue(registry.isAnchored(leaf));
    }

    function testFuzz_firstBlockAlwaysWins(bytes32 leaf, uint64 first, uint64 second) public {
        vm.assume(leaf != bytes32(0));
        vm.assume(first > 0 && second > first);
        vm.roll(first);
        registry.anchor(leaf);
        vm.roll(second);
        registry.anchor(leaf);
        assertEq(registry.anchoredAt(leaf), first);
    }
}
