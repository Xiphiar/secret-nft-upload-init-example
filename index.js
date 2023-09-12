import { Wallet, SecretNetworkClient, MsgSend, MsgMultiSend } from "secretjs";
import secureRandom from 'secure-random'
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

const node_url = "https://pulsar.api.trivium.network:1317";
const chain_id = 'pulsar-3'

async function main() {
    if (!process.env.MNEMONIC) throw 'ENV variable MNEMONIC is not defined!'

    const wallet = new Wallet(process.env.MNEMONIC);
    const walletAddress = wallet.address;

    console.log('Wallet Address:', walletAddress)
    
    // To create a signer secret.js client
    const secretjs = new SecretNetworkClient({
      url: node_url,
      chainId: chain_id,
      wallet,
      walletAddress,
    });
    
    // Upload the snip721 WASM.
    // Secretjs 1.0+ can upload either uncompressed or gz compressed wasm files.
    const wasm = fs.readFileSync("contract.wasm.gz");
    console.log("Uploading contract");

    let tx = await secretjs.tx.compute.storeCode(
        {
            sender: wallet.address,
            wasm_byte_code: wasm,
            source: "",
            builder: "",
        },
        {
            gasLimit: 5_000_000,
        }
    );
 
    // Ensure TX error code is 0 (no error)
    if (tx.code) throw tx.rawLog

    // Uploaded code's ID, used to instantiate contracts
    const codeId = Number(
        tx.arrayLog.find((log) => log.type === "message" && log.key === "code_id")
          .value
    );
    
    // contract hash, improves instantiate performance
    const contractCodeHash = (await secretjs.query.compute.codeHashByCodeId({code_id: codeId})).code_hash;
    console.log(`Contract hash: ${contractCodeHash}`);

    // Create an instance of the Counter contract, providing a starting count
    const initMsg = {
        // name of token contract
        name: 'My NFT Collection',

        // token contract symbol
        symbol: 'MYNFT',

        // optional admin address, env.message.sender if missing
        admin: walletAddress,

        // randomness used as entropy for prng seed
        entropy: Buffer.from(secureRandom(32, { type: "Uint8Array" })).toString("base64"),

        // For details see: https://github.com/baedrik/snip721-reference-impl#instantiating-the-token-contract
        config: {
            public_token_supply: false,
            public_owner: false,
            enable_sealed_metadata: false,
            unwrapped_metadata_is_private: true,
            minter_may_update_metadata: false,
            owner_may_update_metadata: false,
            enable_burn: false,
        }
    };

    // Instantiate a new SNIP721 contract
    tx = await secretjs.tx.compute.instantiateContract(
        {
            code_id: codeId,
            sender: walletAddress,
            code_hash: contractCodeHash,
            init_msg: initMsg,
            // Label for the contract, must be unique, we add some randomness here to ensure that
            label: "My NFT Collection" + Math.ceil(Math.random() * 10000),
        },
        {
            gasLimit: 1_000_000,
        }
    );

    // Ensure Instantiate TX error code is 0 (no error)
    if (tx.code) throw tx.rawLog

    //Find the contract_address in the logs
    const contractAddress = tx.arrayLog.find(
        (log) => log.type === "message" && log.key === "contract_address"
    ).value;
    console.log(`Contract Address: ${contractAddress}`);

    // Query the current number of tokens
    console.log("Querying contract for contract info");
    const { contract_info } = await secretjs.query.compute.queryContract({
        contract_address: contractAddress,
        code_hash: contractCodeHash,
        query: { contract_info: {} },
    });

    console.log(`Contract Info=${JSON.stringify(contract_info)}`);
};

main().catch(e=>console.error(e));