// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title CharterRules
/// @notice The rules every Loan Guard enforces on itself, whoever deploys it. CharterFactory checks the same rules
/// first, so a bad request fails with a clear error before any code is deployed; the guard checks them again in its
/// constructor, so a copy deployed outside the factory can only ever repay its owner's own loan in one of the
/// reviewed Venus Core markets, within the same bounds.
///
/// The comptroller and the debt markets are fixed per chain, from the reviewed manifests (read from chain on
/// 8 Nov 2026). On any other chain a guard cannot be deployed at all, except the local test chain (31337), where
/// the test suites supply their own Venus and the comptroller's own listing is checked instead.
library CharterRules {
    uint256 internal constant MIN_TRIGGER = 1.02e18;
    uint256 internal constant MAX_TRIGGER = 10e18;
    uint256 internal constant MIN_GAP = 0.05e18; // target must sit at least this far above trigger
    uint256 internal constant MAX_TARGET = 20e18;
    uint64 internal constant MIN_DURATION = 1 days;
    uint64 internal constant MAX_DURATION = 90 days;
    uint256 internal constant TIP_DIVISOR = 10; // a tip is at most a tenth of the budget

    uint256 internal constant LOCAL_CHAIN = 31337;

    error UnsupportedChain(uint256 chainId);
    error WrongComptroller(address comptroller);
    error UnsupportedMarket(address vDebt);
    error WrongToken(address token);
    error BadTrigger();
    error BadTarget();
    error BadBudget();
    error BadTip();
    error BadExpiry();

    /// @notice The Venus Core comptroller (Diamond) for a chain; zero on the local test chain.
    function comptrollerFor(uint256 chainId) internal pure returns (address) {
        if (chainId == 56) return 0xfD36E2c2a6789Db23113685031d7F16329158384;
        if (chainId == 97) return 0x94d1820b2D1c7c7452A163983Dc888CEC546b77D;
        if (chainId == LOCAL_CHAIN) return address(0);
        revert UnsupportedChain(chainId);
    }

    /// @notice Whether `vDebt` is one of the reviewed debt markets for a chain (USDT, USDC, FDUSD on Venus Core).
    function reviewedMarket(uint256 chainId, address vDebt) internal pure returns (bool) {
        if (chainId == 56) {
            return vDebt == 0xfD5840Cd36d94D7229439859C0112a4185BC0255 // vUSDT
                || vDebt == 0xecA88125a5ADbe82614ffC12D0DB554E2e2867C8 // vUSDC
                || vDebt == 0xC4eF4229FEc74Ccfe17B2bdeF7715fAC740BA0ba; // vFDUSD
        }
        if (chainId == 97) {
            return vDebt == 0xb7526572FFE56AB9D7489838Bf2E18e3323b441A // vUSDT
                || vDebt == 0xD5C4C2e2facBEB59D0216D0595d63FcDc6F9A1a7 // vUSDC
                || vDebt == 0xF06e662a00796c122AaAE935EC4F0Be3F74f5636; // vFDUSD
        }
        return false;
    }

    /// @notice The numeric bounds on a charter, checked at `nowTs`.
    function checkBounds(
        uint256 trigger,
        uint256 target,
        uint256 budget,
        uint256 tip,
        uint64 expiresAt,
        uint256 nowTs
    ) internal pure {
        if (trigger < MIN_TRIGGER || trigger > MAX_TRIGGER) revert BadTrigger();
        if (target < trigger + MIN_GAP || target > MAX_TARGET) revert BadTarget();
        if (budget == 0) revert BadBudget();
        if (tip > budget / TIP_DIVISOR) revert BadTip();
        if (expiresAt < nowTs + MIN_DURATION || expiresAt > nowTs + MAX_DURATION) revert BadExpiry();
    }
}
