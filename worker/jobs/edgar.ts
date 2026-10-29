import { raiseAlert } from "../alerts";
import { fetchJson, getCheck, log, publishedAssets, upsertCheck } from "../util";

interface Submissions {
  name: string;
  filings: { recent: { form: string[]; filingDate: string[]; accessionNumber: string[]; primaryDocument: string[] } };
}

export async function edgarJob() {
  const userAgent = process.env.SEC_USER_AGENT;
  if (!userAgent) {
    log("edgar", "skipped: set SEC_USER_AGENT (SEC requires a name and email)");
    return;
  }
  for (const asset of await publishedAssets()) {
    const sec = asset.legal.secFilings;
    if (sec.status !== "public") continue;
    const cik = sec.value.cik.padStart(10, "0");
    const data = await fetchJson<Submissions>(`https://data.sec.gov/submissions/CIK${cik}.json`, {
      headers: { "user-agent": userAgent },
    });
    const r = data.filings.recent;
    const filings = r.accessionNumber.map((accession, i) => ({
      accession,
      form: r.form[i]!,
      date: r.filingDate[i]!,
      url: `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession.replaceAll("-", "")}/${r.primaryDocument[i]}`,
    }));

    const previous = await getCheck<{ accessions: string[] }>(asset.slug, "edgar", "filings");
    // First run seeds the list without alerting on historical filings.
    if (previous) {
      const known = new Set(previous.accessions);
      for (const f of filings.filter((f) => !known.has(f.accession) && sec.value.forms.includes(f.form))) {
        await raiseAlert({
          id: `edgar-${f.accession}`,
          asset: asset.slug,
          severity: "medium",
          kind: "filing",
          title: `${asset.ticker} filed SEC Form ${f.form} on ${f.date}`,
          consequence: `New ${f.form} filing by ${data.name}. Check it for changes to the offering, size, or service providers.`,
          url: f.url,
        });
      }
    }
    await upsertCheck(asset.slug, "edgar", "filings", {
      accessions: filings.map((f) => f.accession),
      latest: filings[0],
    });
    log("edgar", `${asset.slug} ${filings.length} filing(s), latest ${filings[0]?.form} ${filings[0]?.date}`);
  }
}
