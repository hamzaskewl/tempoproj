import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  Ed25519Program,
  Transaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import * as nacl from "tweetnacl";
import { expect } from "chai";
import { ClippyMarket } from "../target/types/clippy_market";

const FEE_BPS = 200; // 2%
const MOOD_HYPE = 0;
const USDC_DECIMALS = 6;

function encodeChannel(name: string): Buffer {
  const buf = Buffer.alloc(32, 0);
  Buffer.from(name.toLowerCase(), "ascii").copy(buf);
  return buf;
}

function buildAttestationMessage(
  channel: Buffer,
  mood: number,
  windowStart: number,
  windowEnd: number,
): Buffer {
  const msg = Buffer.alloc(66);
  Buffer.from("clippy-attest-v1", "ascii").copy(msg, 0);
  channel.copy(msg, 16);
  msg[48] = mood;
  msg.writeBigInt64LE(BigInt(windowStart), 49);
  msg.writeBigInt64LE(BigInt(windowEnd), 57);
  msg[65] = 1;
  return msg;
}

describe("clippy_market", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.clippyMarket as Program<ClippyMarket>;
  const connection = provider.connection;
  const authority = (provider.wallet as anchor.Wallet).payer;

  const oracle = Keypair.generate();
  const alice = Keypair.generate();
  const bob = Keypair.generate();

  let usdcMint: PublicKey;
  let aliceUsdc: PublicKey;
  let bobUsdc: PublicKey;
  let feeRecipient: Keypair;
  let feeRecipientUsdc: PublicKey;

  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId,
  );

  function marketPda(channel: Buffer, mood: number, windowStart: number): [PublicKey, number] {
    const ws = Buffer.alloc(8);
    ws.writeBigInt64LE(BigInt(windowStart));
    return PublicKey.findProgramAddressSync(
      [Buffer.from("market"), channel, Buffer.from([mood]), ws],
      program.programId,
    );
  }

  function escrowPda(market: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), market.toBuffer()],
      program.programId,
    );
  }

  function positionPda(market: PublicKey, user: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("position"), market.toBuffer(), user.toBuffer()],
      program.programId,
    );
  }

  async function airdrop(pubkey: PublicKey, sol = 5) {
    const sig = await connection.requestAirdrop(pubkey, sol * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig);
  }

  async function mintUsdc(ata: PublicKey, amount: number) {
    await mintTo(connection, authority, usdcMint, ata, authority, amount);
  }

  before(async () => {
    await airdrop(alice.publicKey, 5);
    await airdrop(bob.publicKey, 5);

    usdcMint = await createMint(
      connection,
      authority,
      authority.publicKey,
      null,
      USDC_DECIMALS,
    );

    aliceUsdc = (await getOrCreateAssociatedTokenAccount(
      connection,
      authority,
      usdcMint,
      alice.publicKey,
    )).address;
    bobUsdc = (await getOrCreateAssociatedTokenAccount(
      connection,
      authority,
      usdcMint,
      bob.publicKey,
    )).address;

    feeRecipient = Keypair.generate();
    feeRecipientUsdc = (await getOrCreateAssociatedTokenAccount(
      connection,
      authority,
      usdcMint,
      feeRecipient.publicKey,
    )).address;

    await mintUsdc(aliceUsdc, 1_000_000_000);
    await mintUsdc(bobUsdc, 1_000_000_000);
  });

  it("initialize", async () => {
    await program.methods
      .initialize(oracle.publicKey, FEE_BPS)
      .accounts({
        config: configPda,
        authority: authority.publicKey,
        usdcMint,
        feeRecipient: feeRecipient.publicKey,
        systemProgram: SystemProgram.programId,
      } as any)
      .rpc();

    const cfg = await program.account.config.fetch(configPda);
    expect(cfg.oracle.toBase58()).to.eq(oracle.publicKey.toBase58());
    expect(cfg.feeBps).to.eq(FEE_BPS);
    expect(cfg.usdcMint.toBase58()).to.eq(usdcMint.toBase58());
  });

  async function createMarket(channelName: string, mood: number, wsOffset: number, weOffset: number) {
    const channel = encodeChannel(channelName);
    const now = Math.floor(Date.now() / 1000);
    const windowStart = now + wsOffset;
    const windowEnd = now + weOffset;
    const [market] = marketPda(channel, mood, windowStart);
    const [escrow] = escrowPda(market);

    await program.methods
      .createMarket(Array.from(channel) as any, mood, new BN(windowStart), new BN(windowEnd))
      .accounts({
        config: configPda,
        authority: authority.publicKey,
        market,
        escrow,
        usdcMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      } as any)
      .rpc();

    return { market, escrow, channel, windowStart, windowEnd };
  }

  async function placeBet(
    user: Keypair,
    userUsdc: PublicKey,
    market: PublicKey,
    escrow: PublicKey,
    side: 0 | 1,
    amount: number,
  ) {
    const [position] = positionPda(market, user.publicKey);
    await program.methods
      .placeBet(side, new BN(amount))
      .accounts({
        config: configPda,
        market,
        escrow,
        position,
        user: user.publicKey,
        userUsdc,
        usdcMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      } as any)
      .signers([user])
      .rpc();
    return position;
  }

  function attest(channel: Buffer, mood: number, ws: number, we: number, signer: Keypair) {
    const message = buildAttestationMessage(channel, mood, ws, we);
    const signature = nacl.sign.detached(message, signer.secretKey);
    const ed25519Ix = Ed25519Program.createInstructionWithPublicKey({
      publicKey: signer.publicKey.toBytes(),
      message,
      signature,
    });
    return { message, signature, ed25519Ix };
  }

  it("happy path: bet yes+no, attest, winner claims, loser gets nothing, double-claim rejected", async () => {
    const { market, escrow, channel, windowStart, windowEnd } = await createMarket(
      "happypath",
      MOOD_HYPE,
      -5,
      120,
    );

    const alicePos = await placeBet(alice, aliceUsdc, market, escrow, 1, 100_000_000);
    const bobPos = await placeBet(bob, bobUsdc, market, escrow, 0, 50_000_000);

    const { ed25519Ix } = attest(channel, MOOD_HYPE, windowStart, windowEnd, oracle);
    const resolveIx = await program.methods
      .resolveWithReport(0)
      .accounts({
        config: configPda,
        market,
        payer: authority.publicKey,
        ixSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
      } as any)
      .instruction();

    await provider.sendAndConfirm(new Transaction().add(ed25519Ix).add(resolveIx), [authority]);

    const m = await program.account.market.fetch(market);
    expect(m.state).to.have.property("resolvedYes");

    const aliceBefore = (await getAccount(connection, aliceUsdc)).amount;
    await program.methods
      .claim()
      .accounts({
        config: configPda,
        market,
        escrow,
        position: alicePos,
        user: alice.publicKey,
        userUsdc: aliceUsdc,
        feeRecipientAta: feeRecipientUsdc,
        usdcMint,
        tokenProgram: TOKEN_PROGRAM_ID,
      } as any)
      .signers([alice])
      .rpc();

    const aliceAfter = (await getAccount(connection, aliceUsdc)).amount;
    expect(Number(aliceAfter - aliceBefore)).to.eq(149_000_000);

    expect(Number((await getAccount(connection, feeRecipientUsdc)).amount)).to.eq(1_000_000);

    const bobBefore = (await getAccount(connection, bobUsdc)).amount;
    await program.methods
      .claim()
      .accounts({
        config: configPda,
        market,
        escrow,
        position: bobPos,
        user: bob.publicKey,
        userUsdc: bobUsdc,
        feeRecipientAta: feeRecipientUsdc,
        usdcMint,
        tokenProgram: TOKEN_PROGRAM_ID,
      } as any)
      .signers([bob])
      .rpc();
    expect(Number((await getAccount(connection, bobUsdc)).amount - bobBefore)).to.eq(0);

    try {
      await program.methods
        .claim()
        .accounts({
          config: configPda,
          market,
          escrow,
          position: alicePos,
          user: alice.publicKey,
          userUsdc: aliceUsdc,
          feeRecipientAta: feeRecipientUsdc,
          usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
        } as any)
        .signers([alice])
        .rpc();
      expect.fail("double-claim should have failed");
    } catch (err: any) {
      expect(err.toString()).to.match(/AlreadyClaimed/);
    }
  });

  it("rejects bets after window_end", async () => {
    const { market, escrow } = await createMarket("late", MOOD_HYPE, -30, -1);
    try {
      await placeBet(alice, aliceUsdc, market, escrow, 1, 10_000_000);
      expect.fail("bet after window_end should have failed");
    } catch (err: any) {
      expect(err.toString()).to.match(/WindowClosed/);
    }
  });

  it("rejects resolve with wrong oracle signer", async () => {
    const { market, channel, windowStart, windowEnd } = await createMarket(
      "wrongsigner",
      MOOD_HYPE,
      -5,
      120,
    );
    const imposter = Keypair.generate();
    const { ed25519Ix } = attest(channel, MOOD_HYPE, windowStart, windowEnd, imposter);
    const resolveIx = await program.methods
      .resolveWithReport(0)
      .accounts({
        config: configPda,
        market,
        payer: authority.publicKey,
        ixSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
      } as any)
      .instruction();
    try {
      await provider.sendAndConfirm(new Transaction().add(ed25519Ix).add(resolveIx), [authority]);
      expect.fail("wrong-oracle resolve should have failed");
    } catch (err: any) {
      expect(err.toString()).to.match(/OracleMismatch/);
    }
  });

  it("rejects resolve with mismatched message", async () => {
    const { market, channel, windowStart, windowEnd } = await createMarket(
      "wrongmsg",
      MOOD_HYPE,
      -5,
      120,
    );
    const { ed25519Ix } = attest(channel, MOOD_HYPE, windowStart + 1, windowEnd, oracle);
    const resolveIx = await program.methods
      .resolveWithReport(0)
      .accounts({
        config: configPda,
        market,
        payer: authority.publicKey,
        ixSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
      } as any)
      .instruction();
    try {
      await provider.sendAndConfirm(new Transaction().add(ed25519Ix).add(resolveIx), [authority]);
      expect.fail("wrong-message resolve should have failed");
    } catch (err: any) {
      expect(err.toString()).to.match(/MessageMismatch/);
    }
  });

  it("rejects resolve when preceding ix is not Ed25519Program", async () => {
    const { market } = await createMarket("nosig", MOOD_HYPE, -5, 120);
    const resolveIx = await program.methods
      .resolveWithReport(0)
      .accounts({
        config: configPda,
        market,
        payer: authority.publicKey,
        ixSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
      } as any)
      .instruction();
    try {
      await provider.sendAndConfirm(new Transaction().add(resolveIx), [authority]);
      expect.fail("missing Ed25519 ix should have failed");
    } catch (err: any) {
      expect(err.toString()).to.match(/NotEd25519Instruction|custom program error/);
    }
  });

  it("resolve_expired only after window_end", async () => {
    const { market, windowEnd } = await createMarket("expire", MOOD_HYPE, -5, 3);

    try {
      await program.methods
        .resolveExpired()
        .accounts({ config: configPda, market, payer: authority.publicKey } as any)
        .rpc();
      expect.fail("expected WindowNotEnded");
    } catch (err: any) {
      expect(err.toString()).to.match(/WindowNotEnded/);
    }

    const waitMs = Math.max(0, (windowEnd - Math.floor(Date.now() / 1000) + 3) * 1000);
    await new Promise((r) => setTimeout(r, waitMs));

    await program.methods
      .resolveExpired()
      .accounts({ config: configPda, market, payer: authority.publicKey } as any)
      .rpc();

    const m = await program.account.market.fetch(market);
    expect(m.state).to.have.property("resolvedNo");
  });

  it("one-sided pool refunds the sole bettor", async () => {
    const { market, escrow, channel, windowStart, windowEnd } = await createMarket(
      "onesided",
      MOOD_HYPE,
      -5,
      120,
    );
    const alicePos = await placeBet(alice, aliceUsdc, market, escrow, 1, 42_000_000);

    const { ed25519Ix } = attest(channel, MOOD_HYPE, windowStart, windowEnd, oracle);
    const resolveIx = await program.methods
      .resolveWithReport(0)
      .accounts({
        config: configPda,
        market,
        payer: authority.publicKey,
        ixSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
      } as any)
      .instruction();
    await provider.sendAndConfirm(new Transaction().add(ed25519Ix).add(resolveIx), [authority]);

    const before = (await getAccount(connection, aliceUsdc)).amount;
    await program.methods
      .claim()
      .accounts({
        config: configPda,
        market,
        escrow,
        position: alicePos,
        user: alice.publicKey,
        userUsdc: aliceUsdc,
        feeRecipientAta: feeRecipientUsdc,
        usdcMint,
        tokenProgram: TOKEN_PROGRAM_ID,
      } as any)
      .signers([alice])
      .rpc();
    const after = (await getAccount(connection, aliceUsdc)).amount;
    expect(Number(after - before)).to.eq(42_000_000);
  });
});
