// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IPancakeV3Pool} from "../../../src/charters/base/PancakeInterfaces.sol";
import {TickMathLite} from "../../../src/charters/lib/TickMathLite.sol";
import {PoolMath} from "../../../src/charters/lib/PoolMath.sol";

interface IERC20T {
    function transfer(address, uint256) external returns (bool);
}

contract Pusher {
    function push(IPancakeV3Pool pool, int24 targetTick) external returns (int256 d0, int256 d1) {
        (uint160 p,,,,,,) = pool.slot0();
        uint160 limit = TickMathLite.getSqrtRatioAtTick(targetTick);
        (d0, d1) = pool.swap(address(this), limit < p, type(int128).max, limit, "");
    }

    function pancakeV3SwapCallback(int256 d0, int256 d1, bytes calldata) external {
        IPancakeV3Pool pool = IPancakeV3Pool(msg.sender);
        if (d0 > 0) IERC20T(pool.token0()).transfer(msg.sender, uint256(d0));
        if (d1 > 0) IERC20T(pool.token1()).transfer(msg.sender, uint256(d1));
    }
}

/// Review R-06: what it costs, on today's reviewed mainnet pools, to hold the price Δ ticks away from fair value for
/// a Range Keeper TWAP window. One "push" moves spot by Δ (paying price impact + fee); if arbitrage restores the price
/// after each push, the attacker loses that push's impact again and again. Logged per pool and Δ, in USD (18 dp).
/// Read-only: runs on a local fork; skipped without FORK_URL.
contract ForkManipulationCostTest is Test {
    address[4] pools = [
        0x172fcD41E0913e95784454622d1c3724f546f849, // WBNB/USDT 0.01%
        0x36696169C63e42cd08ce11f5deeBbCeBae652050, // WBNB/USDT 0.05%
        0xf2688Fb5B81049DFB7703aDa5e770543770612C4, // WBNB/USDC 0.01%
        0x46Cf1cF8c69595804ba91dFdd8d6b960c9B0a7C4 // BTCB/USDT 0.05%
    ];
    int24[4] deltas = [int24(50), 200, 500, 1500];

    function setUp() public {
        string memory url = vm.envOr("FORK_URL", string(""));
        if (bytes(url).length == 0) vm.skip(true);
        vm.createSelectFork(url);
    }

    function test_fork_costToHoldPriceOff() public {
        for (uint256 i; i < pools.length; ++i) {
            IPancakeV3Pool pool = IPancakeV3Pool(pools[i]);
            emit log_named_address("pool", address(pool));
            emit log_named_uint("active liquidity", pool.liquidity());
            for (uint256 j; j < deltas.length; ++j) {
                uint256 snap = vm.snapshotState();
                Pusher p = new Pusher();
                (uint160 fair, int24 tick,,,,,) = pool.slot0();
                // token0 is the stablecoin in all four pools: push the stable side in (tick falls).
                deal(pool.token0(), address(p), 1e36);
                (int256 d0, int256 d1) = p.push(pool, tick - deltas[j]);
                uint256 paid0 = uint256(d0);
                uint256 got1 = uint256(-d1);
                uint256 gotValue0 = PoolMath.amount1In0(fair, got1); // fair-value of what came out, in token0 (USD)
                uint256 loss = paid0 > gotValue0 ? paid0 - gotValue0 : 0;
                emit log_named_int("  delta ticks", deltas[j]);
                emit log_named_decimal_uint("    USD moved per push", paid0, 18);
                emit log_named_decimal_uint("    USD lost per push (impact+fee vs fair)", loss, 18);
                vm.revertToState(snap);
            }
        }
    }
}
