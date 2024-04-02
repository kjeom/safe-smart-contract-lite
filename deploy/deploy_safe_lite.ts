import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments } = hre;

  const [owner1, owner2, owner3] = await hre.ethers.getSigners(); 
  
  const { deploy } = deployments;
  await deploy("SafeLite", {
    from: owner1.address,
    gasLimit: 4000000,
    args: [
      1001,
      [owner1.address, owner2.address, owner3.address],
      2,
    ],
    log: true,
  });
};

func.tags = ["SafeLite"];
export default func;
