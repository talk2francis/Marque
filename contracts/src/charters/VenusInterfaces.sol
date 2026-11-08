// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice The narrow slice of Venus Core that a Loan Guard reads and calls. Nothing else.
/// Signatures checked against venus-protocol/contracts (VBep20, VToken, PolicyFacet, ComptrollerLens).

interface IERC20Min {
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
}

interface IVToken {
    function underlying() external view returns (address);
    function comptroller() external view returns (address);
    function accrueInterest() external returns (uint256);
    function borrowBalanceStored(address account) external view returns (uint256);
    function getAccountSnapshot(address account) external view returns (uint256, uint256, uint256, uint256);
    function repayBorrowBehalf(address borrower, uint256 repayAmount) external returns (uint256);
}

interface IComptroller {
    function getAccountLiquidity(address account) external view returns (uint256, uint256, uint256);
    function getAssetsIn(address account) external view returns (address[] memory);
    function oracle() external view returns (address);
    function vaiController() external view returns (address);
}

interface IPriceOracle {
    function getUnderlyingPrice(address vToken) external view returns (uint256);
}

interface IVAIController {
    function getVAIRepayAmount(address account) external view returns (uint256);
}
