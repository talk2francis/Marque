// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {FactoryBase} from "../base/FactoryBase.sol";
import {CharterBase} from "../base/CharterBase.sol";
import {IPancakeV3Pool, IPancakeV3Factory} from "../base/PancakeInterfaces.sol";
import {PoolOracle} from "../lib/PoolOracle.sol";
import {TickMathLite} from "../lib/TickMathLite.sol";
import {GridBand} from "./GridBand.sol";

/// @title GridBandFactory
/// @notice Creates Grid Bands owned by the caller on reviewed PancakeSwap v3 pools of one chain, and enforces the
/// grid's economic boundary at creation: step wide enough that a round trip at the worst allowed prices does not lose
/// quote, a real TWAP available, and slots above the price either funded with base or absent.
contract GridBandFactory is FactoryBase {
    uint8 public constant MAX_SLOTS = 40;
    uint24 public constant MAX_SLIP_TICKS = 300;
    uint32 public constant MIN_WINDOW = 60;
    uint32 public constant MAX_WINDOW = 3600;

    IPancakeV3Factory public immutable pcsFactory;
    mapping(address => bool) public supported;
    address[] internal _pools;

    struct Create {
        GridBand.Params p;
        uint64 expiresAt;
        address tipToken;
        uint256 tipPerAction;
        uint256 tipBudget;
        address[] executors;
        /// First slot that starts FULL, as the app computed it from the TWAP. The factory recomputes it and reverts on
        /// a mismatch, so the charter's address can be predicted (and approved) before it exists.
        uint8 fullFrom;
    }

    event Created(address indexed owner, address indexed charter, address indexed pool, bytes32 salt, Create params, int24 creationTwap, uint8 fullFrom);

    error UnsupportedPool(address pool);
    error BadToken();
    error BadGrid(uint8 reason);

    constructor(IPancakeV3Factory pcsFactory_, address[] memory pools_) {
        pcsFactory = pcsFactory_;
        for (uint256 i; i < pools_.length; ++i) {
            IPancakeV3Pool pl = IPancakeV3Pool(pools_[i]);
            if (pcsFactory_.getPool(pl.token0(), pl.token1(), pl.fee()) != pools_[i]) revert UnsupportedPool(pools_[i]);
            supported[pools_[i]] = true;
            _pools.push(pools_[i]);
        }
    }

    function create(Create calldata a, bytes32 userSalt) external returns (address charter) {
        (address quote, bool baseIsToken0, int24 twap, uint8 fullFrom) = _grid(a.p);
        if (fullFrom != a.fullFrom) revert BadGrid(10);
        CharterBase.Common memory c = _commonFor(a);
        bytes32 salt = keccak256(abi.encode(msg.sender, userSalt));
        charter = address(new GridBand{salt: salt}(c, a.p, quote, baseIsToken0, fullFrom));
        _record(charter);
        emit Created(msg.sender, charter, a.p.pool, salt, a, twap, fullFrom);
    }

    /// The address create(a, userSalt) will deploy to for `owner`, given a.fullFrom.
    function predict(address owner, Create calldata a, bytes32 userSalt) external view returns (address) {
        IPancakeV3Pool pl = IPancakeV3Pool(a.p.pool);
        bool b0 = a.p.base == pl.token0();
        address quote = b0 ? pl.token1() : pl.token0();
        CharterBase.Common memory c = _commonFor(a);
        c.owner = owner;
        bytes32 h = keccak256(abi.encodePacked(type(GridBand).creationCode, abi.encode(c, a.p, quote, b0, a.fullFrom)));
        bytes32 salt = keccak256(abi.encode(owner, userSalt));
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, h)))));
    }

    /// The fullFrom the app must pass right now (reads the TWAP).
    function fullFromNow(GridBand.Params calldata p) external view returns (uint8 fullFrom) {
        (,,, fullFrom) = _grid(p);
    }

    /// Smallest step (in ticks) for which a buy and the matching sell, both at their worst allowed price, cannot lose.
    function minStep(address pool, uint24 slipTicks) public view returns (int24) {
        uint24 feeTicks = (IPancakeV3Pool(pool).fee() + 99) / 100;
        return int24(uint24(2 * (uint256(slipTicks) + feeTicks) + 2));
    }

    function pools() external view returns (address[] memory) {
        return _pools;
    }

    function _commonFor(Create calldata a) internal view returns (CharterBase.Common memory) {
        IPancakeV3Pool pl = IPancakeV3Pool(a.p.pool);
        return _common(a.expiresAt, a.tipToken, a.tipPerAction, a.tipBudget, a.executors, false, pl.token0(), pl.token1());
    }

    function _grid(GridBand.Params calldata p)
        internal
        view
        returns (address quote, bool baseIsToken0, int24 twap, uint8 fullFrom)
    {
        if (!supported[p.pool]) revert UnsupportedPool(p.pool);
        IPancakeV3Pool pl = IPancakeV3Pool(p.pool);
        address t0 = pl.token0();
        address t1 = pl.token1();
        if (p.base == t0) {
            quote = t1;
            baseIsToken0 = true;
        } else if (p.base == t1) {
            quote = t0;
        } else {
            revert BadToken();
        }
        if (p.slots == 0 || p.slots > MAX_SLOTS) revert BadGrid(1);
        if (p.slipTicks == 0 || p.slipTicks > MAX_SLIP_TICKS || p.maxDeviation >= p.slipTicks) revert BadGrid(2);
        if (p.stepTicks < minStep(p.pool, p.slipTicks)) revert BadGrid(3);
        if (p.twapWindow < MIN_WINDOW || p.twapWindow > MAX_WINDOW) revert BadGrid(4);
        if (p.minFillBps < 1000 || p.minFillBps > 10_000) revert BadGrid(5);
        if (p.orderQuote == 0 || p.buyCap < p.orderQuote) revert BadGrid(6);
        int256 top = int256(p.lowerBt) + int256(uint256(p.slots)) * p.stepTicks;
        int256 lim = int256(TickMathLite.MAX_TICK) - int256(uint256(p.slipTicks));
        if (top > lim || -int256(p.lowerBt) > lim) revert BadGrid(7);

        twap = PoolOracle.twapTick(pl, p.twapWindow); // reverts when the pool lacks the history
        int256 bt = baseIsToken0 ? int256(twap) : -int256(twap);
        // Slots whose buy level sits above today's price would buy at once: they must start FULL (two-sided) instead.
        fullFrom = p.slots;
        for (uint8 s; s < p.slots; ++s) {
            if (int256(p.lowerBt) + int256(uint256(s)) * p.stepTicks > bt) {
                fullFrom = s;
                break;
            }
        }
        uint256 full = p.slots - fullFrom;
        if (full != 0 && (p.baseOrder == 0 || p.sellCap < full * p.baseOrder)) revert BadGrid(8);
        if (full == 0 && p.baseOrder != 0) revert BadGrid(9);
        if (p.sellCap == 0) revert BadGrid(10); // a grid that can never sell is not a grid
    }
}
