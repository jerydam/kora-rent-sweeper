import { Connection, Keypair, Transaction, SystemProgram, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { createCloseAccountInstruction } from '@solana/spl-token';
import Table from 'cli-table3';
import chalk from 'chalk';
import { SweepTarget } from './analyzer';

export async function sweepAccounts(
  connection: Connection,
  wallet: Keypair,
  targets: SweepTarget[],
  dryRun: boolean
) {
   if (!targets || targets.length === 0) {
    console.log(chalk.yellow("No accounts to sweep."));
    return;
  }

  const table = new Table({
    head: ['Type', 'Address', 'Rent (SOL)', 'Status'],
    style: { head: ['cyan'] }
  });

  let totalReclaimed = 0;
  let successCount = 0;

  console.log(`\nProcessing ${targets.length} accounts...`);

  for (const target of targets) {
    let tx = new Transaction();

    // Build Instruction
    if (target.type === 'TOKEN') {
      tx.add(createCloseAccountInstruction(target.pubkey, wallet.publicKey, wallet.publicKey));
    } else if (target.type === 'NONCE') {
      tx.add(SystemProgram.nonceWithdraw({
        noncePubkey: target.pubkey,
        authorizedPubkey: wallet.publicKey,
        toPubkey: wallet.publicKey,
        lamports: target.balance
      }));
    }

    // SIMULATION
    try {
      tx.feePayer = wallet.publicKey;
      const latestBlockhash = await connection.getLatestBlockhash();
      tx.recentBlockhash = latestBlockhash.blockhash;
      
      const simulation = await connection.simulateTransaction(tx);
      
      if (simulation.value.err) {
        continue; 
      }

      // EXECUTION
      if (dryRun) {
        table.push([target.type, target.pubkey.toBase58(), (target.balance / LAMPORTS_PER_SOL).toFixed(4), chalk.yellow('DRY RUN')]);
        totalReclaimed += target.balance;
      } else {
        const sig = await connection.sendTransaction(tx, [wallet]);
        await connection.confirmTransaction(sig);
        table.push([target.type, target.pubkey.toBase58(), (target.balance / LAMPORTS_PER_SOL).toFixed(4), chalk.green('RECLAIMED')]);
        totalReclaimed += target.balance;
        successCount++;
      }

    } catch (e) {
       console.log(chalk.red(`Failed to process ${target.pubkey.toBase58()}`));
    }
  }

  console.log(table.toString());
  
  const statusColor = dryRun ? chalk.yellow : chalk.green;
  console.log(statusColor(`\n💰 Total Recoverable Rent: ${(totalReclaimed / LAMPORTS_PER_SOL).toFixed(4)} SOL`));
  if (!dryRun) console.log(chalk.gray(`Successfully swept ${successCount} accounts.`));
}