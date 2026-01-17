# 🧹 Kora Rent Sweeper

**Stop the silent capital leak. Automate rent recovery for your Kora Node.**

## 📖 Overview
Kora acts as a powerful infrastructure layer for Solana apps, sponsoring transactions to improve user experience. However, this convenience comes with a hidden operational cost: **Rent Debris**.

When a Kora node operates, it often creates on-chain state that eventually becomes obsolete:
1.  **Durable Nonce Accounts:** Created to manage transaction concurrency but often abandoned after use.
2.  **Temporary Token Accounts:** Created for users during onboarding but left empty and unused.
3.  **Buffer Accounts:** Transient state used during complex flows.

Each of these accounts locks approximately **0.002 SOL** to remain rent-exempt. For a high-volume operator, thousands of these accounts can accumulate, locking significant treasury funds on-chain indefinitely.

**Kora Rent Sweeper** is an open-source, automated tool designed to identify these abandoned accounts and safely reclaim the locked SOL back to the operator's treasury.

---

## 🚀 Key Features

* **⚡ Zero-Friction Setup:** Includes an `init` command to automatically generate config files.
* **🤖 Dual Interface:** Run it via **Terminal CLI** or control it via **Telegram Bot**.
* **🎯 Sniper Mode:** Instantly target and clean specific accounts (bypasses RPC indexing lag).
* **🛡️ Simulation-First Architecture:** Every reclaim transaction is simulated on-chain before sending. If the bot cannot prove it is safe to close, it will **never** execute.
* **🧪 Dry Run Mode:** Audit your node without touching the blockchain.
* **🕵️ Deep History Scan:** Automatically crawls your node's transaction history to find every account you have ever funded.

---

## ⚙️ Architecture



The bot operates in three distinct phases:

### 1. The Watcher (Discovery)
It connects to the Solana RPC and scans the transaction history of your Kora Node (the Fee Payer).
* **Method:** `getSignaturesForAddress`
* **Logic:** Identifies transactions where your node paid the gas fee and extracts writable accounts.

### 2. The Judge (Analysis)
It fetches the current on-chain state of the candidate accounts using `getMultipleAccountsInfo`.
* **Token Accounts:** Checks if the program owner is the SPL Token Program and if balance is 0.
* **Nonce Accounts:** Checks if owned by System Program and matches Nonce size (80 bytes).
* **Authority Check:** Verifies if the Kora Node has the authority to close the account.

### 3. The Executioner (Sweep)
It constructs the cleanup transaction.
* **Instruction:** Uses `TokenProgram.closeAccount` or `SystemProgram.withdrawNonceAccount`.
* **Safety:** Runs `connection.simulateTransaction(tx)`. If simulation fails, the bot skips the account.
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

### 2. Build & Link

Compiles the TypeScript source code and links the binary globally.

```bash
npm run build
npm link

```

### 3. Initialize Configuration

Run the setup wizard to create your `.env` and `whitelist.json` files automatically.

```bash
kora-sweeper init

```

### 4. Configure Environment

Edit the newly created `.env` file:

```env
KORA_RPC_URL=https://api.devnet.solana.com
KORA_KEYPAIR_PATH=./kora-wallet.json
TELEGRAM_BOT_TOKEN=your_token_here

```

---

## 💻 Usage: CLI Mode

Once configured, you can run the bot directly from your terminal.

**Option A: The "Safe Audit" (Dry Run)**
*Scans past transactions to find leaks without touching funds.*

```bash
kora-sweeper sweep --dry-run

```

**Option B: The "Sniper Shot" (Target Mode) ⚡**
*Instantly cleans a specific account. Best for known leaks.*

```bash
kora-sweeper sweep --target <ADDRESS>

```

**Option C: The "Live Sweep" (Real Money) 💰**
*Executes the reclaim transaction.*

```bash
kora-sweeper sweep

```

---

## 🤖 Usage: Telegram Bot Mode

We host a live demo of the bot that you can test immediately without installing code.

### 1. Access the Bot

Search for **@Mykorasweeper_bot** on Telegram.
*(Or click here: [t.me/Mykorasweeper_bot](https://t.me/Mykorasweeper_bot)*

### 2. Start & Login

Click **Start**. The bot will ask you to login to a session.
*⚠️ **Security Note:** For this Hackathon demo, please use a **Devnet Burner Wallet**. Do not use your mainnet keys.*

```text
/login [your_private_key_array...]

```

*(The bot will auto-delete your key message immediately for safety).*

### 3. Available Commands

* `/start` - Welcome & Instructions
* `/seed` - 🌱 **Create Leak:** Instantly creates a "junk" rent account to test the sweeper.
* `/target <addr>` - 🎯 **Check:** Audits a specific account address.
* `/claim <addr>` - 💰 **Reclaim:** Sweeps the rent back to your burner wallet.

---

## 🧪 Demo Workflow (Try it yourself)

To see the bot in action, we have included a script that intentionally creates a "leaked" rent account.

**1. Create the Leak**

```bash
# CLI Way:
npx ts-node src/seed.ts

# Telegram Way:
/seed

```

*Output: `✅ Success! Leaked 0.0020 SOL into account: B9xd...*`

**2. Reclaim the Leak**

```bash
# CLI Way:
kora-sweeper sweep --target B9xd...

# Telegram Way:
/claim B9xd...

```

*Result: The 0.002 SOL is returned to your wallet.*

---

## 🛡️ Safety & Security

* **Non-Custodial Logic:** The bot only closes *empty* accounts or withdraws *rent*.
* **Simulation Guard:** We ask the chain "Would this transaction succeed?" before signing it.
* **Burner Wallets:** For the Telegram demo, we enforce the use of Devnet Burner wallets and auto-delete private keys from chat history immediately.

## 📄 License

MIT License