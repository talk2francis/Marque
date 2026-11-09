// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {FactoryBase} from "../base/FactoryBase.sol";
import {CharterBase} from "../base/CharterBase.sol";
import {IPancakeV3Pool, IPancakeV3Factory, INonfungiblePositionManager} from "../base/PancakeInterfaces.sol";
import {PoolOracle} from "../lib/PoolOracle.sol";
import {RangeKeeper} from "./RangeKeeper.sol";
import {Blueprint} from "../lib/Blueprint.sol";

/// @title RangeKeeperFactory
/// @notice Grant a Range Keeper in one transaction: the owner sends their PancakeSwap v3 position NFT to this
/// factory with safeTransferFrom(owner, factory, tokenId, abi.encode(Create)). The factory checks the position and
/// the rules, creates the keeper owned by the sender, and forwards the NFT to it, all in that one transaction. If any
/// check fails, the whole transfer reverts and nothing moves.
contract RangeKeeperFactory is FactoryBase {
    uint24 public constant MAX_SLIP_TICKS = 500;
    uint16 public constant MAX_LOSS_BPS = 500;
    uint32 public constant MIN_INTERVAL = 10 minutes;
    uint32 public constant MIN_WINDOW = 300;
    uint32 public constant MAX_WINDOW = 7200;

    INonfungiblePositionManager public immutable npm;
    IPancakeV3Factory public immutable pcsFactory;
    /// Holds RangeKeeper's creation code (0xFE-prefixed); too large to embed here. keccak256 of its code is
    /// recorded so anyone can compare it with the verified RangeKeeper source.
    address public immutable blueprint;
    bytes32 public immutable blueprintCodeHash;
    mapping(address => bool) public supported;
    address[] internal _pools;

    struct Create {
        RangeKeeper.Params p;
        uint64 expiresAt;
        address tipToken;
        uint256 tipPerAction;
        uint256 tipBudget;
        address[] executors;
        bytes32 userSalt;
    }

    struct Pos {
        address t0;
        address t1;
        uint24 fee;
        int24 lower;
        int24 upper;
        uint128 liquidity;
    }

    event Created(address indexed owner, address indexed charter, uint256 indexed tokenId, address pool, bytes32 salt, Create params);

    error NotPositionManager();
    error NotOwnerOperator();
    error UnsupportedPool(address pool);
    error PositionMismatch();
    error BadParams(uint8 reason);

    constructor(INonfungiblePositionManager npm_, address blueprint_, address[] memory pools_) {
        npm = npm_;
        blueprint = blueprint_;
        blueprintCodeHash = keccak256(blueprint_.code);
        Blueprint.creationCode(blueprint_);
        pcsFactory = IPancakeV3Factory(npm_.factory());
        for (uint256 i; i < pools_.length; ++i) {
            IPancakeV3Pool pl = IPancakeV3Pool(pools_[i]);
            if (pcsFactory.getPool(pl.token0(), pl.token1(), pl.fee()) != pools_[i]) revert UnsupportedPool(pools_[i]);
            supported[pools_[i]] = true;
            _pools.push(pools_[i]);
        }
    }

    function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata data)
        external
        returns (bytes4)
    {
        if (msg.sender != address(npm)) revert NotPositionManager();
        if (operator != from) revert NotOwnerOperator(); // only the owner may grant a charter over their position
        Create memory a = abi.decode(data, (Create));
        Pos memory pos = _position(tokenId, a.p.pool);
        _checkParams(a.p);
        PoolOracle.twapTick(IPancakeV3Pool(a.p.pool), a.p.twapWindow); // reverts when the pool lacks history
        address k = _deploy(from, tokenId, a, pos);
        _record(k);
        npm.safeTransferFrom(address(this), k, tokenId);
        emit Created(from, k, tokenId, a.p.pool, keccak256(abi.encode(from, a.userSalt)), a);
        return this.onERC721Received.selector;
    }

    function _deploy(address from, uint256 tokenId, Create memory a, Pos memory pos) internal returns (address) {
        CharterBase.Common memory c =
            _commonFrom(from, a.expiresAt, a.tipToken, a.tipPerAction, a.tipBudget, a.executors, pos.t0, pos.t1);
        int24 sp = IPancakeV3Pool(a.p.pool).tickSpacing();
        bytes memory args = abi.encode(c, a.p, npm, pos.t0, pos.t1, pos.fee, sp, pos.upper - pos.lower, tokenId);
        return Blueprint.deploy(blueprint, args, keccak256(abi.encode(from, a.userSalt)));
    }

    function pools() external view returns (address[] memory) {
        return _pools;
    }

    function _position(uint256 tokenId, address pool) internal view returns (Pos memory pos) {
        if (!supported[pool]) revert UnsupportedPool(pool);
        (,, pos.t0, pos.t1, pos.fee, pos.lower, pos.upper, pos.liquidity,,,,) = npm.positions(tokenId);
        IPancakeV3Pool pl = IPancakeV3Pool(pool);
        if (pos.t0 != pl.token0() || pos.t1 != pl.token1() || pos.fee != pl.fee() || pos.liquidity == 0) {
            revert PositionMismatch();
        }
    }

    function _checkParams(RangeKeeper.Params memory p) internal pure {
        if (p.mode > 1) revert BadParams(1);
        if (p.twapWindow < MIN_WINDOW || p.twapWindow > MAX_WINDOW) revert BadParams(2);
        if (p.slipTicks == 0 || p.slipTicks > MAX_SLIP_TICKS || p.maxDeviation >= p.slipTicks) revert BadParams(3);
        if (p.bufferTicks < 0) revert BadParams(4);
        if (p.maxLossBps == 0 || p.maxLossBps > MAX_LOSS_BPS) revert BadParams(5);
        if (p.maxLeftoverBps == 0 || p.maxLeftoverBps > 2000) revert BadParams(6);
        if (p.minInterval < MIN_INTERVAL) revert BadParams(7);
        if (p.mode == 0 && (p.maxRebalances == 0 || p.maxRebalances > 200)) revert BadParams(8);
    }

    /// Same rules as FactoryBase._common, for an owner who is the NFT's sender rather than msg.sender.
    function _commonFrom(
        address owner,
        uint64 expiresAt,
        address tipToken,
        uint256 tipPerAction,
        uint256 tipBudget,
        address[] memory executors,
        address t0,
        address t1
    ) internal view returns (CharterBase.Common memory c) {
        c = _common(expiresAt, tipToken, tipPerAction, tipBudget, executors, false, t0, t1);
        c.owner = owner;
    }
}
