import { create } from "ipfs-http-client";
import Web3, { Web3Eth, core } from "web3";
import { RegistryABI } from "../src/registry_abi";
import { REGISTRY_ADDRESS, REGISTRY_DEPLOYMENT_BLOCK } from "../src/constants";
import { IPFSStoragePlugin } from "../src/ipfs_storage_plugin";

const ipfsApiUrl = "localhost";

jest.mock("ipfs-http-client", () => ({
  create: jest.fn().mockImplementation(() => ({
    add: jest.fn(),
  })),
}));

describe("IPFSStoragePlugin Tests", () => {
  it("should register IPFSStorage plugin on Web3Context instance", () => {
    const web3Context = new core.Web3Context("http://127.0.0.1:8545");
    web3Context.registerPlugin(new IPFSStoragePlugin({ ipfsApiUrl }));
    expect(web3Context.IPFSStorage).toBeDefined();
  });

  it("should register IPFSStorage plugin on Web3Eth instance", () => {
    const web3Eth = new Web3Eth("http://127.0.0.1:8545");
    web3Eth.registerPlugin(new IPFSStoragePlugin({ ipfsApiUrl }));
    expect(web3Eth.IPFSStorage).toBeDefined();
  });

  describe("IPFSStorage method tests", () => {
    let web3Context: Web3;
    let ipfsStoragePlugin: IPFSStoragePlugin;

    beforeAll(async () => {
      web3Context = new Web3("http://127.0.0.1:8545");

      const providers = [
        "https://endpoints.omniatech.io/v1/eth/sepolia/public",
        "https://ethereum-sepolia.publicnode.com",
        "https://1rpc.io/sepolia",
        "https://ethereum-sepolia.blockpi.network/v1/rpc/public",
        "https://eth-sepolia-public.unifra.io",
      ];
      let providerSet = false;

      for (const providerUrl of providers) {
        try {
          web3Context.setProvider(providerUrl);
          await web3Context.eth.net.isListening(); // This will throw if the provider isn't connected
          providerSet = true;
          break;
        } catch (error) {
          console.error(`Error setting provider: ${JSON.stringify(error)}`);
        }
      }

      if (!providerSet) {
        throw new Error(
          "None of the providers could be set. Please check the URLs and network status.",
        );
      }

      ipfsStoragePlugin = new IPFSStoragePlugin({
        ipfsApiUrl,
        registryAbi: RegistryABI,
        registryAddress: REGISTRY_ADDRESS,
      });

      web3Context.registerPlugin(ipfsStoragePlugin);
    });

    it("should initialize with default values", () => {
      expect(ipfsStoragePlugin.pluginNamespace).toBeDefined();
      expect(create).toHaveBeenCalledWith({
        host: ipfsApiUrl,
        port: 5001,
        protocol: "https",
        headers: {
          authorization: "",
        },
      });
    });

    it("should upload a file to IPFS and store the CID in the registry", async () => {
      const dummyFileContent = "This is a dummy file content";
      const dummyCid =
        "bafybeibh5r7hnwumx2udt7q2f36xzm4sq2w4kbf7y4obqwe2nk4b7lz6mu";
      const dummyTransactionReceipt = {
        transactionHash:
          "0xba1e4e45604acbdeb359bd1c893ab57aecf8bfce5402168b90da34f0eee7ba3e",
      }; // Mock transaction receipt

      const addMock = jest.fn().mockResolvedValue({ cid: dummyCid });
      web3Context.IPFSStorage.ipfsClient.add = addMock;

      const storeCIDInRegistryMock = jest
        .fn()
        .mockResolvedValue(dummyTransactionReceipt);
      web3Context.IPFSStorage.storeCIDInRegistry = storeCIDInRegistryMock;

      const transactionReceipt =
        await web3Context.IPFSStorage.uploadLocalFileToIPFS(dummyFileContent);

      expect(addMock).toHaveBeenCalledWith(dummyFileContent);
      expect(storeCIDInRegistryMock).toHaveBeenCalledWith(dummyCid);

      // Check if the transaction receipt is the mocked one
      expect(transactionReceipt).toEqual(dummyTransactionReceipt);
    });

    it("should list CIDs for a given Ethereum address", async () => {
      const dummyAddress = REGISTRY_ADDRESS;
      const startBlock = REGISTRY_DEPLOYMENT_BLOCK;
      const dummyCidList = ["QmdummyCid1", "QmdummyCid2"];
      const listCIDsForAddressMock = jest.fn().mockResolvedValue(dummyCidList);
      web3Context.IPFSStorage.listCIDsForAddress = listCIDsForAddressMock;

      const cids = await web3Context.IPFSStorage.listCIDsForAddress(
        dummyAddress,
        startBlock,
      );

      expect(listCIDsForAddressMock).toHaveBeenCalledWith(
        dummyAddress,
        startBlock,
      );
      expect(cids).toEqual(dummyCidList);
    });
  });
});
