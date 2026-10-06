import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <p className="text-label text-fg-subtle">404</p>
      <h1 className="mt-1 text-h2">Not found</h1>
      <p className="mt-2 text-body text-fg-muted">
        This page doesn&apos;t exist, or the asset isn&apos;t tracked yet.
      </p>
      <Link href="/screener" className="mt-4 inline-block text-body text-accent hover:underline">
        Browse tracked assets →
      </Link>
    </div>
  );
}
