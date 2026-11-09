// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IComptroller, IVToken, IPriceOracle} from "./VenusInterfaces.sol";
import {HealthMath} from "./HealthMath.sol";
import {LoanGuard} from "./LoanGuard.sol";
import {CharterRules} from "./CharterRules.sol";

/// @title CharterFactory
/// @notice Deploys Loan Guards for the caller, and only for the caller. One factory per chain,
/// bound at deployment to one Venus Core comptroller and a fixed list of supported debt markets
/// taken from the reviewed chain manifest (on BSC and BSC testnet, only the comptroller and markets
/// in CharterRules are accepted; every guard checks the same rules again itself). No owner, no admin, no pause, no upgrade: a new market
/// or rule means a new factory version, announced and verified like this one.
contract CharterFactory {
    uint256 public constant VERSION = 1;

    uint256 public constant MIN_TRIGGER = CharterRules.MIN_TRIGGER;
    uint256 public constant MAX_TRIGGER = CharterRules.MAX_TRIGGER;
    uint256 public constant MIN_GAP = CharterRules.MIN_GAP; // target must sit at least this far above trigger
    uint256 public constant MAX_TARGET = CharterRules.MAX_TARGET;
    uint64 public constant MIN_DURATION = CharterRules.MIN_DURATION;
    uint64 public constant MAX_DURATION = CharterRules.MAX_DURATION;
    uint256 public constant TIP_DIVISOR = CharterRules.TIP_DIVISOR; // a tip is at most a tenth of the budget

    IComptroller public immutable comptroller;
    uint256 public immutable chainId;

    mapping(address => bool) public supported; // vToken => supported debt market
    address[] internal _markets;
    mapping(address => bool) public isGuard;
    uint256 public guards;

    struct Params {
        address vDebt;
        uint256 trigger;
        uint256 target;
        uint256 budget;
        uint256 tip;
        uint64 expiresAt;
    }

    event GuardCreated(
        address indexed owner,
        address indexed guard,
        address indexed vDebt,
        address token,
        uint256 trigger,
        uint256 target,
        uint256 budget,
        uint256 tip,
        uint64 expiresAt,
        bytes32 salt
    );

    error UnsupportedMarket(address vDebt);
    error BadTrigger();
    error BadTarget();
    error BadBudget();
    error BadTip();
    error BadExpiry();
    error WrongComptroller(address vDebt);
    error EmptyMarkets();
    error DuplicateMarket(address vDebt);

    constructor(IComptroller comptroller_, address[] memory markets_) {
        if (markets_.length == 0) revert EmptyMarkets();
        address canonical = CharterRules.comptrollerFor(block.chainid);
        if (canonical != address(0) && address(comptroller_) != canonical) {
            revert WrongComptroller(address(comptroller_));
        }
        comptroller = comptroller_;
        chainId = block.chainid;
        for (uint256 i; i < markets_.length; ++i) {
            if (supported[markets_[i]]) revert DuplicateMarket(markets_[i]);
            if (canonical != address(0) && !CharterRules.reviewedMarket(block.chainid, markets_[i])) {
                revert UnsupportedMarket(markets_[i]);
            }
            if (IVToken(markets_[i]).comptroller() != address(comptroller_)) {
                revert WrongComptroller(markets_[i]);
            }
            IVToken(markets_[i]).underlying(); // reverts for the native market, which v1 does not support
            supported[markets_[i]] = true;
            _markets.push(markets_[i]);
        }
    }

    /// @notice Create a Loan Guard owned by msg.sender. `userSalt` is any random value chosen by the
    /// owner's app, so the address can be predicted (and approved) before the guard exists.
    function create(Params calldata p, bytes32 userSalt) external returns (address guard) {
        address token = _validate(p);
        bytes32 salt = keccak256(abi.encode(msg.sender, userSalt));
        guard = address(
            new LoanGuard{salt: salt}(
                msg.sender,
                comptroller,
                IVToken(p.vDebt),
                token,
                p.trigger,
                p.target,
                p.budget,
                p.tip,
                p.expiresAt
            )
        );
        isGuard[guard] = true;
        guards += 1;
        emit GuardCreated(
            msg.sender, guard, p.vDebt, token, p.trigger, p.target, p.budget, p.tip, p.expiresAt, salt
        );
    }

    /// @notice The address create(p, userSalt) will deploy to when called by `owner`.
    function predict(address owner, Params calldata p, bytes32 userSalt) external view returns (address) {
        address token = IVToken(p.vDebt).underlying();
        bytes32 initHash = keccak256(
            abi.encodePacked(
                type(LoanGuard).creationCode,
                abi.encode(
                    owner,
                    comptroller,
                    IVToken(p.vDebt),
                    token,
                    p.trigger,
                    p.target,
                    p.budget,
                    p.tip,
                    p.expiresAt
                )
            )
        );
        bytes32 salt = keccak256(abi.encode(owner, userSalt));
        return
            address(
                uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, initHash))))
            );
    }

    /// @notice Loan health for any account, by the same math every guard uses. 1e18 = 1.00.
    function healthOf(address account)
        external
        view
        returns (uint256 health, uint256 collateralUsd, uint256 debtUsd)
    {
        HealthMath.Health memory h = HealthMath.read(comptroller, account);
        return (h.hf, h.collateralUsd, h.debtUsd);
    }

    /// @notice Debt-token units `account` would need to repay in `vDebt` to reach `targetHealth` now.
    function quote(address account, address vDebt, uint256 targetHealth) external view returns (uint256) {
        if (!supported[vDebt]) revert UnsupportedMarket(vDebt);
        if (targetHealth == 0) revert BadTarget();
        HealthMath.Health memory h = HealthMath.read(comptroller, account);
        uint256 price = IPriceOracle(comptroller.oracle()).getUnderlyingPrice(vDebt);
        if (price == 0) revert HealthMath.PriceUnavailable(vDebt);
        return HealthMath.repayToTarget(h, targetHealth, price);
    }

    function markets() external view returns (address[] memory) {
        return _markets;
    }

    function _validate(Params calldata p) internal view returns (address token) {
        if (!supported[p.vDebt]) revert UnsupportedMarket(p.vDebt);
        CharterRules.checkBounds(p.trigger, p.target, p.budget, p.tip, p.expiresAt, block.timestamp);
        token = IVToken(p.vDebt).underlying();
    }
}
