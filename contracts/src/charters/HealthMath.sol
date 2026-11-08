// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IComptroller, IVToken, IPriceOracle, IVAIController} from "./VenusInterfaces.sol";

/// @title HealthMath
/// @notice Loan health for a Venus Core account, read the way Venus itself decides liquidation.
///
/// Venus answers one question directly: getAccountLiquidity(account) returns the surplus
/// (liquidity) or deficit (shortfall) of liquidation-weighted collateral over debt, in USD with
/// 18 decimals. It does not return the two sides separately, so this library rebuilds the debt
/// side exactly as ComptrollerLens does on the liquidation path (spot oracle price times the
/// stored borrow balance, truncated, for every entered market, plus VAI repay amount) and
/// recovers the collateral side as debt + liquidity - shortfall. Collateral weights, pools and
/// e-mode are therefore never re-implemented here: whatever Venus counts, the guard counts.
///
///   health = weightedCollateral / debt        (1e18 = 1.00, liquidatable below 1.00)
///   repayUsd to reach target T = debt - weightedCollateral / T
library HealthMath {
    uint256 internal constant WAD = 1e18;
    /// Venus Core sets no per-account market limit (55 markets were listed on BSC on 8 Nov 2026), and only the
    /// owner can enter markets, so this bound only keeps the loop finite; it sits well above the listed count.
    uint256 internal constant MAX_MARKETS = 128;
    uint256 internal constant NO_DEBT = type(uint256).max;

    error VenusError(uint256 code);
    error TooManyMarkets(uint256 count);
    error PriceUnavailable(address vToken);

    struct Health {
        uint256 collateralUsd; // liquidation-weighted, 1e18
        uint256 debtUsd; // 1e18
        uint256 hf; // 1e18, NO_DEBT when debtUsd == 0
    }

    function read(IComptroller comptroller, address account) internal view returns (Health memory h) {
        (uint256 err, uint256 liquidity, uint256 shortfall) = comptroller.getAccountLiquidity(account);
        if (err != 0) revert VenusError(err);

        address[] memory assets = comptroller.getAssetsIn(account);
        if (assets.length > MAX_MARKETS) revert TooManyMarkets(assets.length);
        IPriceOracle oracle = IPriceOracle(comptroller.oracle());

        uint256 debt;
        for (uint256 i; i < assets.length; ++i) {
            (uint256 e,, uint256 borrowed,) = IVToken(assets[i]).getAccountSnapshot(account);
            if (e != 0) revert VenusError(e);
            if (borrowed == 0) continue;
            uint256 price = oracle.getUnderlyingPrice(assets[i]);
            if (price == 0) revert PriceUnavailable(assets[i]);
            debt += price * borrowed / WAD;
        }
        address vai = comptroller.vaiController();
        if (vai != address(0)) debt += IVAIController(vai).getVAIRepayAmount(account);

        h.debtUsd = debt;
        // Rounding between this sum and Venus's own can differ by a few wei; never underflow.
        h.collateralUsd = debt + liquidity > shortfall ? debt + liquidity - shortfall : 0;
        h.hf = debt == 0 ? NO_DEBT : h.collateralUsd * WAD / debt;
    }

    /// @notice Underlying units of the debt market to repay so health returns to `target`.
    /// Rounded up by one unit so the result lands at or above target, never just under it.
    function repayToTarget(Health memory h, uint256 target, uint256 debtPrice) internal pure returns (uint256) {
        if (h.debtUsd == 0) return 0;
        uint256 keep = h.collateralUsd * WAD / target; // debt that health `target` can carry
        if (keep >= h.debtUsd) return 0;
        uint256 usd = h.debtUsd - keep;
        return usd * WAD / debtPrice + 1;
    }
}
