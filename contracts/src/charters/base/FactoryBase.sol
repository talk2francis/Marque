// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {CharterBase} from "./CharterBase.sol";

/// @title FactoryBase (Charters v2)
/// @notice Shared rules for every v2 factory: the caller is always the owner, the end date is bounded, tips are
/// bounded and paid in one of the charter's own tokens, and every charter the factory makes is recorded.
/// Factories have no owner, no admin and no setters. A new rule or market means a new factory.
abstract contract FactoryBase {
    uint64 public constant MIN_DURATION = 1 days;
    uint64 public constant MAX_DURATION = 180 days;

    mapping(address => bool) public isCharter;
    uint256 public charters;

    error BadExpiry();
    error BadTip();
    error BadExecutors();

    function _common(
        uint64 expiresAt,
        address tipToken,
        uint256 tipPerAction,
        uint256 tipBudget,
        address[] memory executors,
        bool open,
        address tokenA,
        address tokenB
    ) internal view returns (CharterBase.Common memory c) {
        if (expiresAt < block.timestamp + MIN_DURATION || expiresAt > block.timestamp + MAX_DURATION) revert BadExpiry();
        if (tipBudget != 0 || tipPerAction != 0) {
            if (tipPerAction == 0 || tipPerAction > tipBudget) revert BadTip();
            if (tipToken != tokenA && tipToken != tokenB) revert BadTip();
        }
        if (open && executors.length != 0) revert BadExecutors();
        if (executors.length > 8) revert BadExecutors();
        c = CharterBase.Common({
            owner: msg.sender,
            expiresAt: expiresAt,
            tipToken: tipToken,
            tipPerAction: tipPerAction,
            tipBudget: tipBudget,
            executors: executors
        });
    }

    function _record(address charter) internal {
        isCharter[charter] = true;
        charters += 1;
    }
}
