// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title Blueprint
/// @notice Lets a factory create a contract whose creation code is too large to embed in the factory itself.
/// The blueprint is a contract whose runtime code is 0xFE followed by the creation code; 0xFE (INVALID) makes the
/// blueprint impossible to execute. The factory copies the code after the first byte, appends the constructor
/// arguments and deploys it with CREATE2. Anyone can check a blueprint: keccak256(code) is published and the factory
/// stores it. Same idea as ERC-5202.
library Blueprint {
    error BlueprintEmpty();
    error DeployFailed();

    /// Initcode that deploys `creationCode` as a blueprint.
    function initcodeFor(bytes memory code) internal pure returns (bytes memory) {
        uint256 n = code.length + 1;
        return abi.encodePacked(hex"61", uint16(n), hex"3d81600a3d39f3", hex"fe", code);
    }

    function creationCode(address blueprint) internal view returns (bytes memory code) {
        uint256 size = blueprint.code.length;
        if (size < 2) revert BlueprintEmpty();
        code = new bytes(size - 1);
        assembly {
            extcodecopy(blueprint, add(code, 32), 1, sub(size, 1))
        }
    }

    function deploy(address blueprint, bytes memory args, bytes32 salt) internal returns (address addr) {
        bytes memory init = abi.encodePacked(creationCode(blueprint), args);
        assembly {
            addr := create2(0, add(init, 32), mload(init), salt)
        }
        if (addr == address(0)) revert DeployFailed();
    }

    function predict(address deployer, address blueprint, bytes memory args, bytes32 salt) internal view returns (address) {
        bytes32 h = keccak256(abi.encodePacked(creationCode(blueprint), args));
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), deployer, salt, h)))));
    }
}
