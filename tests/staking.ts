import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Staking } from "../target/types/staking";
import { assert } from "chai";

// yarn config set nodeLinker node-modules

describe("staking", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.staking as Program<Staking>;

  const user = anchor.web3.Keypair.generate();
  const admin = anchor.getProvider().wallet;

  let vaultPda: anchor.web3.PublicKey;
  let vaultBump: number;
  let userAccPda: anchor.web3.PublicKey;
  let userAccBump: number;

  before(async()=>{

    const signature = await provider.connection.requestAirdrop(user.publicKey,10*anchor.web3.LAMPORTS_PER_SOL);
    const {blockhash,lastValidBlockHeight} = await provider.connection.getLatestBlockhash();

    await provider.connection.confirmTransaction({signature,blockhash,lastValidBlockHeight},"confirmed");
    // type Commitment = "processed" | "confirmed" | "finalized" | "recent" | "single" | "singleGossip" | "root" | "max"

    [vaultPda,vaultBump] = anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("vault")],program.programId);
    [userAccPda,userAccBump] = anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("stake"),user.publicKey.toBuffer()],program.programId);

  });

  it("It initializes the vault and user stake account",async() => {

    await program.methods.initializeVault().accounts({
      admin: admin.publicKey
    }).rpc();

    await program.methods.initialize(new anchor.BN(5*anchor.web3.LAMPORTS_PER_SOL)).accounts({
      payer: user.publicKey,
    }).signers([user]).rpc();

    const vaultAcc = await program.account.vaultAccount.fetch(vaultPda);
    const userAcc = await program.account.stakeAccount.fetch(userAccPda);

    // console.log(vaultAcc.totalStaked);
    // console.log(userAcc.amount);

    assert.equal(vaultAcc.totalStaked.toNumber(),5*anchor.web3.LAMPORTS_PER_SOL);
    assert.equal(userAcc.amount.toNumber(),5*anchor.web3.LAMPORTS_PER_SOL);
  })

  it("Should fail when trying to unstake more than staked",async()=>{
    try {
      await program.methods.unstakeSol(new anchor.BN(6*anchor.web3.LAMPORTS_PER_SOL)).accounts({
        payer: user.publicKey
      }).signers([user]).rpc();

      assert.ok(false , "Should have thrown error");
    } catch (error:any) {
      // console.log(error);
      assert.ok(error.toString().includes("InsufficientBalance"));
    }
  })

  it("It successfully stakes given amount",async()=>{
    await program.methods.stakeSol(new anchor.BN(2*anchor.web3.LAMPORTS_PER_SOL)).accounts({
      payer:user.publicKey
    }).signers([user]).rpc();

    const vaultAcc = await program.account.vaultAccount.fetch(vaultPda);
    const userAcc = await program.account.stakeAccount.fetch(userAccPda);

    // console.log("Amount staked from vault: ",vaultAcc.totalStaked);
    // console.log("Amount staked from user: ",userAcc.amount);
    assert.equal(vaultAcc.totalStaked.toNumber(),7*anchor.web3.LAMPORTS_PER_SOL);
    assert.equal(userAcc.amount.toNumber(),7*anchor.web3.LAMPORTS_PER_SOL);
  })

  it("It should successfully unstake given amount",async()=>{
    await program.methods.unstakeSol(new anchor.BN(2*anchor.web3.LAMPORTS_PER_SOL)).accounts({
      payer:user.publicKey
    }).signers([user]).rpc();

    const vaultAcc = await program.account.vaultAccount.fetch(vaultPda);
    const userAcc = await program.account.stakeAccount.fetch(userAccPda);

    // console.log("Amount staked from vault: ",vaultAcc.totalStaked);
    // console.log("Amount staked from user: ",userAcc.amount);
    assert.equal(vaultAcc.totalStaked.toNumber(),5*anchor.web3.LAMPORTS_PER_SOL);
    assert.equal(userAcc.amount.toNumber(),5*anchor.web3.LAMPORTS_PER_SOL);
  })

  it("Staked amount is 5 , so after 2 second accumulated reward must be 20",async()=>{

    let userAcc = await program.account.stakeAccount.fetch(userAccPda);
    const before = userAcc.pendingReward.toNumber();
    console.log("Pending rewards before: ", userAcc.pendingReward.toString());
    console.log("Amount staked: ", userAcc.amount.toString());

    console.log("Waiting for 2s to pass.");
    await (() => new Promise((r) => setTimeout(r,2000)))();

    await program.methods.unstakeSol(new anchor.BN(2*anchor.web3.LAMPORTS_PER_SOL)).accounts({
      payer: user.publicKey
    }).signers([user]).rpc();
    
    userAcc = await program.account.stakeAccount.fetch(userAccPda);

    // assert.equal(vaultAcc.totalStaked.toNumber(),5*anchor.web3.LAMPORTS_PER_SOL);
    // assert.equal(userAcc.amount.toNumber(),5*anchor.web3.LAMPORTS_PER_SOL);
    console.log("Pending rewards after: ", userAcc.pendingReward.toString());
    const after = userAcc.pendingReward.toNumber();

    assert.equal(after-before,20*anchor.web3.LAMPORTS_PER_SOL);
  })
});
