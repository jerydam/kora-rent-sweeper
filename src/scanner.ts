import { Connection, PublicKey, SignaturesForAddressOptions } from '@solana/web3.js';
import ora from 'ora';
import chalk from 'chalk';

export async function scanHistory(
  connection: Connection,
  koraWallet: PublicKey,
  limit: number
): Promise<string[]> {
  const spinner = ora(`Scanning last ${limit} transactions...`).start();
  const accountsToCheck: Set<string> = new Set();
  
  let before: string | undefined = undefined;
  let fetched = 0;

  while (fetched < limit) {
    const batchSize = Math.min(25, limit - fetched); // Smaller batch for debug
    
    const options: SignaturesForAddressOptions = { limit: batchSize };
    if (before) options.before = before;

    // 1. Fetch Signatures
    const signatures = await connection.getSignaturesForAddress(koraWallet, options);
    
    if (!signatures || signatures.length === 0) {
      // If we found nothing on the first try, it's likely an RPC lag issue
      if (fetched === 0) console.log(chalk.yellow("\n⚠️  RPC returned 0 signatures. Wait 30s and try again."));
      break;
    }

    // 2. Fetch Parsed Transactions
    const txs = await connection.getParsedTransactions(
      signatures.map(s => s.signature), 
      { maxSupportedTransactionVersion: 0 }
    );

    for (const tx of txs) {
      if (!tx || !tx.meta || tx.meta.err) continue;
      if (!tx.transaction || !tx.transaction.message) continue;

      const message = tx.transaction.message as any; 
      const accountKeys = message.accountKeys;
      
      // Safety check
      if (!accountKeys || accountKeys.length === 0) continue;

      // Identify Payer
      // Handle both "Parsed" (object) and "Raw" (string/PublicKey) formats safely
      const payerKeyObj = accountKeys[0];
      const payerAddr = payerKeyObj.pubkey ? payerKeyObj.pubkey.toBase58() : payerKeyObj.toBase58();

      // DEBUG: Log what we found
      // console.log(chalk.gray(`\nTx: ${tx.transaction.signatures[0]} | Payer: ${payerAddr}`));

      if (payerAddr === koraWallet.toBase58()) {
        accountKeys.forEach((key: any) => {
          const keyAddr = key.pubkey ? key.pubkey.toBase58() : key.toBase58();
          const isWritable = key.writable; // might be undefined in some parsed responses?
          
          // Debug specific candidate
          // if (keyAddr !== payerAddr) console.log(`   - Candidate: ${keyAddr} | Writable: ${isWritable}`);

          // Logic: Must be writable, and NOT the payer
          if (isWritable && keyAddr !== koraWallet.toBase58()) {
            accountsToCheck.add(keyAddr);
          }
        });
      }
    }

    const lastSignature = signatures[signatures.length - 1];
    if (lastSignature) before = lastSignature.signature;
    
    fetched += signatures.length;
    spinner.text = `Scanned ${fetched}/${limit} txs. Found ${accountsToCheck.size} candidates...`;
  }

  spinner.succeed(`Scan complete. Found ${accountsToCheck.size} potential accounts.`);
  return Array.from(accountsToCheck);
}