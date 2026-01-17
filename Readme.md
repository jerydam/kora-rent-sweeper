# 🧹 Kora Rent Sweeper

**Stop the silent capital leak. Automate rent recovery for your Kora Node.**

## 📖 Overview
Kora acts as a powerful infrastructure layer for Solana apps, sponsoring transactions to improve user experience. However, this convenience comes with a hidden operational cost: **Rent Debris**.

When a Kora node operates, it often creates on-chain state that eventually becomes obsolete:
1.  **Durable Nonce Accounts:** Created to manage transaction concurrency but often abandoned after use.
2.  **Temporary Token Accounts:** Created for users during onboarding but left empty and unused.
3.  **Buffer Accounts:** Transient state used during complex flows.

Each of these accounts locks approximately **0.002 SOL** to remain rent-exempt. For a high-volume operator, thousands of these accounts can accumulate, locking significant treasury funds on-chain indefinitely.

**Kora Rent Sweeper** is an open-source, automated CLI bot designed to identify these abandoned accounts and safely reclaim the locked SOL back to the operator's treasury.

---

## 🚀 Key Features

* **🎯 Sniper Mode:** Instantly target and clean specific accounts (bypasses RPC indexing lag).
* **🛡️ Simulation-First Architecture:** Every reclaim transaction is simulated on-chain before sending. If the bot cannot prove it is safe to close (e.g., non-zero balance, wrong authority), it will **never** execute.
* **🧪 Dry Run Mode:** Audit your node without touching the blockchain. See exactly how much SOL is recoverable.
* **📜 Whitelist Support:** Protect specific accounts from ever being touched via `whitelist.json`.
* **🕵️ Deep History Scan:** Automatically crawls your node's transaction history to find every account you have ever funded.

---

## ⚙️ Architecture

The bot operates in three distinct phases:

### 1. The Watcher (Discovery)
It connects to the Solana RPC and scans the transaction history of your Kora Node (the Fee Payer).
* **Method:** `getSignaturesForAddress`
* **Logic:** It identifies every transaction where your node paid the gas fee and extracts the writable accounts created in that transaction.
* **Sniper Mode:** Alternatively, you can bypass scanning and provide a specific target address directly via `--target`.

### 2. The Judge (Analysis)
It fetches the current on-chain state of the candidate accounts using `getMultipleAccountsInfo`.
* **Token Accounts:** Checks if the program owner is the SPL Token Program and if the balance is exactly 0.
* **Nonce Accounts:** Checks if the account is owned by the System Program and matches the Nonce size (80 bytes).
* **Authority Check:** Verifies if the Kora Node has the authority to close the account.

### 3. The Executioner (Sweep)
It constructs the cleanup transaction.
* **Instruction:** Uses `TokenProgram.closeAccount` or `SystemProgram.withdrawNonceAccount`.
* **Safety:** It runs `connection.simulateTransaction(tx)`. If the simulation fails (meaning the network rejects the closure), the bot skips the account.
* **Reclaim:** If successful, the rent SOL is transferred back to the Kora Node wallet.

---

## 🛠️ Installation & Setup

### Prerequisites
* Node.js (v16+)
* npm or pnpm

### 1. Clone and Install
```bash
git clone https://github.com/jerydam/kora-rent-sweeper.git
cd kora-rent-sweeper
npm install

```

### 2. Build

Compiles the TypeScript source code into executable JavaScript.

```bash
npm run build

```

### 3. Configuration

**Wallet:** You need the file path to your Kora Node's keypair (e.g., `kora-wallet.json`).

**Whitelist (Optional):** Create a `whitelist.json` file in the root directory to ignore specific addresses.

```json
[
  "AccountAddressToIgnore1",
  "AccountAddressToIgnore2"
]

```

---

## 💻 How to Run It

You can run the bot in three modes depending on your needs.

### Option A: The "Safe Audit" (Dry Run)

*Best for: Checking your node's entire history without touching funds.*
This scans your past transactions to find leaks. On public Devnet, this might be slow or hit rate limits (429 errors).

```bash
npm run sweep -- -k kora-wallet.json --dry-run

```

### Option B: The "Sniper Shot" (Target Mode) ⚡

*Best for: Instantly cleaning a specific account you know is empty.*
This bypasses the slow history scan and goes straight to the account. Useful if RPC indexing is lagging.

```bash
# Replace with the specific address you want to clean
npm run sweep -- -k kora-wallet.json --target <ADDRESS> --dry-run

```

### Option C: The "Live Sweep" (Real Money) 💰

*Best for: Actually getting the SOL back.*
Remove the `--dry-run` flag to execute the transaction.

```bash
npm run sweep -- -k kora-wallet.json --target <ADDRESS>

```

---

## 🧪 Demo / Testing (Reproduce the Issue)

To see the bot in action, we have included a script that intentionally creates a "leaked" rent account (an empty Token Account funded by your wallet).

**1. Create the Leak**
Run the seed script. It will print the address of the new "junk" account.

```bash
npx ts-node src/seed.ts

```

*Output: `✅ Success! Leaked 0.0020 SOL into account: B9xd...*`

**2. Detect the Leak**
Run the sweeper in dry-run mode targeting that address.

```bash
npm run sweep -- -k kora-wallet.json --target <ADDRESS_FROM_STEP_1> --dry-run

```

**3. Reclaim the Leak**
Run the sweeper in live mode to get your money back.

```bash
npm run sweep -- -k kora-wallet.json --target <ADDRESS_FROM_STEP_1>

```


## 🛡️ Safety & Security

* **Non-Custodial Logic:** The bot does not transfer tokens. It only closes *empty* accounts or withdraws *rent*.
* **Simulation Guard:** The core safety feature is the `simulateTransaction` check. We do not rely on local logic alone; we ask the chain "Would this transaction succeed?" before signing it.
* **Open Source:** The code is transparent. Operators can verify exactly what instructions are being built in `src/sweeper.ts`.

## 📄 License

MIT License
