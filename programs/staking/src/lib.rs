use anchor_lang::prelude::*;

declare_id!("7tPicSkVBpLMWyHM2mxgaLsXHEFvKKL7fdSJgytZf9kW");
// pub const ADMIN_PUBKEY: Pubkey = pubkey!("GhfXkds6tpPfxN2gJxzenE2qs1p2hjhV3sppf7m1Ubd8");
const EPOCH_DURATION: i64 = 86400;
const REWARD_PER_EPOCH:u64 = 2;

#[program]
pub mod staking {
    use anchor_lang::prelude::program::{invoke, invoke_signed};

    use super::*;

    // pub fn initialize_vault(ctx: Context<InitializeVault>) -> Result<()> {
    //     require!(ctx.accounts.admin.key() == ADMIN_PUBKEY, CustomError::Unauthorised);
    //     Ok(())
    // }

    pub fn initialize_vault(ctx: Context<InitializeVault>) -> Result<()> {
        ctx.accounts.vault.total_rewards = 0;
        ctx.accounts.vault.total_staked = 0;
        Ok(())
    }

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let pda = &mut ctx.accounts.user_stake_acc;
        pda.user = ctx.accounts.payer.key();
        pda.amount = 0;
        pda.last_epoch = Clock::get()?.unix_timestamp.checked_div(EPOCH_DURATION).unwrap() as u64;
        pda.pending_reward = 0;
        Ok(())
    }

    pub fn stake_sol(ctx: Context<StakeSol>,amount:u64) -> Result<()> {
        let from = ctx.accounts.payer.key;
        let to =  &ctx.accounts.vault.key();
        let ix = system_instruction::transfer(from, to, amount);

        invoke(&ix, &[
            ctx.accounts.payer.to_account_info(),
            ctx.accounts.vault.to_account_info(),
            ctx.accounts.system_program.to_account_info()
        ])?;

        let stake = &mut ctx.accounts.user_stake_acc;
        let vault = &mut ctx.accounts.vault;

        let clock = Clock::get()?;
        let current = (clock.unix_timestamp/EPOCH_DURATION) as u64;

        let epoch_elapsed = current - stake.last_epoch;

        let reward = stake.amount.checked_mul(epoch_elapsed).unwrap().checked_mul(REWARD_PER_EPOCH).unwrap();

        stake.pending_reward = stake.pending_reward.checked_add(reward).unwrap();
        stake.last_epoch = current;

        vault.total_rewards = vault.total_rewards.checked_add(reward).unwrap();
        vault.total_staked = vault.total_staked.checked_add(amount).unwrap();

        Ok(())
    }

    pub fn unstake_sol(ctx: Context<UnstakeSol>,amount:u64) -> Result<()> {
        require!(ctx.accounts.user_stake_acc.amount >= amount , CustomError::InsufficientBalance);
        let from = &ctx.accounts.vault.key();
        let to =  ctx.accounts.payer.key;
        let vault_bump = ctx.bumps.vault;
        let ix = system_instruction::transfer(from, to, amount);
        let seeds = &[b"vault".as_ref(), &[vault_bump]];

        invoke_signed(&ix, &[
            ctx.accounts.payer.to_account_info(),
            ctx.accounts.vault.to_account_info(),
            ctx.accounts.system_program.to_account_info()
        ],&[seeds])?;

        let stake = &mut ctx.accounts.user_stake_acc;
        let vault = &mut ctx.accounts.vault;

        let clock = Clock::get()?;
        let current = (clock.unix_timestamp/EPOCH_DURATION) as u64;

        let epoch_elapsed = current - stake.last_epoch;

        let reward = stake.amount.checked_mul(epoch_elapsed).unwrap().checked_mul(REWARD_PER_EPOCH).unwrap();

        stake.pending_reward = stake.pending_reward.checked_add(reward).unwrap();
        stake.last_epoch = current;
        stake.amount = stake.amount.checked_sub(amount).unwrap();

        vault.total_rewards = vault.total_rewards.checked_add(reward).unwrap();
        vault.total_staked = vault.total_staked.checked_sub(amount).unwrap();

        Ok(())
    }

    pub fn claim_reward(ctx: Context<ClaimReward>) -> Result<()> {
        let from = &ctx.accounts.vault.key();
        let to =  ctx.accounts.payer.key;
        let reward = ctx.accounts.user_stake_acc.pending_reward;
        let ix = system_instruction::transfer(from, to, reward);

        let vault_bump = ctx.bumps.vault;
        let seeds = &[b"vault".as_ref(),&[vault_bump]];

        invoke_signed(&ix, &[
            ctx.accounts.payer.to_account_info(),
            ctx.accounts.vault.to_account_info(),
            ctx.accounts.system_program.to_account_info()
        ],&[seeds])?;

        let stake = &mut ctx.accounts.user_stake_acc;
        let vault = &mut ctx.accounts.vault;

        let clock = Clock::get()?;
        let current = (clock.unix_timestamp/EPOCH_DURATION) as u64;

        stake.pending_reward = 0;
        stake.last_epoch = current;

        vault.total_rewards = vault.total_rewards.checked_sub(reward).unwrap();

        Ok(())
    }
}

#[account]
pub struct VaultAccount {
    pub total_staked: u64,
    pub total_rewards: u64
}


#[account]
pub struct StakeAccount {
    pub user: Pubkey,
    pub amount: u64,
    pub last_epoch: u64,
    pub pending_reward: u64
}

#[derive(Accounts)]
pub struct  InitializeVault<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        init,
        payer = admin,
        space = 8 + 8 + 8,
        seeds = [b"vault"],
        bump
    )]
    pub vault: Account<'info,VaultAccount>,
    pub system_program: Program<'info,System>
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init,
        payer = payer,
        space = 8 + 32 + 8 + 8 + 8,
        seeds = [b"stake",payer.key().as_ref()],
        bump
    )]
    pub user_stake_acc: Account<'info,StakeAccount>,
    pub system_program: Program<'info,System>
}

#[derive(Accounts)]
pub struct StakeSol<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(mut,seeds=[b"stake",payer.key().as_ref()] , bump)]
    pub user_stake_acc: Account<'info,StakeAccount>,

    #[account(mut,seeds=[b"vault"],bump)]
    pub vault: Account<'info,VaultAccount>,
    pub system_program: Program<'info,System>
    
}

#[derive(Accounts)]
pub struct UnstakeSol<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(mut,seeds=[b"stake",payer.key().as_ref()] , bump)]
    pub user_stake_acc: Account<'info,StakeAccount>,

    #[account(mut,seeds=[b"vault"],bump)]
    pub vault: Account<'info,VaultAccount>,

    pub system_program: Program<'info,System>
    
}


#[derive(Accounts)]
pub struct ClaimReward<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(mut,seeds=[b"stake",payer.key().as_ref()] , bump)]
    pub user_stake_acc: Account<'info,StakeAccount>,

    #[account(mut,seeds=[b"vault"],bump)]
    pub vault: Account<'info,VaultAccount>,

    pub system_program: Program<'info,System>
    
}

// #[error_code]
// pub enum CustomError {
//     #[msg("You are authorised to invoke this method")]
//     Unauthorised
// }

#[error_code]
pub enum CustomError {
    #[msg("Cannot unstake amount greater than your staked amount")]
    InsufficientBalance
}
