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
exports.analyzeAccounts = analyzeAccounts;
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const fs = __importStar(require("fs"));
const ora_1 = __importDefault(require("ora"));
// Load whitelist if exists
const WHITELIST = fs.existsSync('whitelist.json')
    ? JSON.parse(fs.readFileSync('whitelist.json', 'utf-8'))
    : [];
async function analyzeAccounts(connection, authority, candidates) {
    const targets = [];
    const spinner = (0, ora_1.default)('Analyzing on-chain account state...').start();
    // Batch process to avoid rate limits (chunks of 100)
    for (let i = 0; i < candidates.length; i += 100) {
        const chunk = candidates.slice(i, i + 100).map(c => new web3_js_1.PublicKey(c));
        const infos = await connection.getMultipleAccountsInfo(chunk);
        for (let j = 0; j < infos.length; j++) {
            const info = infos[j];
            const pubkey = chunk[j];
            if (!info || !pubkey)
                continue;
            if (WHITELIST.includes(pubkey.toBase58()))
                continue;
            // Check Token Accounts
            if (info.owner.toBase58() === spl_token_1.TOKEN_PROGRAM_ID.toBase58()) {
                if (info.data.length === 165) {
                    targets.push({
                        pubkey,
                        type: 'TOKEN',
                        balance: info.lamports,
                        reason: 'Idle Token Account'
                    });
                }
            }
            // Check Nonce Accounts
            if (info.owner.toBase58() === web3_js_1.SystemProgram.programId.toBase58() && info.data.length === 80) {
                targets.push({
                    pubkey,
                    type: 'NONCE',
                    balance: info.lamports,
                    reason: 'Durable Nonce'
                });
            }
        }
    }
    spinner.succeed(`Analysis complete. Identified ${targets.length} reclaimable accounts.`);
    return targets;
}
