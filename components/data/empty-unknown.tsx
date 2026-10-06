import { formatDate } from "@/lib/format";
import { repoNewIssueUrl } from "@/lib/site";

export function EmptyUnknown({ searchedAt, note, topic }: { searchedAt?: string; note?: string; topic: string }) {
  return (
    <span className="text-small text-fg-subtle">
      {searchedAt ? `Not public · searched ${formatDate(searchedAt)}` : "Not found"}
      {note && <span className="text-fg-subtle"> · {note}</span>}{" "}
      <a
        href={repoNewIssueUrl(`Source for ${topic}`)}
        target="_blank"
        rel="noreferrer"
        className="text-accent hover:underline"
      >
        Help us find it
      </a>
    </span>
  );
}
