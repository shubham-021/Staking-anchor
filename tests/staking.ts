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

    await program.methods.initialize().accounts({
      payer: user.publicKey,
    }).signers([user]).rpc();

    const vaultAcc = await program.account.vaultAccount.fetch(vaultPda);
    const userAcc = await program.account.stakeAccount.fetch(userAccPda);

    assert.equal(vaultAcc.totalStaked.toNumber(),0);
    assert.equal(userAcc.amount.toNumber(),0);
  })

  it("Should fail when trying to unstake more than staked",async()=>{
    try {
      await program.methods.unstakeSol(new anchor.BN(1_000_000)).accounts({
        payer: user.publicKey
      }).signers([user]).rpc();

      assert.ok(false , "Should have thrown error");
    } catch (error:any) {
      console.log(error);
      assert.ok(error.toString().includes("InsufficientBalance"));
    }
  })

  it("It successfully stakes given amount",async()=>{})
});
