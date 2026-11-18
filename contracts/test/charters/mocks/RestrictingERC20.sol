// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {MockERC20} from "./VenusMocks.sol";

/// A token that refuses transfers to restricted recipients, either by reverting or by returning false.
contract RestrictingERC20 is MockERC20 {
    mapping(address => bool) public blocked;
    bool public returnFalse;

    constructor() MockERC20("RST", 18) {}

    function setBlocked(address a, bool b) external {
        blocked[a] = b;
    }

    function setReturnFalse(bool f) external {
        returnFalse = f;
    }

    function transferFrom(address f, address to, uint256 a) external override returns (bool) {
        if (blocked[to]) {
            if (returnFalse) return false;
            revert("restricted");
        }
        require(balanceOf[f] >= a && allowance[f][msg.sender] >= a, "bal/allow");
        allowance[f][msg.sender] -= a;
        balanceOf[f] -= a;
        balanceOf[to] += a;
        return true;
    }
}
