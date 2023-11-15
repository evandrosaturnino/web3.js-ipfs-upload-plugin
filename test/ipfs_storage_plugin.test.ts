import { expect as chaiExpect } from "chai";
import type { EventLog, TransactionReceipt } from "web3";
import Web3, { Web3Eth, Web3Context } from "web3";

import { IPFSStoragePlugin } from "../src/ipfs_storage_plugin";
import "dotenv/config";

const providerUrl = process.env.PROVIDER_URL;
const privateKey = process.env.PRIVATE_KEY;
const ipfsApiUrl = process.env.IPFS_API_URL;
const ipfsProjectId = process.env.IPFS_PROJECT_ID;
const ipfsSecretKey = process.env.IPFS_API_SECRET_KEY;

const ipfsAuth =
  "Basic " +
  Buffer.from(`${ipfsProjectId}:${ipfsSecretKey}`).toString("base64");

const localFilePath = "./mock/mockfile.txt";

describe("IPFSStoragePlugin e2e Tests", () => {
  it("should register IPFSStoragePlugin plugin on Web3Context instance", () => {
    const web3Context = new Web3Context("http://127.0.0.1:8545");
    const ipfsStoragePlugin = new IPFSStoragePlugin({
      ipfsApiUrl: ipfsApiUrl as string,
      ipfsAuth,
    });
    web3Context.registerPlugin(ipfsStoragePlugin);
    expect(web3Context.IPFSStorage).toBeDefined();
  });

  it("should register IPFSStoragePlugin plugin on Web3Eth instance", () => {
    const web3Eth = new Web3Eth("http://127.0.0.1:8545");
    const ipfsStoragePlugin = new IPFSStoragePlugin({
      ipfsApiUrl: ipfsApiUrl as string,
      ipfsAuth,
    });
    web3Eth.registerPlugin(ipfsStoragePlugin);
    expect(web3Eth.IPFSStorage).toBeDefined();
  });

  describe("IPFSStoragePlugin method tests", () => {
    let web3: Web3;
    let ipfsStoragePlugin: IPFSStoragePlugin;
    let requestManagerSendSpy: jest.SpyInstance;

    beforeAll(() => {
      if (!providerUrl || !privateKey) {
        throw new Error(
          "Provider URL and Private Key must be set in the .env file",
        );
      }
      web3 = new Web3(new Web3.providers.HttpProvider(providerUrl));

      const account = web3.eth.accounts.privateKeyToAccount(privateKey);
      web3.eth.accounts.wallet.add(account);
      web3.eth.defaultAccount = account.address;

      ipfsStoragePlugin = new IPFSStoragePlugin({
        ipfsApiUrl: ipfsApiUrl as string,
        ipfsAuth,
      });

      web3.eth.registerPlugin(ipfsStoragePlugin);
      requestManagerSendSpy = jest.spyOn(
        web3.eth.IPFSStorage.requestManager,
        "send",
      );
    });

    it("should upload a file to IPFS and store the CID in the registry", async () => {
      const transactionReceipt: TransactionReceipt =
        await web3.eth.IPFSStorage.uploadLocalFileToIPFS(localFilePath);

      chaiExpect(transactionReceipt).to.have.property("status", 1n);
      const cidEvent = Object.values(transactionReceipt.events!).find(
        (event: EventLog) => event.event === "CIDStored",
      );
      const cid: unknown = cidEvent?.returnValues?.cid;

      chaiExpect(cid).to.be.a("string").that.is.not.empty;

      const expectedArguments = [
        {
          method: "eth_getBlockByNumber",
          params: ["latest", false],
        },
        {
          method: "eth_getTransactionCount",
          params: [web3.eth.defaultAccount, "latest"],
        },
        {
          method: "eth_chainId",
          params: [],
        },
      ];

      expectedArguments.forEach((arg, index) =>
        expect(requestManagerSendSpy).toHaveBeenNthCalledWith(index + 1, arg),
      );
    }, 40000);

    it("should list CIDs for a given Ethereum address", async () => {
      const accountAddress = web3.eth.defaultAccount;
      const consoleLogSpy = jest.spyOn(console, "log");
      await ipfsStoragePlugin.listCIDsForAddress(accountAddress!);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("CIDs stored by address"),
      );
      consoleLogSpy.mockRestore();
    }, 40000);
  });
});
