// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {MockERC20, MockComptroller} from "./VenusMocks.sol";

/// Supply-side Venus test doubles: 8-decimal vTokens, a rising exchange rate scaled 1e(18 - 8 + underlying decimals),
/// mintBehalf, redeem with Venus's "math error" revert on insufficient cash, an optional redeem fee, supply caps and
/// market membership. Fork tests against the real markets on 56 and 97 are mandatory before deployment.
contract MockSupplyComptroller is MockComptroller {
    mapping(address => uint256) public supplyCaps;
    mapping(address => mapping(address => bool)) internal _member;

    constructor(address o) MockComptroller(o) {}

    function setSupplyCap(address v, uint256 cap) external {
        supplyCaps[v] = cap;
    }

    function setMember(address account, address v, bool m) external {
        _member[account][v] = m;
    }

    function checkMembership(address account, address v) external view returns (bool) {
        return _member[account][v];
    }
}

contract MockVTokenSupply {
    string public symbol = "vTOKEN";
    uint8 public constant decimals = 8;
    address public underlying;
    address public comptroller;
    uint256 public totalSupply;
    uint256 public rate; // underlying per vToken, scaled 1e18 * 10^(udec - 8)
    uint256 public accruePerCall; // added to rate on exchangeRateCurrent()
    uint256 public redeemFeeBps;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(address u, address c, uint256 rate_) {
        underlying = u;
        comptroller = c;
        rate = rate_;
    }

    function setAccrue(uint256 a) external {
        accruePerCall = a;
    }

    function setRedeemFee(uint256 bps) external {
        redeemFeeBps = bps;
    }

    /// Simulates borrowers drawing cash out of the market.
    function lend(address to, uint256 amount) external {
        MockERC20(underlying).transfer(to, amount);
    }

    function exchangeRateStored() external view returns (uint256) {
        return rate;
    }

    function exchangeRateCurrent() external returns (uint256) {
        rate += accruePerCall;
        return rate;
    }

    function getCash() public view returns (uint256) {
        return MockERC20(underlying).balanceOf(address(this));
    }

    function approve(address s, uint256 a) external returns (bool) {
        allowance[msg.sender][s] = a;
        return true;
    }

    function transfer(address to, uint256 a) external returns (bool) {
        balanceOf[msg.sender] -= a;
        balanceOf[to] += a;
        return true;
    }

    function transferFrom(address f, address to, uint256 a) external returns (bool) {
        allowance[f][msg.sender] -= a;
        balanceOf[f] -= a;
        balanceOf[to] += a;
        return true;
    }

    function mintBehalf(address receiver, uint256 amount) external returns (uint256) {
        uint256 cap = MockSupplyComptroller(comptroller).supplyCaps(address(this));
        require(cap != 0, "market supply cap is 0");
        require(totalSupply * rate / 1e18 + amount <= cap, "market supply cap reached");
        MockERC20(underlying).transferFrom(msg.sender, address(this), amount);
        uint256 v = amount * 1e18 / rate;
        balanceOf[receiver] += v;
        totalSupply += v;
        return 0;
    }

    function redeem(uint256 v) external returns (uint256) {
        uint256 amount = v * rate / 1e18;
        if (getCash() < amount) revert("math error");
        balanceOf[msg.sender] -= v;
        totalSupply -= v;
        uint256 fee = amount * redeemFeeBps / 10_000;
        if (fee != 0) MockERC20(underlying).transfer(address(0xFEE), fee);
        MockERC20(underlying).transfer(msg.sender, amount - fee);
        return 0;
    }

    /// The owner's own deposit, outside any charter.
    function mintFor(address who, uint256 amount) external {
        MockERC20(underlying).transferFrom(msg.sender, address(this), amount);
        uint256 v = amount * 1e18 / rate;
        balanceOf[who] += v;
        totalSupply += v;
    }

    function redeemAs(address who, uint256 v) external {
        uint256 amount = v * rate / 1e18;
        balanceOf[who] -= v;
        totalSupply -= v;
        MockERC20(underlying).transfer(who, amount);
    }
}
