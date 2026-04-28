// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title BaseForge Identity
/// @notice Soulbound 1-per-wallet NFT proving membership. Mint is free; the
///         token cannot be transferred (soulbound). Owning one unlocks the
///         free tier (1 active alert agent) on BaseForge.
contract BaseForgeIdentity is ERC721, Ownable {
    uint256 private _nextId = 1;
    mapping(address => uint256) public tokenOf;
    string private _baseTokenURI;

    error AlreadyMinted();
    error Soulbound();

    event IdentityMinted(address indexed wallet, uint256 indexed tokenId);

    constructor(string memory baseURI_) ERC721("BaseForge Identity", "BFID") Ownable(msg.sender) {
        _baseTokenURI = baseURI_;
    }

    /// @notice Mint your identity NFT. One per wallet, free (gas only).
    function mint() external returns (uint256 tokenId) {
        if (tokenOf[msg.sender] != 0) revert AlreadyMinted();
        tokenId = _nextId++;
        tokenOf[msg.sender] = tokenId;
        _safeMint(msg.sender, tokenId);
        emit IdentityMinted(msg.sender, tokenId);
    }

    function setBaseURI(string calldata newBaseURI) external onlyOwner {
        _baseTokenURI = newBaseURI;
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }

    /// @dev Soulbound: block all transfers (except mint and burn).
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address)
    {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) revert Soulbound();
        return super._update(to, tokenId, auth);
    }
}
