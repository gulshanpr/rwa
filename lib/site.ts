export const SITE = {
  name: "RWABeat",
  tagline: "Independent risk profiles",
  description:
    "Independent, open-source risk profiles for tokenized real-world assets. Every fact sourced.",
  repoUrl: "https://github.com/rwabeat/rwabeat",
  disclaimer:
    "RWABeat provides information for educational purposes only. It is not investment, legal, tax, or financial advice, and it is not a credit rating. Data may be incomplete or wrong; always verify with the linked primary sources. Risk slices describe specific, checkable properties and do not indicate overall safety.",
};

export function repoFileUrl(path: string): string {
  return `${SITE.repoUrl}/blob/main/${path}`;
}

export function repoNewIssueUrl(title: string): string {
  return `${SITE.repoUrl}/issues/new?title=${encodeURIComponent(title)}`;
}
