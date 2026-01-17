#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const web3_js_1 = require("@solana/web3.js");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const chalk_1 = __importDefault(require("chalk"));
const dotenv_1 = require("dotenv");
const scanner_1 = require("./scanner");
const analyzer_1 = require("./analyzer");
const sweeper_1 = require("./sweeper");
// Load .env file
(0, dotenv_1.config)();
const program = new commander_1.Command();
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
        console.log(chalk_1.default.green('✔ Created whitelist.json'));
    }
    else {
        console.log(chalk_1.default.yellow('⚠ whitelist.json already exists (skipped)'));
    }
    // 2. Create .env template
    if (!fs.existsSync('.env')) {
        const envContent = `KORA_RPC_URL=https://api.devnet.solana.com\nKORA_KEYPAIR_PATH=./kora-wallet.json`;
        fs.writeFileSync('.env', envContent);
        console.log(chalk_1.default.green('✔ Created .env file'));
    }
    else {
        console.log(chalk_1.default.yellow('⚠ .env already exists (skipped)'));
    }
    console.log(chalk_1.default.blue('\n✨ Setup complete! Edit .env to set your RPC and Keypair path.'));
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
        console.log(chalk_1.default.blue.bold(`\n🔍 Kora Rent Sweeper Initialized`));
        // 1. Resolve Configuration (Flag > Env > Default)
        const rpcUrl = options.rpc || process.env.KORA_RPC_URL || 'https://api.devnet.solana.com';
        const keypairPath = options.keypair || process.env.KORA_KEYPAIR_PATH;
        if (!keypairPath) {
            throw new Error("Keypair path is missing. Use -k or set KORA_KEYPAIR_PATH in .env");
        }
        // 2. Load Wallet
        const fullPath = path.resolve(process.cwd(), keypairPath);
        if (!fs.existsSync(fullPath))
            throw new Error(`Keypair file not found at: ${fullPath}`);
        const keypairData = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
        const wallet = web3_js_1.Keypair.fromSecretKey(new Uint8Array(keypairData));
        const connection = new web3_js_1.Connection(rpcUrl, "confirmed");
        console.log(`Operator: ${chalk_1.default.cyan(wallet.publicKey.toBase58())}`);
        console.log(`RPC: ${chalk_1.default.gray(rpcUrl)}`);
        console.log(`Mode: ${options.dryRun ? chalk_1.default.yellow('DRY RUN (Safe)') : chalk_1.default.red('LIVE EXECUTION')}`);
        let potentialAccounts = [];
        // Logic: Target Mode vs Scan Mode
        if (options.target) {
            console.log(chalk_1.default.magenta(`\n🎯 Sniper Mode: Targeting specific account`));
            console.log(`Checking: ${options.target}`);
            potentialAccounts = [options.target];
        }
        else {
            potentialAccounts = await (0, scanner_1.scanHistory)(connection, wallet.publicKey, parseInt(options.limit));
        }
        if (potentialAccounts.length === 0) {
            console.log(chalk_1.default.yellow(`\n⚠️ No accounts found to analyze.`));
            return;
        }
        const targets = await (0, analyzer_1.analyzeAccounts)(connection, wallet.publicKey, potentialAccounts);
        if (targets.length === 0) {
            console.log(chalk_1.default.green(`\n✨ No idle rent found.`));
            return;
        }
        await (0, sweeper_1.sweepAccounts)(connection, wallet, targets, options.dryRun);
    }
    catch (e) {
        console.error(chalk_1.default.red(`\n❌ Error: ${e.message}`));
    }
});
program.parse(process.argv);
