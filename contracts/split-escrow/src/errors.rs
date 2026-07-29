use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    InvalidAmount = 4,
    InvalidFeeBps = 5,
    SplitNotFound = 6,
    SplitNotPending = 7,
    SplitNotReady = 8,
    TreasuryNotSet = 9,

    /// The maximum number of participants for this escrow has been reached.
    ParticipantCapExceeded = 10,

    InvalidVersion = 11,
    InvalidInput = 12,
    EscrowNotActive = 13,
    SplitNotActive = 14,
    InvalidMetadata = 15,
    ParticipantNotOwed = 16,
    InsufficientFulfillment = 17,
    TotalAmountMismatch = 18,

    /// A state-changing operation was attempted while the contract is paused.
    ContractPaused = 19,

    /// An unpause step was attempted while the contract is not paused.
    NotPaused = 20,

    /// `unpause` was called without a prior `schedule_unpause`.
    UnpauseNotScheduled = 21,

    /// `unpause` was called before the 48-hour timelock elapsed.
    TimelockNotElapsed = 22,
}
