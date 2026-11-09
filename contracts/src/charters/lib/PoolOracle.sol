// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IPancakeV3Pool} from "../base/PancakeInterfaces.sol";

/// @title PoolOracle
/// @notice Time-weighted and spot ticks from a PancakeSwap v3 pool, and the settle check both swap kinds use.
/// The TWAP is the pool's own arithmetic-mean tick over `window` seconds (observe). If the pool has not recorded
/// enough history, observe reverts ("OLD") and so does every action: no history, no trade.
library PoolOracle {
    error PriceUnsettled(int24 spot, int24 twap, uint24 maxDeviation);

    function twapTick(IPancakeV3Pool pool, uint32 window) internal view returns (int24 tick) {
        uint32[] memory ago = new uint32[](2);
        ago[0] = window;
        (int56[] memory cum,) = pool.observe(ago);
        int56 delta = cum[1] - cum[0];
        int56 w = int56(uint56(window));
        tick = int24(delta / w);
        if (delta < 0 && (delta % w != 0)) tick--;
    }

    function spotTick(IPancakeV3Pool pool) internal view returns (int24 tick) {
        (, tick,,,,,) = pool.slot0();
    }

    /// Reads both and requires the spot tick to sit within `maxDeviation` ticks (1 tick = about 1 bp) of the TWAP.
    function settled(IPancakeV3Pool pool, uint32 window, uint24 maxDeviation)
        internal
        view
        returns (int24 twap, int24 spot)
    {
        twap = twapTick(pool, window);
        spot = spotTick(pool);
        int256 d = int256(spot) - int256(twap);
        if (d < 0) d = -d;
        if (uint256(d) > maxDeviation) revert PriceUnsettled(spot, twap, maxDeviation);
    }
}
