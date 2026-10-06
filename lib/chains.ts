import type { Chain } from "./schema/asset";

export const CHAINS: Record<Chain, { name: string; chainId: number; explorer: string }> = {
  ethereum: { name: "Ethereum", chainId: 1, explorer: "https://etherscan.io" },
  arbitrum: { name: "Arbitrum", chainId: 42161, explorer: "https://arbiscan.io" },
  optimism: { name: "Optimism", chainId: 10, explorer: "https://optimistic.etherscan.io" },
  base: { name: "Base", chainId: 8453, explorer: "https://basescan.org" },
  polygon: { name: "Polygon", chainId: 137, explorer: "https://polygonscan.com" },
  avalanche: { name: "Avalanche", chainId: 43114, explorer: "https://snowtrace.io" },
};

export function explorerAddress(chain: Chain, address: string): string {
  return `${CHAINS[chain].explorer}/address/${address}`;
}

export function explorerTx(chain: Chain, tx: string): string {
  return `${CHAINS[chain].explorer}/tx/${tx}`;
}
