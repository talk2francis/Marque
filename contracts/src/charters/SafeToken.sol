// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Minimal safe ERC-20 calls that also accept tokens which return nothing (USDT-style).
library SafeToken {
    error TokenCallFailed(address token, bytes4 selector);

    function safeTransferFrom(address token, address from, address to, uint256 amount) internal {
        _call(token, abi.encodeWithSelector(0x23b872dd, from, to, amount));
    }

    function safeTransfer(address token, address to, uint256 amount) internal {
        _call(token, abi.encodeWithSelector(0xa9059cbb, to, amount));
    }

    /// @dev Sets the allowance to exactly `amount`, clearing to zero first so tokens that refuse
    /// a non-zero to non-zero change still work.
    function forceApprove(address token, address spender, uint256 amount) internal {
        _call(token, abi.encodeWithSelector(0x095ea7b3, spender, 0));
        if (amount != 0) _call(token, abi.encodeWithSelector(0x095ea7b3, spender, amount));
    }

    function _call(address token, bytes memory data) private {
        if (token.code.length == 0) revert TokenCallFailed(token, bytes4(data));
        (bool ok, bytes memory ret) = token.call(data);
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) {
            revert TokenCallFailed(token, bytes4(data));
        }
    }
}
