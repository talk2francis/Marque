// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IPancakeV3Pool, IPancakeV3Factory, INonfungiblePositionManager} from "../../../src/charters/base/PancakeInterfaces.sol";
import {TickMathLite} from "../../../src/charters/lib/TickMathLite.sol";
import {MockERC20} from "../mocks/VenusMocks.sol";

interface IPoolDeployer {
    function setFactoryAddress(address) external;
}

interface IPcsFactoryFull is IPancakeV3Factory {
    function createPool(address a, address b, uint24 fee) external returns (address);
}

interface IPoolFull is IPancakeV3Pool {
    function initialize(uint160 sqrtPriceX96) external;
    function increaseObservationCardinalityNext(uint16 n) external;
}

/// Moves a pool's price to an exact tick (exact input, stopped by the price limit) and pays from its own balance.
contract Swapper {
    function swapTo(IPancakeV3Pool pool, int24 target) external {
        (uint160 p,,,,,,) = pool.slot0();
        uint160 limit = TickMathLite.getSqrtRatioAtTick(target);
        if (limit == p) return;
        bool zeroForOne = limit < p;
        pool.swap(address(this), zeroForOne, int256(uint256(type(uint128).max)), limit, "");
    }

    function swapExact(IPancakeV3Pool pool, bool zeroForOne, uint256 amountIn) external {
        uint160 limit = zeroForOne ? TickMathLite.MIN_SQRT_RATIO + 1 : TickMathLite.MAX_SQRT_RATIO - 1;
        pool.swap(address(this), zeroForOne, int256(amountIn), limit, "");
    }

    function pancakeV3SwapCallback(int256 d0, int256 d1, bytes calldata) external {
        IPancakeV3Pool pool = IPancakeV3Pool(msg.sender);
        if (d0 > 0) MockERC20(pool.token0()).transfer(msg.sender, uint256(d0));
        if (d1 > 0) MockERC20(pool.token1()).transfer(msg.sender, uint256(d1));
    }
}

/// Real PancakeSwap v3 core and NonfungiblePositionManager bytecode (compiled from pancake-v3-contracts with solc
/// 0.7.6; the pool init code hash matches the deployed one, 0x6ce8eb47...f7e2), deployed into the test EVM.
abstract contract PcsFixture is Test {
    IPcsFactoryFull internal pcs;
    INonfungiblePositionManager internal npm;
    Swapper internal swapper;
    address internal lp = makeAddr("pcs-lp");

    function _deployPcs() internal {
        address deployer = deployCode("test/fixtures/pcs/PancakeV3PoolDeployer.json");
        pcs = IPcsFactoryFull(deployCode("test/fixtures/pcs/PancakeV3Factory.json", abi.encode(deployer)));
        IPoolDeployer(deployer).setFactoryAddress(address(pcs));
        MockERC20 wbnb = new MockERC20("WBNB", 18);
        npm = INonfungiblePositionManager(
            deployCode(
                "test/fixtures/pcs/NonfungiblePositionManager.json",
                abi.encode(deployer, address(pcs), address(wbnb), address(0))
            )
        );
        swapper = new Swapper();
    }

    /// Creates a fee-500 pool at `tick`, adds deep full-range liquidity from `lp`, and enough observation slots.
    function _pool(MockERC20 a, MockERC20 b, int24 tick, uint256 depth0, uint256 depth1) internal returns (IPoolFull pool) {
        pool = IPoolFull(pcs.createPool(address(a), address(b), 500));
        pool.initialize(TickMathLite.getSqrtRatioAtTick(tick));
        pool.increaseObservationCardinalityNext(200);
        address t0 = pool.token0();
        address t1 = pool.token1();
        MockERC20(t0).mint(lp, depth0);
        MockERC20(t1).mint(lp, depth1);
        MockERC20(t0).mint(address(swapper), 1e36);
        MockERC20(t1).mint(address(swapper), 1e36);
        vm.startPrank(lp);
        MockERC20(t0).approve(address(npm), type(uint256).max);
        MockERC20(t1).approve(address(npm), type(uint256).max);
        npm.mint(
            INonfungiblePositionManager.MintParams(t0, t1, 500, -887270, 887270, depth0, depth1, 0, 0, lp, block.timestamp)
        );
        vm.stopPrank();
    }

    function _tick(IPancakeV3Pool pool) internal view returns (int24 t) {
        (, t,,,,,) = pool.slot0();
    }

    /// Moves the price and lets `secs` pass (new block), so the TWAP over a window shorter than `secs` is the new tick.
    function _moveAndSettle(IPancakeV3Pool pool, int24 target, uint256 secs) internal {
        swapper.swapTo(pool, target);
        vm.warp(block.timestamp + secs);
        vm.roll(block.number + secs);
    }
}
