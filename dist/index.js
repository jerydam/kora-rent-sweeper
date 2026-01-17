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
const chalk_1 = __importDefault(require("chalk"));
const scanner_1 = require("./scanner");
const analyzer_1 = require("./analyzer");
const sweeper_1 = require("./sweeper");
const program = new commander_1.Command();
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
    .option('-t, --target <pubkey>', 'Specific account to sweep (skips history scan)') // <--- NEW FEATURE
    .action(async (options) => {
    try {
        console.log(chalk_1.default.blue.bold(`\n🔍 Kora Rent Sweeper Initialized`));
        const keypairData = JSON.parse(fs.readFileSync(options.keypair, 'utf-8'));
        const wallet = web3_js_1.Keypair.fromSecretKey(new Uint8Array(keypairData));
        // Use 'confirmed' commitment for faster devnet reads
        const connection = new web3_js_1.Connection(options.rpc, "confirmed");
        console.log(`Operator: ${chalk_1.default.cyan(wallet.publicKey.toBase58())}`);
        console.log(`Mode: ${options.dryRun ? chalk_1.default.yellow('DRY RUN (Safe)') : chalk_1.default.red('LIVE EXECUTION')}`);
        let potentialAccounts = [];
        // --- LOGIC CHANGE: Target Mode vs Scan Mode ---
        if (options.target) {
            console.log(chalk_1.default.magenta(`\n🎯 Sniper Mode: Targeting specific account`));
            console.log(`Checking: ${options.target}`);
            potentialAccounts = [options.target];
        }
        else {
            // Standard Scan Mode
            potentialAccounts = await (0, scanner_1.scanHistory)(connection, wallet.publicKey, parseInt(options.limit));
        }
        if (potentialAccounts.length === 0) {
            console.log(chalk_1.default.yellow(`\n⚠️ No accounts found to analyze.`));
            if (!options.target)
                console.log(chalk_1.default.gray(`Tip: Public Devnet is slow. Try using --target <ADDRESS> to check a specific account.`));
            return;
        }
        // 3. Analyze State (Judge)
        const targets = await (0, analyzer_1.analyzeAccounts)(connection, wallet.publicKey, potentialAccounts);
        if (targets.length === 0) {
            console.log(chalk_1.default.green(`\n✨ No idle rent found. Your node is clean!`));
            return;
        }
        // 4. Sweep (Executioner)
        await (0, sweeper_1.sweepAccounts)(connection, wallet, targets, options.dryRun);
    }
    catch (e) {
        console.error(chalk_1.default.red(`\n❌ Error: ${e.message}`));
    }
});
program.parse(process.argv);
