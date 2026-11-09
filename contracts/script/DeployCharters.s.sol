// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {CharterFactory} from "../src/charters/CharterFactory.sol";
import {IComptroller} from "../src/charters/VenusInterfaces.sol";

/// Deploys CharterFactory v1 on the current chain with the reviewed Venus Core debt markets.
///
/// Addresses come from venus-protocol/deployments/{bscmainnet,bsctestnet}_addresses.json and MUST be
/// re-checked against the live chain in P1 (comptroller(), underlying(), not paused) before use.
/// Never put a raw key on the command line. Either an encrypted keystore account:
///   forge script script/DeployCharters.s.sol --rpc-url bsc_testnet --account marque-ops --broadcast
/// or the key in this process's environment only, as CHARTERS_DEPLOYER_KEY (read here, never logged).
/// No --verify before launch: contracts stay unverified until the launch day.
/// Mainnet needs Francis's written "approved, mainnet" for this exact action table first.
contract DeployCharters is Script {
    function run() external returns (CharterFactory factory) {
        (address comptroller, address[] memory markets) = _manifest(block.chainid);
        uint256 key = vm.envOr("CHARTERS_DEPLOYER_KEY", uint256(0));
        if (key != 0) vm.startBroadcast(key);
        else vm.startBroadcast();
        factory = new CharterFactory(IComptroller(comptroller), markets);
        vm.stopBroadcast();
        console2.log("CharterFactory", address(factory));
        console2.log("chainId", block.chainid);
        for (uint256 i; i < markets.length; ++i) console2.log("market", markets[i]);
    }

    function _manifest(uint256 chainId) internal pure returns (address comptroller, address[] memory m) {
        m = new address[](3);
        if (chainId == 56) {
            comptroller = 0xfD36E2c2a6789Db23113685031d7F16329158384; // Unitroller (Core pool)
            m[0] = 0xfD5840Cd36d94D7229439859C0112a4185BC0255; // vUSDT
            m[1] = 0xecA88125a5ADbe82614ffC12D0DB554E2e2867C8; // vUSDC
            m[2] = 0xC4eF4229FEc74Ccfe17B2bdeF7715fAC740BA0ba; // vFDUSD
        } else if (chainId == 97) {
            comptroller = 0x94d1820b2D1c7c7452A163983Dc888CEC546b77D; // Unitroller (Core pool, testnet)
            m[0] = 0xb7526572FFE56AB9D7489838Bf2E18e3323b441A; // vUSDT
            m[1] = 0xD5C4C2e2facBEB59D0216D0595d63FcDc6F9A1a7; // vUSDC
            m[2] = 0xF06e662a00796c122AaAE935EC4F0Be3F74f5636; // vFDUSD
        } else {
            revert("unsupported chain");
        }
    }
}
