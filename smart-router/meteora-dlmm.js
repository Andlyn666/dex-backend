import { Connection, PublicKey, Keypair, sendAndConfirmTransaction } from "@solana/web3.js";
import { DLMM } from "@meteora-ag/dlmm";
import BN from "bn.js";

const poolCache = {};
const binArrayCache = {};

async function getPool(poolAddress) {
  console.log(`Fetching pool for address: ${poolAddress}`);
  console.log(process.env.SOLANA_RPC_URL);
  if (poolCache[poolAddress]) {
    return poolCache[poolAddress];
  }
  const connection = new Connection(process.env.SOLANA_RPC_URL, "confirmed");
  const dlmmPool = await DLMM.create(connection, poolAddress, {
    cluster: "mainnet-beta",
  });
  poolCache[poolAddress] = dlmmPool;
  return dlmmPool;
}

export async function fetchPools(req, res) {
  poolAddress = req.body.poolAddress;
  dlmmPool = await getPool(poolAddress);
  const binArrays = await dlmmPool.getBinArrayForSwap(swapYtoX);
  binArrayCache[poolAddress] = binArrays;
  const response = {
    poolAdress: `${poolAddress}`
  };
        
  // Use the custom serializer for BigInt values
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(response, customSerializer));
}

export async function getQuote(req, res) {
  const { x2y, isExactIn, poolAddress, swapAmounts, swapYtoX } = req.body;
  const dlmmPool = await getPool(poolAddress);
  let binArrays = binArrayCache[poolAddress];
  if (!binArrays) {
    binArrays = await dlmmPool.getBinArrayForSwap(swapYtoX);
    binArrayCache[poolAddress] = binArrays;
  }
  const maxExtraBinArrays = 0; // Adjust as needed

  const results = [];
  for (const amount of swapAmounts) {
    let swapResult;
    if (isExactIn) {
      swapResult = dlmmPool.swapQuote(
        new BN(amount),
        x2y,
        new BN(10),
        binArrays,
        false,
        maxExtraBinArrays
      );
    } else {
      swapResult = dlmmPool.swapQuoteExactOut(
        new BN(amount),
        x2y,
        new BN(10),
        binArrays,
        maxExtraBinArrays
      );
    }
    results.push({
      amount: amount.toString(),
      amountIn: swapResult.amountIn.toString(),
      amountOut: swapResult.amountOut.toString(),
      fee: swapResult.fee.toString(),
      slippage: swapResult.slippage.toString(),
    });
  }

  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify({
    poolAddress: `${poolAddress}`,
    swapResults: results
  }));
}
