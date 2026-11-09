// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {TickMathLite} from "../charters/lib/TickMathLite.sol";

interface IFixturePool {
    function slot0() external view returns (uint160, int24, uint16, uint16, uint16, uint32, bool);
    function swap(address, bool, int256, uint160, bytes calldata) external returns (int256, int256);
    function token0() external view returns (address);
    function token1() external view returns (address);
}

interface IFaucet {
    function faucet(address to, uint256 amount) external;
    function transfer(address to, uint256 amount) external returns (bool);
}

/// BSC TESTNET FIXTURE ONLY (runbook R6). Moves Marque's labelled fixture pool to a target price so testnet grids
/// and range keepers meet real conditions. Only its operator can move the price; it pays the pool with fixture
/// tokens it mints from their faucet, and only to the one pool it was built for.
contract FixtureMarketMaker {
    address public immutable operator;
    IFixturePool public immutable pool;
    uint256 internal constant CHUNK = 100_000e18;
    bool internal swapping;

    constructor(IFixturePool pool_) {
        require(block.chainid == 97, "testnet fixture only");
        operator = msg.sender;
        pool = pool_;
    }

    function moveTo(int24 targetTick) external {
        require(msg.sender == operator, "operator");
        (uint160 p,,,,,,) = pool.slot0();
        uint160 limit = TickMathLite.getSqrtRatioAtTick(targetTick);
        if (limit == p) return;
        swapping = true;
        pool.swap(address(this), limit < p, int256(uint256(type(uint128).max)), limit, "");
        swapping = false;
    }

    function pancakeV3SwapCallback(int256 d0, int256 d1, bytes calldata) external {
        require(msg.sender == address(pool) && swapping, "pool");
        if (d0 > 0) _pay(pool.token0(), uint256(d0));
        if (d1 > 0) _pay(pool.token1(), uint256(d1));
    }

    function _pay(address token, uint256 amount) internal {
        for (uint256 left = amount; left > 0;) {
            uint256 n = left > CHUNK ? CHUNK : left;
            IFaucet(token).faucet(address(this), n);
            left -= n;
        }
        IFaucet(token).transfer(address(pool), amount);
    }
}
