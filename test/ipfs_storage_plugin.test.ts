import { Web3Eth, Web3Context } from "web3";
import { IPFSStoragePlugin } from "../src";

describe("IPFSStoragePlugin Tests", () => {
  it("should register IPFSStoragePlugin plugin on Web3Context instance", () => {
    const web3Context = new Web3Context("http://127.0.0.1:8545");
    web3Context.registerPlugin(new IPFSStoragePlugin());
    expect(web3Context.IPFSStorage).toBeDefined();
  });

  it("should register IPFSStoragePlugin plugin on Web3Eth instance", () => {
    const web3Eth = new Web3Eth("http://127.0.0.1:8545");
    web3Eth.registerPlugin(new IPFSStoragePlugin());
    expect(web3Eth.IPFSStorage).toBeDefined();
  });
});
