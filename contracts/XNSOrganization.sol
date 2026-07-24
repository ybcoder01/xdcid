// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./XNSRegistry.sol";

contract XNSOrganization is Ownable, ReentrancyGuard {
    uint256 public constant YEAR = 365 days;
    uint256 public constant MAX_YEARS = 10;
    uint256 public constant MAX_BULK_ISSUE = 50;
    uint256 public constant MAX_LABEL_LENGTH = 63;

    struct Organization {
        uint64 paidUntil;
        uint64 generation;
        address controller;
    }

    struct Subname {
        bytes32 parentNode;
        uint64 generation;
        address target;
        bool issued;
    }

    XNSRegistry public immutable registry;
    uint256 public annualFee;

    mapping(bytes32 => Organization) public organizations;
    mapping(bytes32 => mapping(address => uint64)) private _managerGenerations;
    mapping(bytes32 => Subname) private _subnames;

    error InvalidName();
    error InvalidDuration();
    error InvalidTarget();
    error InvalidBulkRequest();
    error WrongPrice();
    error NotParentOwner();
    error NotParentController();
    error InactiveOrganization();
    error WithdrawalFailed();

    event OrganizationSubscribed(
        bytes32 indexed parentNode,
        address indexed owner,
        uint256 paidUntil,
        uint64 generation,
        uint256 amount
    );
    event ManagerUpdated(bytes32 indexed parentNode, address indexed manager, bool approved);
    event SubnameIssued(
        bytes32 indexed parentNode,
        bytes32 indexed subnameNode,
        string name,
        address indexed target
    );
    event SubnameRevoked(bytes32 indexed parentNode, bytes32 indexed subnameNode, string name);
    event AnnualFeeUpdated(uint256 previousFee, uint256 newFee);

    constructor(XNSRegistry registry_, address initialOwner, uint256 initialAnnualFee) Ownable(initialOwner) {
        if (address(registry_) == address(0) || initialOwner == address(0)) revert InvalidTarget();
        registry = registry_;
        annualFee = initialAnnualFee;
    }

    function subscribe(string calldata parentName, uint256 years_) external payable nonReentrant {
        if (years_ == 0 || years_ > MAX_YEARS) revert InvalidDuration();

        bytes32 parentNode = parentNodeFor(parentName);
        if (registry.ownerOf(parentNode) != msg.sender) revert NotParentOwner();

        uint256 cost = annualFee * years_;
        if (msg.value != cost) revert WrongPrice();

        Organization storage organization = organizations[parentNode];
        uint256 base;
        if (organization.controller != msg.sender) {
            organization.controller = msg.sender;
            organization.generation += 1;
            base = block.timestamp;
        } else {
            base = organization.paidUntil > block.timestamp
                ? organization.paidUntil
                : block.timestamp;
        }

        uint256 paidUntil = base + (years_ * YEAR);
        organization.paidUntil = uint64(paidUntil);

        emit OrganizationSubscribed(
            parentNode,
            msg.sender,
            paidUntil,
            organization.generation,
            msg.value
        );
    }

    function setManager(string calldata parentName, address manager, bool approved) external {
        if (manager == address(0)) revert InvalidTarget();

        bytes32 parentNode = parentNodeFor(parentName);
        address parentOwner = registry.ownerOf(parentNode);
        if (parentOwner == address(0) || parentOwner != msg.sender) revert NotParentOwner();
        _requireActive(parentNode);

        _managerGenerations[parentNode][manager] = approved
            ? organizations[parentNode].generation
            : 0;
        emit ManagerUpdated(parentNode, manager, approved);
    }

    function isManager(bytes32 parentNode, address account) public view returns (bool) {
        Organization memory organization = organizations[parentNode];
        return _isActive(parentNode)
            && organization.generation != 0
            && _managerGenerations[parentNode][account] == organization.generation;
    }

    function issueSubname(string calldata label, string calldata parentName, address target) external {
        bytes32 parentNode = parentNodeFor(parentName);
        _requireController(parentNode);
        _requireActive(parentNode);
        _issue(label, parentName, parentNode, target);
    }

    function bulkIssue(
        string[] calldata labels,
        string calldata parentName,
        address[] calldata targets
    ) external {
        uint256 length = labels.length;
        if (length == 0 || length > MAX_BULK_ISSUE || length != targets.length) {
            revert InvalidBulkRequest();
        }

        bytes32 parentNode = parentNodeFor(parentName);
        _requireController(parentNode);
        _requireActive(parentNode);

        for (uint256 i = 0; i < length; i++) {
            _issue(labels[i], parentName, parentNode, targets[i]);
        }
    }

    function revokeSubname(string calldata label, string calldata parentName) external {
        bytes32 parentNode = parentNodeFor(parentName);
        _requireController(parentNode);
        _requireActive(parentNode);

        string memory name = canonicalSubname(label, parentName);
        bytes32 subnameNode = keccak256(bytes(name));
        Subname storage record = _subnames[subnameNode];
        Organization memory organization = organizations[parentNode];
        if (
            record.parentNode != parentNode
                || !record.issued
                || record.generation != organization.generation
        ) revert InvalidName();

        delete _subnames[subnameNode];
        emit SubnameRevoked(parentNode, subnameNode, name);
    }

    function resolve(string calldata label, string calldata parentName) external view returns (address) {
        return resolveNode(subnameNodeFor(label, parentName));
    }

    function resolveNode(bytes32 subnameNode) public view returns (address) {
        Subname memory record = _subnames[subnameNode];
        Organization memory organization = organizations[record.parentNode];
        if (
            !record.issued
                || record.generation != organization.generation
                || !_isActive(record.parentNode)
        ) return address(0);
        return record.target;
    }

    function subnameInfo(bytes32 subnameNode)
        external
        view
        returns (bytes32 parentNode, address target, bool active)
    {
        Subname memory record = _subnames[subnameNode];
        Organization memory organization = organizations[record.parentNode];
        active = record.issued
            && record.generation == organization.generation
            && _isActive(record.parentNode);
        return (record.parentNode, record.target, active);
    }

    function organizationStatus(string calldata parentName)
        external
        view
        returns (bytes32 parentNode, address parentOwner, uint256 paidUntil, bool active)
    {
        parentNode = parentNodeFor(parentName);
        parentOwner = registry.ownerOf(parentNode);
        paidUntil = organizations[parentNode].paidUntil;
        active = _isActive(parentNode);
    }

    function parentNodeFor(string calldata parentName) public pure returns (bytes32) {
        return keccak256(bytes(_canonicalParent(parentName)));
    }

    function subnameNodeFor(string calldata label, string calldata parentName) public pure returns (bytes32) {
        return keccak256(bytes(canonicalSubname(label, parentName)));
    }

    function canonicalSubname(string calldata label, string calldata parentName)
        public
        pure
        returns (string memory)
    {
        return string.concat(_canonicalLabel(label), ".", _canonicalParent(parentName));
    }

    function setAnnualFee(uint256 newAnnualFee) external onlyOwner {
        uint256 previousFee = annualFee;
        annualFee = newAnnualFee;
        emit AnnualFeeUpdated(previousFee, newAnnualFee);
    }

    function withdraw(address payable to) external onlyOwner nonReentrant {
        if (to == address(0)) revert InvalidTarget();
        (bool success,) = to.call{value: address(this).balance}("");
        if (!success) revert WithdrawalFailed();
    }

    function _issue(
        string calldata label,
        string calldata parentName,
        bytes32 parentNode,
        address target
    ) internal {
        if (target == address(0)) revert InvalidTarget();

        string memory name = canonicalSubname(label, parentName);
        bytes32 subnameNode = keccak256(bytes(name));
        _subnames[subnameNode] = Subname({
            parentNode: parentNode,
            generation: organizations[parentNode].generation,
            target: target,
            issued: true
        });

        emit SubnameIssued(parentNode, subnameNode, name, target);
    }

    function _requireController(bytes32 parentNode) internal view {
        Organization memory organization = organizations[parentNode];
        address parentOwner = registry.ownerOf(parentNode);
        if (parentOwner == address(0) || organization.controller != parentOwner) {
            revert NotParentController();
        }
        if (
            msg.sender != parentOwner
                && _managerGenerations[parentNode][msg.sender] != organization.generation
        ) revert NotParentController();
    }

    function _requireActive(bytes32 parentNode) internal view {
        if (!_isActive(parentNode)) revert InactiveOrganization();
    }

    function _isActive(bytes32 parentNode) internal view returns (bool) {
        Organization memory organization = organizations[parentNode];
        return organization.controller != address(0)
            && registry.ownerOf(parentNode) == organization.controller
            && organization.paidUntil >= block.timestamp;
    }

    function _canonicalParent(string calldata parentName) internal pure returns (string memory) {
        bytes memory raw = bytes(parentName);
        if (raw.length < 7 || raw.length > MAX_LABEL_LENGTH + 4) revert InvalidName();

        uint256 labelLength = raw.length - 4;
        if (
            raw[labelLength] != 0x2e
                || !_matches(raw[labelLength + 1], 0x78)
                || !_matches(raw[labelLength + 2], 0x64)
                || !_matches(raw[labelLength + 3], 0x63)
        ) {
            revert InvalidName();
        }

        bytes memory canonical = new bytes(raw.length);
        for (uint256 i = 0; i < labelLength; i++) {
            canonical[i] = _canonicalCharacter(raw[i], i, labelLength);
        }
        canonical[labelLength] = 0x2e;
        canonical[labelLength + 1] = 0x78;
        canonical[labelLength + 2] = 0x64;
        canonical[labelLength + 3] = 0x63;
        return string(canonical);
    }

    function _canonicalLabel(string calldata label) internal pure returns (string memory) {
        bytes memory raw = bytes(label);
        if (raw.length == 0 || raw.length > MAX_LABEL_LENGTH) revert InvalidName();

        bytes memory canonical = new bytes(raw.length);
        for (uint256 i = 0; i < raw.length; i++) {
            canonical[i] = _canonicalCharacter(raw[i], i, raw.length);
        }
        return string(canonical);
    }

    function _canonicalCharacter(bytes1 char, uint256 index, uint256 length) internal pure returns (bytes1) {
        uint8 code = uint8(char);
        if (code >= 65 && code <= 90) {
            code += 32;
            char = bytes1(code);
        }

        bool valid = (code >= 97 && code <= 122) || (code >= 48 && code <= 57) || char == 0x2d;
        if (!valid || (char == 0x2d && (index == 0 || index == length - 1))) revert InvalidName();
        return char;
    }

    function _matches(bytes1 char, bytes1 lowercase) internal pure returns (bool) {
        return char == lowercase || uint8(char) == uint8(lowercase) - 32;
    }
}
