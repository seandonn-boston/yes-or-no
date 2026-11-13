import { LEGAL_DRAFT, LEGAL_UPDATED } from "@/lib/legal";

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="wrap wrap-narrow legal">
      <h1 className="page-title">{title}</h1>
      {LEGAL_DRAFT && (
        <p className="notice" role="note">
          Draft. This page has not yet been reviewed by a lawyer and may change before Belief Map opens to the public.
        </p>
      )}
      <p className="field-note">Last updated {LEGAL_UPDATED}</p>
      {children}
    </main>
  );
}
