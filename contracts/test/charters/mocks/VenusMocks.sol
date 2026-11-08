// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// Test doubles that follow Venus Core's observable behaviour closely enough for unit tests.
/// Fork tests against the real BSC 56 and 97 deployments are mandatory before any deployment.

contract MockERC20 {
    string public symbol;
    uint8 public immutable decimals;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(string memory s, uint8 d) {
        symbol = s;
        decimals = d;
    }

    function mint(address to, uint256 a) external {
        balanceOf[to] += a;
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

    function transferFrom(address f, address to, uint256 a) external virtual returns (bool) {
        uint256 al = allowance[f][msg.sender];
        if (al != type(uint256).max) allowance[f][msg.sender] = al - a;
        balanceOf[f] -= a;
        balanceOf[to] += a;
        return true;
    }
}

/// USDT-on-Ethereum style: no return values, and refuses non-zero to non-zero approvals.
contract MockQuietERC20 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 a) external {
        balanceOf[to] += a;
    }

    function approve(address s, uint256 a) external {
        require(a == 0 || allowance[msg.sender][s] == 0, "approve race");
        allowance[msg.sender][s] = a;
    }

    function transfer(address to, uint256 a) external {
        balanceOf[msg.sender] -= a;
        balanceOf[to] += a;
    }

    function transferFrom(address f, address to, uint256 a) external {
        allowance[f][msg.sender] -= a;
        balanceOf[f] -= a;
        balanceOf[to] += a;
    }
}

/// Takes a 1% fee on transfer. Must be rejected by the guard's received-amount check.
contract MockFeeERC20 is MockERC20 {
    constructor() MockERC20("FEE", 18) {}

    function transferFrom(address f, address to, uint256 a) external override returns (bool) {
        allowance[f][msg.sender] -= a;
        balanceOf[f] -= a;
        balanceOf[to] += a - a / 100;
        return true;
    }
}

interface IMockToken {
    function transferFrom(address, address, uint256) external;
}

contract MockOracle {
    mapping(address => uint256) public getUnderlyingPrice;

    function set(address vToken, uint256 p) external {
        getUnderlyingPrice[vToken] = p;
    }
}

contract MockVAI {
    mapping(address => uint256) public getVAIRepayAmount;

    function set(address a, uint256 v) external {
        getVAIRepayAmount[a] = v;
    }
}

contract MockComptroller {
    address public oracle;
    address public vaiController;
    uint256 public liquidityErr;
    mapping(address => address[]) internal _assets;
    /// Liquidation-weighted collateral in USD (1e18), set directly per account.
    mapping(address => uint256) public weighted;

    constructor(address o) {
        oracle = o;
    }

    function setVai(address v) external {
        vaiController = v;
    }

    function setErr(uint256 e) external {
        liquidityErr = e;
    }

    function setAssets(address a, address[] calldata list) external {
        _assets[a] = list;
    }

    function setWeighted(address a, uint256 usd) external {
        weighted[a] = usd;
    }

    function getAssetsIn(address a) external view returns (address[] memory) {
        return _assets[a];
    }

    function getAccountLiquidity(address a) external view returns (uint256, uint256, uint256) {
        if (liquidityErr != 0) return (liquidityErr, 0, 0);
        uint256 debt;
        address[] memory list = _assets[a];
        for (uint256 i; i < list.length; ++i) {
            (,, uint256 b,) = MockVToken(list[i]).getAccountSnapshot(a);
            debt += MockOracle(oracle).getUnderlyingPrice(list[i]) * b / 1e18;
        }
        if (vaiController != address(0)) debt += MockVAI(vaiController).getVAIRepayAmount(a);
        uint256 c = weighted[a];
        if (c >= debt) return (0, c - debt, 0);
        return (0, 0, debt - c);
    }
}

contract MockVToken {
    address public underlying;
    address public comptroller;
    mapping(address => uint256) public borrows;
    uint256 public accrueErr;
    uint256 public repayErr;
    /// Interest added to `accrueFor` on the next accrueInterest(), once.
    address public accrueFor;
    uint256 public accrueAmount;
    /// Misbehaviour switches for negative tests.
    bool public swallow; // take tokens, do not reduce debt
    address public reenterTarget;

    constructor(address u, address c) {
        underlying = u;
        comptroller = c;
    }

    function setBorrow(address a, uint256 v) external {
        borrows[a] = v;
    }

    function setErrors(uint256 a, uint256 r) external {
        accrueErr = a;
        repayErr = r;
    }

    function setAccrue(address a, uint256 v) external {
        accrueFor = a;
        accrueAmount = v;
    }

    function setSwallow(bool s) external {
        swallow = s;
    }

    function setReenter(address t) external {
        reenterTarget = t;
    }

    function accrueInterest() external returns (uint256) {
        if (accrueErr != 0) return accrueErr;
        if (accrueAmount != 0) {
            borrows[accrueFor] += accrueAmount;
            accrueAmount = 0;
        }
        return 0;
    }

    function borrowBalanceStored(address a) external view returns (uint256) {
        return borrows[a];
    }

    function getAccountSnapshot(address a) external view returns (uint256, uint256, uint256, uint256) {
        return (0, 0, borrows[a], 1e18);
    }

    function repayBorrowBehalf(address borrower, uint256 amount) external returns (uint256) {
        if (repayErr != 0) return repayErr;
        if (reenterTarget != address(0)) {
            (bool ok, bytes memory ret) = reenterTarget.call(abi.encodeWithSignature("act()"));
            if (!ok) {
                assembly {
                    revert(add(ret, 32), mload(ret))
                }
            }
        }
        IMockToken(underlying).transferFrom(msg.sender, address(this), amount);
        if (!swallow) borrows[borrower] -= amount;
        return 0;
    }
}
