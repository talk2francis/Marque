// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {FixtureToken} from "../src/fixtures/FixtureToken.sol";
import {TickMathLite} from "../src/charters/lib/TickMathLite.sol";

interface INpmFixture {
    struct MintParams {
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        address recipient;
        uint256 deadline;
    }

    function createAndInitializePoolIfNecessary(address, address, uint24, uint160) external payable returns (address);
    function mint(MintParams calldata) external payable returns (uint256, uint128, uint256, uint256);
}

interface IPoolFixture {
    function increaseObservationCardinalityNext(uint16) external;
}

/// BSC TESTNET ONLY (R6). Creates Marque's labelled fixture pool tUSDT/tWBNB (fee 0.05%) on the real PancakeSwap v3
/// testnet deployment, at the mainnet price given in USDT per BNB, with full-range liquidity from the broadcaster.
///   BNB_USD=687 forge script script/FixturePool97.s.sol --rpc-url bsc_testnet --keystore <file> --broadcast
contract FixturePool97 is Script {
    address constant NPM = 0x427bF5b37357632377eCbEC9de3626C71A5396c1;
    uint24 constant FEE = 500;
    int24 constant FULL = 887270; // full range for tick spacing 10

    function run() external {
        require(block.chainid == 97, "testnet fixture only");
        uint256 bnbUsd = vm.envUint("BNB_USD");
        vm.startBroadcast();
        address me = msg.sender;
        FixtureToken usdt = new FixtureToken("Marque test USDT (testnet fixture)", "tUSDT");
        FixtureToken wbnb = new FixtureToken("Marque test WBNB (testnet fixture)", "tWBNB");
        (address t0, address t1) = address(usdt) < address(wbnb) ? (address(usdt), address(wbnb)) : (address(wbnb), address(usdt));
        // price = token1 per token0. tWBNB per tUSDT = 1 / bnbUsd; tUSDT per tWBNB = bnbUsd.
        int24 tick = _tickFor(t0 == address(usdt), bnbUsd);
        uint160 sqrtP = TickMathLite.getSqrtRatioAtTick(tick);
        address pool = INpmFixture(NPM).createAndInitializePoolIfNecessary(t0, t1, FEE, sqrtP);
        IPoolFixture(pool).increaseObservationCardinalityNext(200);
        uint256 usdtAmt = 100_000e18;
        uint256 wbnbAmt = usdtAmt / bnbUsd;
        usdt.faucet(me, usdtAmt);
        wbnb.faucet(me, wbnbAmt);
        usdt.approve(NPM, usdtAmt);
        wbnb.approve(NPM, wbnbAmt);
        (uint256 a0, uint256 a1) = t0 == address(usdt) ? (usdtAmt, wbnbAmt) : (wbnbAmt, usdtAmt);
        INpmFixture(NPM).mint(INpmFixture.MintParams(t0, t1, FEE, -FULL, FULL, a0, a1, 0, 0, me, block.timestamp + 600));
        vm.stopBroadcast();
        console2.log("tUSDT", address(usdt));
        console2.log("tWBNB", address(wbnb));
        console2.log("pool", pool);
        console2.log("tick", tick);
    }

    /// ln(1.0001) * 1e18 = 99995000333308; tick = ln(price) / ln(1.0001), from bnbUsd as an integer, rounded to spacing.
    function _tickFor(bool usdtIs0, uint256 bnbUsd) internal pure returns (int24) {
        // log base 1.0001 of bnbUsd, by repeated search over ticks (bounded, testnet script only)
        int24 t;
        while (uint256(TickMathLite.getSqrtRatioAtTick(t + 10)) ** 2 >> 192 < bnbUsd) t += 10;
        return usdtIs0 ? -t : t;
    }
}
