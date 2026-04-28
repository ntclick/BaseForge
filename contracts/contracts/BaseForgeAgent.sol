// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IIdentity {
    function tokenOf(address wallet) external view returns (uint256);
}

/// @title BaseForge Agent
/// @notice Each NFT represents a single alert agent (token + rules) on
///         BaseForge. Free mint (gas only). Caller must hold a BaseForge
///         Identity NFT first. Agent NFTs are transferable so users can
///         hand off agents to other wallets.
contract BaseForgeAgent is ERC721, Ownable {
    uint256 private _nextId = 1;
    string private _baseTokenURI;
    IIdentity public immutable identity;

    /// @notice Optional metadata pointer set by the owner (per-token URI override path).
    mapping(uint256 => string) public configHash;

    error IdentityRequired();

    event AgentMinted(address indexed wallet, uint256 indexed tokenId, string configHash);
    event AgentConfigUpdated(uint256 indexed tokenId, string configHash);

    constructor(address identity_, string memory baseURI_)
        ERC721("BaseForge Agent", "BFAG")
        Ownable(msg.sender)
    {
        identity = IIdentity(identity_);
        _baseTokenURI = baseURI_;
    }

    /// @notice Mint an agent NFT. Caller must own an Identity NFT.
    /// @param configHash_ Optional CID/hash pointing to off-chain agent config.
    function mint(string calldata configHash_) external returns (uint256 tokenId) {
        if (identity.tokenOf(msg.sender) == 0) revert IdentityRequired();
        tokenId = _nextId++;
        configHash[tokenId] = configHash_;
        _safeMint(msg.sender, tokenId);
        emit AgentMinted(msg.sender, tokenId, configHash_);
    }

    /// @notice Update the off-chain config pointer for an agent you own.
    function updateConfig(uint256 tokenId, string calldata configHash_) external {
        if (_ownerOf(tokenId) != msg.sender) revert ERC721IncorrectOwner(msg.sender, tokenId, _ownerOf(tokenId));
        configHash[tokenId] = configHash_;
        emit AgentConfigUpdated(tokenId, configHash_);
    }

    function setBaseURI(string calldata newBaseURI) external onlyOwner {
        _baseTokenURI = newBaseURI;
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }
}
