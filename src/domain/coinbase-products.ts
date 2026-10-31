// Dependency-free shared allowlist: provider and symbol parser must not evaluate each other to read it.
export const COINBASE_PRODUCTS = ['BTC-USD', 'ETH-USD', 'SOL-USD'] as const;
