import { Command } from 'commander';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import * as fs from 'fs';
import chalk from 'chalk';
import { scanHistory } from './scanner';
import { analyzeAccounts } from './analyzer';
import { sweepAccounts } from './sweeper';

const program = new Command();

program
  .name('kora-sweeper')
  .description('💸 Automated Rent Reclaim for Kora Nodes')
  .version('1.0.0');

program
  .command('sweep')
  .description('Analyze and reclaim rent from idle accounts')
  .requiredOption('-k, --keypair <path>', 'Path to Kora Operator Keypair (JSON)')
  .option('-r, --rpc <url>', 'RPC URL', 'https://api.devnet.solana.com')
  .option('-d, --dry-run', 'Simulate only (no transactions sent)', false)
  .option('-l, --limit <number>', 'Number of past transactions to scan', '1000')
  .option('-t, --target <pubkey>', 'Specific account to sweep (skips history scan)') 
  .action(async (options) => {
    try {
      console.log(chalk.blue.bold(`\n🔍 Kora Rent Sweeper Initialized`));
      
      const keypairData = JSON.parse(fs.readFileSync(options.keypair, 'utf-8'));
      const wallet = Keypair.fromSecretKey(new Uint8Array(keypairData));
      
      const connection = new Connection(options.rpc, "confirmed");

      console.log(`Operator: ${chalk.cyan(wallet.publicKey.toBase58())}`);
      console.log(`Mode: ${options.dryRun ? chalk.yellow('DRY RUN (Safe)') : chalk.red('LIVE EXECUTION')}`);

      let potentialAccounts: string[] = [];

      // --- SNIPER MODE: Skips the rate-limited scan ---
      if (options.target) {
        console.log(chalk.magenta(`\n🎯 Sniper Mode: Targeting specific account`));
        console.log(`Checking: ${options.target}`);
        potentialAccounts = [options.target];
      } else {
        // Standard Scan Mode (Will hit 429s on public RPCs)
        potentialAccounts = await scanHistory(connection, wallet.publicKey, parseInt(options.limit));
      }

      if (potentialAccounts.length === 0) {
        console.log(chalk.yellow(`\n⚠️ No accounts found to analyze.`));
        return;
      }

      // Analyze
      const targets = await analyzeAccounts(connection, wallet.publicKey, potentialAccounts);

      if (targets.length === 0) {
        console.log(chalk.green(`\n✨ No idle rent found.`));
        return;
      }

      // Sweep
      await sweepAccounts(connection, wallet, targets, options.dryRun);

    } catch (e: any) {
      console.error(chalk.red(`\n❌ Error: ${e.message}`));
    }
  });

program.parse(process.argv);