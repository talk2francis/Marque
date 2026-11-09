// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {FactoryBase} from "../base/FactoryBase.sol";
import {CharterBase} from "../base/CharterBase.sol";
import {IVTokenSupply, IComptrollerSupply} from "../base/VenusSupply.sol";
import {YieldSweep} from "./YieldSweep.sol";

/// @title YieldSweepFactory
/// @notice Creates Yield Sweeps owned by the caller on the reviewed Venus Core stablecoin markets of one chain.
contract YieldSweepFactory is FactoryBase {
    IComptrollerSupply public immutable comptroller;
    mapping(address => bool) public supported;
    address[] internal _markets;

    struct Create {
        YieldSweep.Params p;
        uint64 expiresAt;
        uint256 tipPerAction;
        uint256 tipBudget;
    }

    event Created(address indexed owner, address indexed charter, address indexed vToken, bytes32 salt, Create params);

    error UnsupportedMarket(address vToken);
    error WrongComptroller(address vToken);
    error BadBand();
    error BadCap();

    constructor(IComptrollerSupply comptroller_, address[] memory markets_) {
        comptroller = comptroller_;
        for (uint256 i; i < markets_.length; ++i) {
            if (IVTokenSupply(markets_[i]).comptroller() != address(comptroller_)) revert WrongComptroller(markets_[i]);
            IVTokenSupply(markets_[i]).underlying();
            supported[markets_[i]] = true;
            _markets.push(markets_[i]);
        }
    }

    function create(Create calldata a, bytes32 userSalt) external returns (address charter) {
        (CharterBase.Common memory c, address token) = _validate(a);
        bytes32 salt = keccak256(abi.encode(msg.sender, userSalt));
        charter = address(new YieldSweep{salt: salt}(c, comptroller, a.p, token));
        _record(charter);
        emit Created(msg.sender, charter, a.p.vToken, salt, a);
    }

    function predict(address owner, Create calldata a, bytes32 userSalt) external view returns (address) {
        address token = IVTokenSupply(a.p.vToken).underlying();
        CharterBase.Common memory c =
            CharterBase.Common(owner, a.expiresAt, token, a.tipPerAction, a.tipBudget, new address[](0));
        bytes32 h = keccak256(abi.encodePacked(type(YieldSweep).creationCode, abi.encode(c, comptroller, a.p, token)));
        bytes32 salt = keccak256(abi.encode(owner, userSalt));
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, h)))));
    }

    /// vToken allowance that covers every vToken this charter can ever mint, at today's exchange rate (the rate only
    /// rises, so later supplies mint fewer vTokens). The UI approves exactly this.
    function vTokenAllowanceFor(address vToken, uint256 supplyCap) external view returns (uint256) {
        uint256 rate = IVTokenSupply(vToken).exchangeRateStored();
        return (supplyCap * 1e18 + rate - 1) / rate + 1;
    }

    function markets() external view returns (address[] memory) {
        return _markets;
    }

    function _validate(Create calldata a) internal view returns (CharterBase.Common memory c, address token) {
        YieldSweep.Params calldata p = a.p;
        if (!supported[p.vToken]) revert UnsupportedMarket(p.vToken);
        if (p.minAction == 0 || p.ceiling < p.floor + 2 * p.minAction) revert BadBand();
        if (p.supplyCap < p.minAction) revert BadCap();
        if (p.minHealthAfter != 0 && p.minHealthAfter < 1.1e18) revert BadBand();
        token = IVTokenSupply(p.vToken).underlying();
        c = _common(a.expiresAt, token, a.tipPerAction, a.tipBudget, new address[](0), true, token, token);
    }
}
