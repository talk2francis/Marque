// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IComptroller, IVToken, IPriceOracle} from "../VenusInterfaces.sol";
import {HealthMath} from "../HealthMath.sol";
import {FactoryBase} from "../base/FactoryBase.sol";
import {CharterBase} from "../base/CharterBase.sol";
import {LoanGuardV2} from "./LoanGuardV2.sol";

/// @title LoanGuardFactoryV2
/// @notice Creates Loan Guards (v2) owned by the caller, bound to one Venus Core comptroller and the reviewed
/// stablecoin debt markets. No owner, admin, pause or upgrade.
contract LoanGuardFactoryV2 is FactoryBase {
    uint256 public constant MIN_TRIGGER = 1.02e18;
    uint256 public constant MAX_TRIGGER = 10e18;
    uint256 public constant MIN_GAP = 0.05e18;
    uint256 public constant MAX_TARGET = 20e18;

    IComptroller public immutable comptroller;
    mapping(address => bool) public supported;
    address[] internal _markets;

    struct Create {
        LoanGuardV2.Params p;
        uint64 expiresAt;
        uint256 tipPerAction;
        uint256 tipBudget;
    }

    event Created(address indexed owner, address indexed charter, address indexed vDebt, bytes32 salt, Create params);

    error UnsupportedMarket(address vDebt);
    error WrongComptroller(address vDebt);
    error BadTrigger();
    error BadTarget();
    error BadBudget();

    constructor(IComptroller comptroller_, address[] memory markets_) {
        comptroller = comptroller_;
        for (uint256 i; i < markets_.length; ++i) {
            if (IVToken(markets_[i]).comptroller() != address(comptroller_)) revert WrongComptroller(markets_[i]);
            IVToken(markets_[i]).underlying();
            supported[markets_[i]] = true;
            _markets.push(markets_[i]);
        }
    }

    function create(Create calldata a, bytes32 userSalt) external returns (address charter) {
        (CharterBase.Common memory c, address token) = _validate(a);
        bytes32 salt = keccak256(abi.encode(msg.sender, userSalt));
        charter = address(new LoanGuardV2{salt: salt}(c, comptroller, a.p, token));
        _record(charter);
        emit Created(msg.sender, charter, a.p.vDebt, salt, a);
    }

    function predict(address owner, Create calldata a, bytes32 userSalt) external view returns (address) {
        address token = IVToken(a.p.vDebt).underlying();
        address[] memory none;
        CharterBase.Common memory c = CharterBase.Common(owner, a.expiresAt, token, a.tipPerAction, a.tipBudget, none);
        bytes32 h = keccak256(
            abi.encodePacked(type(LoanGuardV2).creationCode, abi.encode(c, comptroller, a.p, token))
        );
        bytes32 salt = keccak256(abi.encode(owner, userSalt));
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, h)))));
    }

    function healthOf(address account) external view returns (uint256 health, uint256 collateralUsd, uint256 debtUsd) {
        HealthMath.Health memory h = HealthMath.read(comptroller, account);
        return (h.hf, h.collateralUsd, h.debtUsd);
    }

    function quote(address account, address vDebt, uint256 targetHealth) external view returns (uint256) {
        if (!supported[vDebt]) revert UnsupportedMarket(vDebt);
        HealthMath.Health memory h = HealthMath.read(comptroller, account);
        uint256 price = IPriceOracle(comptroller.oracle()).getUnderlyingPrice(vDebt);
        if (price == 0) revert HealthMath.PriceUnavailable(vDebt);
        return HealthMath.repayToTarget(h, targetHealth, price);
    }

    function markets() external view returns (address[] memory) {
        return _markets;
    }

    function _validate(Create calldata a) internal view returns (CharterBase.Common memory c, address token) {
        LoanGuardV2.Params calldata p = a.p;
        if (!supported[p.vDebt]) revert UnsupportedMarket(p.vDebt);
        if (p.trigger < MIN_TRIGGER || p.trigger > MAX_TRIGGER) revert BadTrigger();
        if (p.target < p.trigger + MIN_GAP || p.target > MAX_TARGET) revert BadTarget();
        if (p.budget == 0 || p.minRepay == 0 || p.minRepay > p.budget / 4) revert BadBudget();
        token = IVToken(p.vDebt).underlying();
        c = _common(a.expiresAt, token, a.tipPerAction, a.tipBudget, new address[](0), true, token, token);
    }
}
