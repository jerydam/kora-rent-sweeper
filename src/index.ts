#!/usr/bin/env node
import { Command } from 'commander';
import { Connection, Keypair } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { config } from 'dotenv';
import { scanHistory } from './scanner';
import { analyzeAccounts } from './analyzer';
import { sweepAccounts } from './sweeper';

// Load .env file
config();

const program = new Command();

program
  .name('kora-sweeper')
  .description('💸 Automated Rent Reclaim for Kora Nodes')
  .version('1.0.0');

// --- NEW COMMAND: INIT ---
program
  .command('init')
  .description('Create configuration files (whitelist.json, .env)')
  .action(() => {
    // 1. Create whitelist.json
    if (!fs.existsSync('whitelist.json')) {
      fs.writeFileSync('whitelist.json', JSON.stringify([], null, 2));
      console.log(chalk.green('✔ Created whitelist.json'));
    } else {
      console.log(chalk.yellow('⚠ whitelist.json already exists (skipped)'));
    }

    // 2. Create .env template
    if (!fs.existsSync('.env')) {
      const envContent = `KORA_RPC_URL=https://api.devnet.solana.com\nKORA_KEYPAIR_PATH=./kora-wallet.json`;
      fs.writeFileSync('.env', envContent);
      console.log(chalk.green('✔ Created .env file'));
    } else {
      console.log(chalk.yellow('⚠ .env already exists (skipped)'));
    }

    console.log(chalk.blue('\n✨ Setup complete! Edit .env to set your RPC and Keypair path.'));
  });

// --- UPDATED COMMAND: SWEEP ---
program
  .command('sweep')
  .description('Analyze and reclaim rent from idle accounts')
  // Make options optional if they exist in .env
  .option('-k, --keypair <path>', 'Path to Kora Operator Keypair (JSON)')
  .option('-r, --rpc <url>', 'RPC URL')
  .option('-d, --dry-run', 'Simulate only (no transactions sent)', false)
  .option('-l, --limit <number>', 'Number of past transactions to scan', '1000')
  .option('-t, --target <pubkey>', 'Specific account to sweep') 
  .action(async (options) => {
    try {
      console.log(chalk.blue.bold(`\n🔍 Kora Rent Sweeper Initialized`));
      
      // 1. Resolve Configuration (Flag > Env > Default)
      const rpcUrl = options.rpc || process.env.KORA_RPC_URL || 'https://api.devnet.solana.com';
      const keypairPath = options.keypair || process.env.KORA_KEYPAIR_PATH;

      if (!keypairPath) {
        throw new Error("Keypair path is missing. Use -k or set KORA_KEYPAIR_PATH in .env");
      }

      // 2. Load Wallet
      const fullPath = path.resolve(process.cwd(), keypairPath);
      if (!fs.existsSync(fullPath)) throw new Error(`Keypair file not found at: ${fullPath}`);
      
      const keypairData = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
      const wallet = Keypair.fromSecretKey(new Uint8Array(keypairData));
      
      const connection = new Connection(rpcUrl, "confirmed");

      console.log(`Operator: ${chalk.cyan(wallet.publicKey.toBase58())}`);
      console.log(`RPC: ${chalk.gray(rpcUrl)}`);
      console.log(`Mode: ${options.dryRun ? chalk.yellow('DRY RUN (Safe)') : chalk.red('LIVE EXECUTION')}`);

      let potentialAccounts: string[] = [];

      // Logic: Target Mode vs Scan Mode
      if (options.target) {
        console.log(chalk.magenta(`\n🎯 Sniper Mode: Targeting specific account`));
        console.log(`Checking: ${options.target}`);
        potentialAccounts = [options.target];
      } else {
        potentialAccounts = await scanHistory(connection, wallet.publicKey, parseInt(options.limit));
      }

      if (potentialAccounts.length === 0) {
        console.log(chalk.yellow(`\n⚠️ No accounts found to analyze.`));
        return;
      }

      const targets = await analyzeAccounts(connection, wallet.publicKey, potentialAccounts);

      if (targets.length === 0) {
        console.log(chalk.green(`\n✨ No idle rent found.`));
        return;
      }

      await sweepAccounts(connection, wallet, targets, options.dryRun);

    } catch (e: any) {
      console.error(chalk.red(`\n❌ Error: ${e.message}`));
    }
  });

program.parse(process.argv);