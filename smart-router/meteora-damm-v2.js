import { Connection, PublicKey, Keypair, sendAndConfirmTransaction, SystemProgram, TransactionMessage } from "@solana/web3.js";
import {
  CpAmm,
  getPriceFromSqrtPrice,
} from "@meteora-ag/cp-amm-sdk";
import BN from "bn.js";
import bs58 from "bs58";
const poolCache = {};
let rpc;
let client = null;
let tokenADecimals = null;
let tokenBDecimals = null;
let tokenAProgram = null;
let tokenBProgram = null;
let wallet;

const SOL_MINT = 'So11111111111111111111111111111111111111112';

// Custom JSON serializer to handle BigInt
const customSerializer = (key, value) => {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  return value;
};

async function getClient() {
  if (!client) {
    if (!process.env.SOLANA_RPC_URL) {
      throw new Error("SOLANA_RPC_URL is not set");
    }
    wallet = Keypair.fromSecretKey(
      new Uint8Array(bs58.decode(process.env.SOLANA_WALLET_SECRET_KEY))
    );
    tokenAProgram = process.env.TOKEN_A_PROGRAM;
    tokenBProgram = process.env.TOKEN_B_PROGRAM;
    console.log("Using RPC URL:", process.env.SOLANA_RPC_URL);
    rpc = new Connection(process.env.SOLANA_RPC_URL, "confirmed");
    client = new CpAmm(rpc);
  }
  return client;
}
async function getPool(poolAddress) {
  const client = await getClient();
  const poolState = await client.fetchPoolState(poolAddress);
  if (!poolState) {
    throw new Error(`Pool not found for address: ${poolAddress}`);
  }
  poolCache[poolAddress] = poolState;
  return poolState;
}

export async function fetchPools(req, res) {
  const { poolAddress } = req.body;
  const cpAmm = await getPool(poolAddress);
  if (!tokenADecimals || !tokenBDecimals) {
    // Get token decimals from the pool state
    tokenADecimals = Number(process.env.TOKEN_A_DECIMALS);
    tokenBDecimals = Number(process.env.TOKEN_B_DECIMALS);
  }
  // Use the custom serializer for BigInt values
  res.setHeader('Content-Type', 'application/json');
  // return success or not by checking if cpAmm is defined
  if (cpAmm) {
    res.status(200).json({
      success: true,
    });
  } else {
    res.status(404).json({
      success: false,
      message: 'Pool not found',
    });
  }
}

export async function getQuote(req, res) {
  const { isExactIn, poolAddress } = req.body;
  let poolState = null;
  if(poolCache[poolAddress]) {
    poolState = poolCache[poolAddress];
  } else {
    poolState = await getPool(poolAddress);
  }
  if (!tokenADecimals || !tokenBDecimals) {
    // Get token decimals from the pool state
    tokenADecimals = Number(process.env.TOKEN_A_DECIMALS);
    tokenBDecimals = Number(process.env.TOKEN_B_DECIMALS);
    console.log(`Token A Decimals: ${tokenADecimals}, Token B Decimals: ${tokenBDecimals}`);
  }
  if (isExactIn) {
    getQuoteExactIn(req, res);
  } else {
    getQuoteExactOut(req, res);
  }
}

export async function getQuoteExactIn(req, res) {
  const { poolAddress, swapAmounts, a2b } = req.body;
  const client = await getClient();
  let poolState = null;
  if (poolCache[poolAddress]) {
    poolState = poolCache[poolAddress];
  } else {
    poolState = await getPool(poolAddress);
  }
  const results = [];
  for (const amount of swapAmounts) {
    // Convert amount to BN
    const bnAmount = new BN(amount);
    // Get quote first
    const quote = client.getQuote({
      inAmount: bnAmount,
      inputTokenMint: a2b ? poolState.tokenAMint : poolState.tokenBMint,
      slippage: 0.1,
      poolState
    });
    console.log(`Quote for amount ${amount}:`, quote);
    results.push({
      amountIn: quote.swapInAmount.toString(),
      amountOut: quote.swapOutAmount.toString(),
      fee: quote.totalFee,
    });
  }

  // Use the custom serializer for BigInt values
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify({ results }, customSerializer));
}

export async function getQuoteExactOut(req, res) {
  const { poolAddress, swapAmounts, a2b } = req.body;
  const client = await getClient();
  let poolState = null;
  if (poolCache[poolAddress]) {
    poolState = poolCache[poolAddress];
  } else {
    poolState = await getPool(poolAddress);
  }
  async function findInputForOutput(targetOut, maxTries = 20, tolerance = 1n) {
    // Estimate price from sqrtPrice (assuming 64.64 fixed point)
    const sqrtPrice = new BN(poolState.sqrtPrice);
    const price = getPriceFromSqrtPrice(sqrtPrice, tokenADecimals, tokenBDecimals);
    const priceFloat = Number(price);

    const inputTokenMint = a2b ? poolState.tokenAMint : poolState.tokenBMint;
    let decimalDiff = a2b ? tokenADecimals - tokenBDecimals : tokenBDecimals - tokenADecimals;
    // Estimate input needed for target output
    let estimatedInput;
    if (a2b) {
      estimatedInput = targetOut.divn(priceFloat)
    } else {
      estimatedInput = targetOut.muln(priceFloat);
    }

    estimatedInput = decimalDiff > 0 ? estimatedInput.muln(10 ** decimalDiff) : estimatedInput.divn(10 ** -decimalDiff);

    let low = estimatedInput.muln(0.8)  // 0.8 * estimatedInput
    let high = estimatedInput.muln(1.2); // 1.2 * estimatedInput
    const base = low.add(high).divn(maxTries * 2); // Average of low and high

    let closest = null;
    let closestDiff = null;
    let mid = estimatedInput;
    for (let i = 0; i < maxTries; i++) {
      const quote = client.getQuote({
        inAmount: mid,
        inputTokenMint,
        slippage: 0.1,
        poolState
      });
      console.log('swapInAmount:', mid.toString(), 'swapOutAmount:', quote.swapOutAmount.toString());
      const out = new BN(quote.swapOutAmount.toString());
      const diff = out.gt(targetOut) ? out.sub(targetOut) : targetOut.sub(out);

      if (closestDiff === null || diff.lt(closestDiff)) {
        closest = { inAmount: mid, outAmount: out, fee: new BN(quote.totalFee.toString()) };
        closestDiff = diff;
      }

      if (diff.lte(tolerance)) break;
      if (out.lt(targetOut)) {
        low = mid.add(base);
      } else {
        high = mid.sub(base);
      }
      mid = low.add(high).divn(2);
    }
    return closest;
  }

  // Run all searches in parallel
  const results = await Promise.all(
    swapAmounts.map(async (amount) => {
      const targetOut = new BN(amount);
      const found = await findInputForOutput(targetOut);
      console.log(`Found input for output ${amount}:`, found.outAmount.toString());
      return {
        amountIn: found ? found.inAmount.toString() : null,
        amountOut: found ? found.outAmount.toString() : null,
        fee: found ? found.fee.toString() : null,
      };
    })
  );

  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify({ results }, customSerializer));
}

export async function swap(req, res){
  const { poolAddress, amountIn, minAmountOut, fromTokenMint, toTokenMint } = req.body;
  const client = await getClient();
  const poolState = await getPool(poolAddress);
  if (!poolState) {
    return res.status(404).json({ error: 'Pool not found' });
  }

  const swapTx = await client.swap({
    payer: wallet.publicKey,
    pool: poolAddress,
    inputTokenMint: new PublicKey(fromTokenMint),
    outputTokenMint: new PublicKey(toTokenMint),
    amountIn: new BN(amountIn),
    minimumAmountOut:new BN(minAmountOut),
    tokenAVault: poolState.tokenAVault,
    tokenBVault: poolState.tokenBVault,
    tokenAMint: poolState.tokenAMint,
    tokenBMint: poolState.tokenBMint,
    tokenAProgram: new PublicKey(tokenAProgram),
    tokenBProgram: new PublicKey(tokenBProgram),
    referralTokenAccount: null,
  });
    const next_block_addrs = [
    'NEXTbLoCkB51HpLBLojQfpyVAMorm3zzKg7w9NFdqid',
    'NeXTBLoCKs9F1y5PJS9CKrFNNLU1keHW71rfh7KgA1X',
    'NexTBLockJYZ7QD7p2byrUa6df8ndV2WSd8GkbWqfbb',
    'neXtBLock1LeC67jYd1QdAa32kbVeubsfPNTJC1V5At',
    'nEXTBLockYgngeRmRrjDV31mGSekVPqZoMGhQEZtPVG',
    'nextBLoCkPMgmG8ZgJtABeScP35qLa2AMCNKntAP7Xc',
    'NextbLoCkVtMGcV47JzewQdvBpLqT9TxQFozQkN98pE',
    'NexTbLoCkWykbLuB1NkjXgFWkX9oAtcoagQegygXXA2'
  ]
  let signature;
  let lastError;
  // for (let attempt = 1; attempt <= 3; attempt++) {
  //   try {
  //     signature = await sendAndConfirmTransaction(
  //       rpc,
  //       swapTx,
  //       [wallet],
  //       { skipPreflight: false, preflightCommitment: 'confirmed' }
  //     );
  //     break; // Success, exit loop
  //   } catch (error) {
  //     lastError = error;
  //     console.error(`Swap attempt ${attempt} failed:`, error);
  //     // Retry only if TransactionExpiredBlockheightExceededError
  //     if (!String(error).includes('TransactionExpiredBlockheightExceededError')) {
  //       break;
  //     }
  //     if (attempt < 3) {
  //       // Optional: wait a bit before retrying
  //       await new Promise(res => setTimeout(res, 1000));
  //     }
  //   }
  // }
  for (let i = 0; i < next_block_addrs.length; i++) {
      const next_block_addr = next_block_addrs[i];
      const next_block_api = process.env.NEXT_BLOCK_API;

      if (!next_block_addr) return console.log("Nextblock wallet is not provided");
      if (!next_block_api) return console.log("Nextblock block api is not provided");

      // NextBlock Instruction
      const recipientPublicKey = new PublicKey(next_block_addr);
      const transferInstruction = SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: recipientPublicKey,
        lamports: 1000000, // Adjust the amount as needed
      });

      swapTx.add(transferInstruction);
      const latestBlockhash = await rpc.getLatestBlockhash();
      swapTx.recentBlockhash = latestBlockhash.blockhash;
      swapTx.feePayer = wallet.publicKey; 
      swapTx.sign(wallet)

      const tx64Str = swapTx.serialize().toString('base64');
      const payload ={
        transaction: {
          content: tx64Str
        }
      };

      try {
        console.log("Trying transaction to confirm using nextblock")
        const response = await fetch('https://fra.nextblock.io/api/v2/submit', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'authorization': next_block_api // Insert your authorization token here
          },
          body: JSON.stringify(payload)
        });

        const responseData = await response.json();

        if (response.ok) {
          console.log("Sent transaction with signature", `https://solscan.io/tx/${responseData.signature?.toString()}`);
          signature = responseData.signature;
          break;
        } else {
          console.error("Failed to send transaction:", response.status, responseData);
          continue;
        }
      } catch (error) {
        console.error("Error sending transaction:", error);
        continue;
      }
    }
    if (!signature) {
      return res.status(500).json({ success: false, error: lastError.message });
    }

try {
  console.log('Swap successful with signature:', signature);

  // Poll for transaction confirmation
  let txResult = null;
  const maxTries = 5;
  const delayMs = 1500;
  for (let i = 0; i < maxTries; i++) {
    txResult = await rpc.getTransaction(signature, { commitment: "confirmed" });
    if (txResult && txResult.meta) {
      break;
    }
    console.log(`Waiting for transaction confirmation... (${i + 1}/${maxTries})`);
    await new Promise(res => setTimeout(res, delayMs));
  }
  if (!txResult || !txResult.meta) {
    throw new Error('Transaction not found or not confirmed after polling');
  }

  console.log('Transaction result:', txResult);
  const tokenInChange = getTokenChange(txResult.meta, fromTokenMint, wallet.publicKey.toBase58());
  const tokenOutChange = getTokenChange(txResult.meta, toTokenMint, wallet.publicKey.toBase58());

  res.status(200).json({ success: true, signature, tokenInChange, tokenOutChange });
} catch (error) {
  console.error('Swap post-processing failed:', error);
  res.status(500).json({ success: false, error: error.message });
}
}

function getTokenChange(meta, mint, owner) {
  if (mint === SOL_MINT) {
    return getSolChange(meta.preBalances, meta.postBalances).toString();
  }
  const preBalances = meta.preTokenBalances || [];
  const postBalances = meta.postTokenBalances || [];
  if (!preBalances || !postBalances) return null;
  const pre = preBalances.find(b => b.mint === mint && b.owner === owner);
  const post = postBalances.find(b => b.mint === mint && b.owner === owner);
  if (!pre && !post) return null;
  const preAmount = pre ? BigInt(pre.uiTokenAmount.amount) : 0n;
  const postAmount = post ? BigInt(post.uiTokenAmount.amount) : 0n;
  return (postAmount - preAmount).toString();
}

function getSolChange(preBalances, postBalances, index = 0) {
  if (!Array.isArray(preBalances) || !Array.isArray(postBalances) || preBalances.length !== postBalances.length) {
    throw new Error('preBalances and postBalances must be arrays of the same length');
  }
  return (BigInt(postBalances[index]) - BigInt(preBalances[index])).toString();
}

export async function getPoolPrice(req, res) {
  const { poolAddress } = req.body;
  try {
    const poolState = await getPool(poolAddress);
    if (!poolState) {
      return res.status(404).json({ error: 'Pool not found' });
    }
    const sqrtPrice = new BN(poolState.sqrtPrice);
    const price = getPriceFromSqrtPrice(sqrtPrice, tokenADecimals, tokenBDecimals);
    res.status(200).json({ price: price.toString() });
  } catch (error) {
    console.error('Error fetching pool price:', error);
    res.status(500).json({ error: error.message });
  }
}