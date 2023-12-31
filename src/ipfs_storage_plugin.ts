import type { Address, ContractAbi, EventLog, TransactionReceipt } from "web3";
import { Contract, Web3PluginBase } from "web3";
import type { CID, EndpointConfig } from "ipfs-http-client";
import type { IPFS } from "ipfs-core-types";
import { create } from "ipfs-http-client";

import { RegistryABI } from "./registry_abi";
import { REGISTRY_ADDRESS, REGISTRY_DEPLOYMENT_BLOCK } from "./constants";

export interface IStoragePlugin {
  uploadLocalFileToIPFS(
    file: Buffer | Blob | string,
  ): Promise<TransactionReceipt>;
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
  private ipfsApiUrl: string;
  private registryAbi: ContractAbi;
  private registryAddress: Address;
  private ipfsAuth: string;
  public ipfsClient: IPFS & {
    getEndpointConfig: () => EndpointConfig;
  };

  public constructor(
    options: {
      ipfsApiUrl: string;
      pluginNamespace?: string;
      registryAbi?: ContractAbi;
      registryAddress?: string;
      ipfsAuth?: string;
    } = {
      ipfsApiUrl: "",
    },
  ) {
    super();
    this.pluginNamespace = options.pluginNamespace ?? "IPFSStorage";
    this.registryAbi = options.registryAbi ?? RegistryABI;
    this.registryAddress = options.pluginNamespace ?? REGISTRY_ADDRESS;
    this.ipfsAuth = options.ipfsAuth ?? "";
    this.ipfsApiUrl = options.ipfsApiUrl;

    this.ipfsClient = create({
      host: this.ipfsApiUrl,
      port: 5001,
      protocol: "https",
      headers: {
        authorization: this.ipfsAuth,
      },
    });
  }

  /**
   * Uploads a file from to IPFS, and stores the returned
   * CID in a smart contract registry.
   *
   * @param file - The file to upload.
   * @returns A `TransactionReceipt` object that contains details of the transaction
   *          used to store the CID in the registry.
   */
  public async uploadLocalFileToIPFS(
    file: Buffer | Blob | string,
  ): Promise<TransactionReceipt> {
    try {
      const addedFile = await this.ipfsClient.add(file);
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
  public async storeCIDInRegistry(cid: CID): Promise<TransactionReceipt> {
    const _contract: Contract<typeof RegistryABI> = new Contract(
      this.registryAbi,
      this.registryAddress,
    );

    // Adds Web3Context to Contract instance
    _contract.link(this);

    const defaultAccount = _contract.defaultAccount;

    if (typeof _contract.methods.store !== "function") {
      throw new Error(
        "The store method is not defined in the registry contract.",
      );
    }

    if (!defaultAccount) {
      throw new Error(
        "The signer address hasn't been set to the Web3.js Provider instance.",
      );
    }

    try {
      const receipt: TransactionReceipt = await _contract.methods
        .store(cid.toString())
        .send({ from: defaultAccount });
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
