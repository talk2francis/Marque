// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Venus Core supply-side calls used by Yield Sweep. Checked against venus-protocol/contracts
/// (VBep20.mintBehalf, VToken.redeem, transferFrom, exchangeRateCurrent/Stored, getCash; MarketFacet.checkMembership;
/// comptroller storage supplyCaps) on 9 Nov 2026. redeemBehalf is deliberately not used: it needs
/// comptroller.updateDelegate, which would also let the delegate borrow on the owner's behalf.
interface IVTokenSupply {
    function underlying() external view returns (address);
    function comptroller() external view returns (address);
    function decimals() external view returns (uint8);
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
    function transferFrom(address src, address dst, uint256 amount) external returns (bool);
    function mintBehalf(address receiver, uint256 mintAmount) external returns (uint256);
    function redeem(uint256 redeemTokens) external returns (uint256);
    function exchangeRateCurrent() external returns (uint256);
    function exchangeRateStored() external view returns (uint256);
    function getCash() external view returns (uint256);
}

interface IComptrollerSupply {
    function checkMembership(address account, address vToken) external view returns (bool);
    function supplyCaps(address vToken) external view returns (uint256);
}
