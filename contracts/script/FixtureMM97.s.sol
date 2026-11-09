// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {FixtureMarketMaker, IFixturePool} from "../src/fixtures/FixtureMarketMaker.sol";

/// BSC TESTNET ONLY (R6): deploys the fixture market maker for the fixture pool given in FIXTURE_POOL.
contract FixtureMM97 is Script {
    function run() external {
        require(block.chainid == 97, "testnet fixture only");
        vm.startBroadcast();
        FixtureMarketMaker mm = new FixtureMarketMaker(IFixturePool(vm.envAddress("FIXTURE_POOL")));
        vm.stopBroadcast();
        console2.log("FixtureMarketMaker", address(mm));
    }
}
