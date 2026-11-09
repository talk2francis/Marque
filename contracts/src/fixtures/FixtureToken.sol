// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// BSC TESTNET FIXTURE ONLY. A plain 18-decimal token with a public faucet, used to build Marque's labelled test
/// pool for Grid Band and Range Keeper on chain 97, where real testnet AMM liquidity is too thin. It refuses to be
/// deployed on any other chain. Every page that shows a pool made from it says it is a testnet fixture.
contract FixtureToken {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    uint256 public constant FAUCET_MAX = 100_000e18;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory name_, string memory symbol_) {
        require(block.chainid == 97, "testnet fixture only");
        name = name_;
        symbol = symbol_;
    }

    /// Anyone on testnet can take up to FAUCET_MAX per call.
    function faucet(address to, uint256 amount) external {
        require(amount <= FAUCET_MAX, "faucet max");
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _move(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        if (a != type(uint256).max) {
            require(a >= amount, "allowance");
            allowance[from][msg.sender] = a - amount;
        }
        _move(from, to, amount);
        return true;
    }

    function _move(address from, address to, uint256 amount) internal {
        require(balanceOf[from] >= amount, "balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}
