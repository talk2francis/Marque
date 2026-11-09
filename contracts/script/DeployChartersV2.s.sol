// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {LoanGuardFactoryV2} from "../src/charters/loan/LoanGuardFactoryV2.sol";
import {YieldSweepFactory} from "../src/charters/yield/YieldSweepFactory.sol";
import {GridBandFactory} from "../src/charters/grid/GridBandFactory.sol";
import {RangeKeeperFactory} from "../src/charters/range/RangeKeeperFactory.sol";
import {RangeKeeper} from "../src/charters/range/RangeKeeper.sol";
import {Blueprint} from "../src/charters/lib/Blueprint.sol";
import {IComptroller} from "../src/charters/VenusInterfaces.sol";
import {IComptrollerSupply} from "../src/charters/base/VenusSupply.sol";
import {IPancakeV3Factory, INonfungiblePositionManager} from "../src/charters/base/PancakeInterfaces.sol";

/// Deploys the four Charters v2 factories on the current chain.
///   GRID_POOLS=0x..,0x..  RANGE_POOLS=0x..,0x..  forge script script/DeployChartersV2.s.sol \
///     --rpc-url bsc_testnet --account <keystore> --broadcast
/// Venus addresses are the reviewed Core pool ones (re-check live in P1 of the four-category plan); pool lists come
/// from the environment because they differ per chain and, on 97, are labelled test fixtures. Mainnet needs
/// Francis's written "approved, mainnet" for the exact action table first. Do not pass --verify before launch.
contract DeployChartersV2 is Script {
    address constant PCS_FACTORY = 0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865;

    function run() external {
        (address comptroller, address[] memory markets, address npm) = _manifest(block.chainid);
        address[] memory gridPools = vm.envAddress("GRID_POOLS", ",");
        address[] memory rangePools = vm.envAddress("RANGE_POOLS", ",");
        vm.startBroadcast();
        LoanGuardFactoryV2 lg = new LoanGuardFactoryV2(IComptroller(comptroller), markets);
        YieldSweepFactory ys = new YieldSweepFactory(IComptrollerSupply(comptroller), markets);
        GridBandFactory gb = new GridBandFactory(IPancakeV3Factory(PCS_FACTORY), gridPools);
        bytes memory init = Blueprint.initcodeFor(type(RangeKeeper).creationCode);
        address bp;
        assembly {
            bp := create(0, add(init, 32), mload(init))
        }
        require(bp != address(0), "blueprint");
        RangeKeeperFactory rk = new RangeKeeperFactory(INonfungiblePositionManager(npm), bp, rangePools);
        vm.stopBroadcast();
        console2.log("LoanGuardFactoryV2", address(lg));
        console2.log("YieldSweepFactory", address(ys));
        console2.log("GridBandFactory", address(gb));
        console2.log("RangeKeeperBlueprint", bp);
        console2.log("RangeKeeperFactory", address(rk));
    }

    function _manifest(uint256 chainId) internal pure returns (address comptroller, address[] memory m, address npm) {
        m = new address[](3);
        if (chainId == 56) {
            comptroller = 0xfD36E2c2a6789Db23113685031d7F16329158384;
            m[0] = 0xfD5840Cd36d94D7229439859C0112a4185BC0255; // vUSDT
            m[1] = 0xecA88125a5ADbe82614ffC12D0DB554E2e2867C8; // vUSDC
            m[2] = 0xC4eF4229FEc74Ccfe17B2bdeF7715fAC740BA0ba; // vFDUSD
            npm = 0x46A15B0b27311cedF172AB29E4f4766fbE7F4364;
        } else if (chainId == 97) {
            comptroller = 0x94d1820b2D1c7c7452A163983Dc888CEC546b77D;
            m[0] = 0xb7526572FFE56AB9D7489838Bf2E18e3323b441A;
            m[1] = 0xD5C4C2e2facBEB59D0216D0595d63FcDc6F9A1a7;
            m[2] = 0xF06e662a00796c122AaAE935EC4F0Be3F74f5636;
            npm = 0x427bF5b37357632377eCbEC9de3626C71A5396c1;
        } else {
            revert("unsupported chain");
        }
    }
}
