// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title MarqueRegistry
 * @notice An append-only anchor for Marque receipts and sealed calls.
 *
 * @dev This contract is deliberately, aggressively small.
 *
 * AGENTS.md invariant 13: do not invent new protocols. Identity is ERC-8004,
 * commerce is ERC-8183, payment is x402, sessions are Altana. This contract
 * exists only to give two things a timestamp nobody can backdate:
 *
 *   anchor()   — a receipt hash, proving a run's evidence existed and has not
 *                been edited since.
 *   sealCall() — a recommendation hash, published BEFORE the outcome is known,
 *                so a track record cannot be assembled after the fact.
 *
 * The sealed call is the whole reason this contract is worth deploying. A win
 * rate quoted with no window and no prior commitment is unfalsifiable. A hash
 * written to a public chain at a block that precedes the outcome is not.
 *
 * What this contract deliberately does NOT have:
 *   - no funds. It cannot receive value and has no withdrawal path.
 *   - no owner, no admin, no pause, no upgrade. Nothing to compromise, and
 *     nothing anyone has to trust us not to do later.
 *   - no reputation logic, no scoring, no storage of the underlying data.
 *
 * Anyone may anchor anything. That is intentional: the contract proves WHEN a
 * hash was published and BY WHOM, and nothing else. Meaning comes from Marque
 * publishing the preimage. A permissioned anchor would be a worse guarantee,
 * because then the operator chooses what history says.
 */
contract MarqueRegistry {
    /// @notice A receipt hash was anchored.
    /// @param anchorer  Who published it.
    /// @param leaf      keccak256 of the canonically serialised receipt.
    /// @param blockTime Block timestamp, denormalised so an indexer reading only
    ///                  logs never has to fetch the block to order events.
    event Anchored(address indexed anchorer, bytes32 indexed leaf, uint64 blockTime);

    /// @notice A recommendation was sealed before its outcome was known.
    /// @param sealer    Who published it.
    /// @param callHash  keccak256(recommendation ‖ block ‖ agentId ‖ timestamp).
    /// @param agentId   ERC-8004 identity the call belongs to, for cheap filtering.
    /// @param blockTime Block timestamp at the moment of sealing.
    event CallSealed(address indexed sealer, bytes32 indexed callHash, bytes32 indexed agentId, uint64 blockTime);

    /// @notice Block number at which a leaf was first anchored. 0 means never.
    /// @dev First write wins. Re-anchoring is a no-op for storage but still
    ///      emits, so a duplicate is visible without being able to rewrite the
    ///      original timestamp.
    mapping(bytes32 => uint256) public anchoredAt;

    /// @notice Block number at which a call hash was first sealed. 0 means never.
    mapping(bytes32 => uint256) public sealedAt;

    /// @notice Total anchors emitted, including duplicates.
    uint256 public anchorCount;

    /// @notice Total seals emitted, including duplicates.
    uint256 public sealCount;

    error EmptyHash();

    /**
     * @notice Anchor a receipt hash.
     * @param leaf keccak256 of the canonically serialised receipt.
     */
    function anchor(bytes32 leaf) external {
        if (leaf == bytes32(0)) revert EmptyHash();
        // First write wins: an anchor's value is its earliest timestamp, so a
        // later call must never be able to move it.
        if (anchoredAt[leaf] == 0) {
            anchoredAt[leaf] = block.number;
        }
        unchecked {
            ++anchorCount;
        }
        emit Anchored(msg.sender, leaf, uint64(block.timestamp));
    }

    /**
     * @notice Seal a recommendation before its outcome is known.
     * @param callHash keccak256(recommendation ‖ block ‖ agentId ‖ timestamp).
     * @param agentId  ERC-8004 identity, indexed so a profile can filter cheaply.
     */
    function sealCall(bytes32 callHash, bytes32 agentId) external {
        if (callHash == bytes32(0)) revert EmptyHash();
        if (sealedAt[callHash] == 0) {
            sealedAt[callHash] = block.number;
        }
        unchecked {
            ++sealCount;
        }
        emit CallSealed(msg.sender, callHash, agentId, uint64(block.timestamp));
    }

    /**
     * @notice Anchor several receipts in one transaction.
     * @dev Batching matters because the nightly conform sweep produces many
     *      receipts at once and BSC blocks are 0.45s; one call per receipt
     *      wastes gas and clutters the log for no gain.
     */
    function anchorBatch(bytes32[] calldata leaves) external {
        uint256 len = leaves.length;
        for (uint256 i = 0; i < len;) {
            bytes32 leaf = leaves[i];
            if (leaf == bytes32(0)) revert EmptyHash();
            if (anchoredAt[leaf] == 0) {
                anchoredAt[leaf] = block.number;
            }
            emit Anchored(msg.sender, leaf, uint64(block.timestamp));
            unchecked {
                ++i;
            }
        }
        unchecked {
            anchorCount += len;
        }
    }

    /// @notice True when this leaf has been anchored at least once.
    function isAnchored(bytes32 leaf) external view returns (bool) {
        return anchoredAt[leaf] != 0;
    }

    /// @notice True when this call hash was sealed at least once.
    function isSealed(bytes32 callHash) external view returns (bool) {
        return sealedAt[callHash] != 0;
    }
}
