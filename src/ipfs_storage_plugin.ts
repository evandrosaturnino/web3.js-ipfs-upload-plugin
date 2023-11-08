import { promises as fsPromises } from "fs";
import type { ContractAbi, EventLog, TransactionReceipt } from "web3";
import { Contract, Web3PluginBase } from "web3";
import { CID, create } from "ipfs-http-client";

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
  private readonly registryContract: Contract<typeof RegistryABI>;
  private ipfsClient;

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

    this.registryContract = new Contract(
      options.registryAbi ?? RegistryABI,
      options.registryAddress ?? REGISTRY_ADDRESS,
    );

    // Adds Web3Context to Contract instance
    this.registryContract.link(this);
    this.ipfsClient = create({
      url: options.ipfsApiUrl || "http://localhost:5001",
    }); // Default IPFS API URL
  }

  /**
   * Uploads a file from the local file system to IPFS via Helia and unixfs,
   * and then stores the returned CID in a smart contract registry.
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

  private async storeCIDInRegistry(cid: CID): Promise<TransactionReceipt> {
    if (typeof this.registryContract.methods.store === "function") {
      try {
        const receipt: TransactionReceipt = await this.registryContract.methods
          .store(cid.toString())
          .send();
        console.log("Stored file CID receipt:", receipt);
        return receipt;
      } catch (error) {
        console.error("Error storing CID:", error);
        throw new Error("Error storing CID in the registry.");
      }
    }

    throw new Error(
      "The store method is not defined in the registry contract.",
    );
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
    try {
      const events: (string | EventLog)[] =
        await this.registryContract.getPastEvents("CIDStored", {
          filter: { owner: ethereumAddress },
          fromBlock: startBlock,
          toBlock: "latest",
        });

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
