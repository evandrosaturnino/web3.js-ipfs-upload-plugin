import { promises as fsPromises } from "fs";
import type { Address, ContractAbi, EventLog, TransactionReceipt } from "web3";
import { Contract, Web3PluginBase } from "web3";
import type { CID, EndpointConfig } from "ipfs-http-client";
import type { IPFS } from "ipfs-core-types";
import { create } from "ipfs-http-client";

import { RegistryABI } from "./registry_abi";
import { REGISTRY_ADDRESS, REGISTRY_DEPLOYMENT_BLOCK } from "./constants";

export interface IStoragePlugin {
  uploadLocalFileToIPFS(localFilePath: string): Promise<TransactionReceipt>;
  listCIDsForAddress(
    ethereumAddress: string,
    startBlock?: number,
  ): Promise<void>;
}

export class IPFSStoragePlugin
  extends Web3PluginBase
  implements IStoragePlugin
{
  public pluginNamespace: string;
  private registryAbi: ContractAbi;
  private registryAddress: Address;
  public ipfsClient: IPFS & {
    getEndpointConfig: () => EndpointConfig;
  };

  public constructor(
    options: {
      pluginNamespace?: string;
      registryAbi?: ContractAbi;
      registryAddress?: string;
      ipfsApiUrl?: string;
    } = {},
  ) {
    super();
    this.pluginNamespace = options.pluginNamespace ?? "IPFSStorage";
    this.registryAbi = options.registryAbi ?? RegistryABI;
    this.registryAddress = options.pluginNamespace ?? REGISTRY_ADDRESS;

    this.ipfsClient = create({
      url: options.ipfsApiUrl || "http://localhost:5001",
    }); // Default IPFS API URL
  }

  /**
   * Uploads a file from the local file system to IPFS, and stores the returned
   * CID in a smart contract registry.
   *
   * @param localFilePath - The file URL object pointing to the local file to upload.
   * @returns A `TransactionReceipt` object that contains details of the transaction
   *          used to store the CID in the registry.
   */
  public async uploadLocalFileToIPFS(
    localFilePath: string,
  ): Promise<TransactionReceipt> {
    try {
      const fileBuffer = await fsPromises.readFile(localFilePath);
      const addedFile = await this.ipfsClient.add(fileBuffer);
      console.log("Added file CID:", addedFile.cid.toString());

      return await this.storeCIDInRegistry(addedFile.cid);
    } catch (error) {
      console.error("Error during file upload to IPFS:", error);
      throw new Error("Failed to upload file to IPFS.");
    }
  }

  /**
   * Stores a CID in the smart contract registry.
   *
   * @param cid - The CID to be stored.
   * @param fromAddress - The Ethereum address from which the transaction is made.
   * @returns A promise that resolves to a TransactionReceipt once the CID is stored.
   * @throws Will throw an error if the store method is not defined in the contract or if the transaction fails.
   */
  private async storeCIDInRegistry(cid: CID): Promise<TransactionReceipt> {
    const _contract: Contract<typeof RegistryABI> = new Contract(
      this.registryAbi,
      this.registryAddress,
    );

    // Adds Web3Context to Contract instance
    _contract.link(this);

    if (typeof _contract.methods.store !== "function") {
      throw new Error(
        "The store method is not defined in the registry contract.",
      );
    }

    try {
      const receipt: TransactionReceipt = await _contract.methods
        .store(cid.toString())
        .call();
      console.log("Stored file CID receipt:", receipt);

      return receipt;
    } catch (error) {
      console.error("Error storing CID:", error);
      throw new Error("Error storing CID in the registry.");
    }
  }

  /**
   * Retrieves a list of CIDs (Content Identifiers) stored by a specific Ethereum address
   * from a smart contract registry. It filters the `CIDStored` events emitted by the contract
   * for the given address and starting from the specified block number up to the latest block.
   *
   *
   * @param ethereumAddress - The Ethereum address to list CIDs for.
   * @param startBlock - (Optional) The starting block number to begin the event filter from.
   *                     Defaults to the block number when the registry was deployed.
   * @returns A Promise that resolves to `void`, but the CIDs are printed out to the console.
   */
  public async listCIDsForAddress(
    ethereumAddress: string,
    startBlock: number = REGISTRY_DEPLOYMENT_BLOCK,
  ): Promise<void> {
    const _contract: Contract<typeof RegistryABI> = new Contract(
      this.registryAbi,
      this.registryAddress,
    );

    // Adds Web3Context to Contract instance
    _contract.link(this);

    try {
      const events: (string | EventLog)[] = await _contract.getPastEvents(
        "CIDStored",
        {
          filter: { owner: ethereumAddress },
          fromBlock: startBlock,
          toBlock: "latest",
        },
      );

      if (events.length === 0) {
        console.log(`No CIDs found for address ${ethereumAddress}.`);
        return;
      }

      console.log(`CIDs stored by address ${ethereumAddress}:`);
      (events as EventLog[]).forEach((event) => {
        console.log(event.returnValues.cid);
      });
    } catch (error) {
      console.error("Error retrieving CIDs for address:", error);
      throw new Error("Failed to retrieve CIDs.");
    }
  }
}

// Module Augmentation
declare module "web3" {
  interface Web3Context {
    IPFSStorage: IPFSStoragePlugin;
  }
}
