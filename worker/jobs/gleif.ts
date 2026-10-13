import { raiseAlert } from "../alerts";
import { fetchJson, getCheck, log, publishedAssets, upsertCheck } from "../util";

interface LeiRecord {
  data: {
    attributes: {
      entity: { legalName: { name: string }; status: string };
      registration: { status: string; nextRenewalDate: string };
    };
  };
}

interface LeiState {
  legalName: string;
  entityStatus: string;
  registrationStatus: string;
  nextRenewalDate: string;
}

export async function gleifJob() {
  for (const asset of await publishedAssets()) {
    const lei = asset.legal.lei;
    if (lei.status !== "public") continue;
    const res = await fetchJson<LeiRecord>(`https://api.gleif.org/api/v1/lei-records/${lei.value}`);
    const a = res.data.attributes;
    const state: LeiState = {
      legalName: a.entity.legalName.name,
      entityStatus: a.entity.status,
      registrationStatus: a.registration.status,
      nextRenewalDate: a.registration.nextRenewalDate,
    };
    const previous = await getCheck<LeiState>(asset.slug, "gleif", lei.value);
    const changed = previous && (["legalName", "entityStatus", "registrationStatus"] as const).filter((k) => previous[k] !== state[k]);
    if (changed && changed.length > 0) {
      await raiseAlert({
        id: `gleif-${lei.value}-${state.registrationStatus}-${state.entityStatus}-${state.legalName}`.replace(/[^A-Za-z0-9-]/g, "_"),
        asset: asset.slug,
        severity: state.registrationStatus === "LAPSED" || state.entityStatus !== "ACTIVE" ? "high" : "medium",
        kind: "lei-change",
        title: `${asset.ticker} legal entity record changed: ${changed.map((k) => `${k} ${previous[k]} → ${state[k]}`).join(", ")}`,
        consequence: "The fund's LEI record at GLEIF changed. A lapsed or inactive LEI can mean the entity stopped maintaining its registration.",
        url: `https://search.gleif.org/#/record/${lei.value}`,
      });
    }
    await upsertCheck(asset.slug, "gleif", lei.value, state);
    log("gleif", `${asset.slug} ${state.entityStatus}/${state.registrationStatus}, renews ${state.nextRenewalDate.slice(0, 10)}`);
  }
}
