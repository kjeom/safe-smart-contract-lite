import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, ethers } = hre;

  const [deployer] = await hre.ethers.getSigners();

  const { deploy } = deployments;
  await deploy("SafeLiteAddressBook", {
    from: deployer.address,
    gasLimit: 4000000,
    args: [],
    log: true,
  });
};

func.tags = ["SafeLiteAddressBook"];
export default func;