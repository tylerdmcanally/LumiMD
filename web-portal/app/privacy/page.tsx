import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy - LumiMD',
  description: 'LumiMD Privacy Policy and data handling practices for lumiMD.app and the LumiMD mobile app',
};

const privacyFilePath = path.join(
  process.cwd(),
  'content/legal/privacy-policy-v1-2026-02-17.html',
);

const privacyHtml = readFileSync(privacyFilePath, 'utf8').trim();

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
        <header className="mb-10 border-b border-border-light pb-8 text-center">
          <div className="inline-flex items-center rounded-full bg-brand-primary-pale px-4 py-2 text-sm font-semibold text-brand-primary-dark">
            Legal
          </div>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-text-primary">Privacy Policy</h1>
          <p className="mt-3 text-text-secondary">Version 1.0 | Last updated: February 17, 2026</p>
        </header>

        <article
          className="rounded-2xl border border-border-light bg-surface p-6 text-sm leading-7 text-text-secondary shadow-elevated sm:p-10
            [&_a]:text-brand-primary [&_a]:underline-offset-2 hover:[&_a]:underline
            [&_h1]:mb-2 [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:leading-tight [&_h1]:text-text-primary
            [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:border-b [&_h2]:border-border-light [&_h2]:pb-2 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:leading-tight [&_h2]:text-text-primary
            [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-text-primary
            [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-6
            [&_p]:mb-4 [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-6
            [&_table]:mb-6 [&_table]:w-full [&_table]:border-collapse
            [&_tbody_tr:nth-child(odd)]:bg-background-subtle
            [&_td]:border [&_td]:border-border-light [&_td]:p-2 [&_td]:align-top
            [&_th]:border [&_th]:border-border-light [&_th]:bg-background-subtle [&_th]:p-2 [&_th]:text-left [&_th]:font-semibold [&_th]:text-text-primary"
        >
          {/* Trusted, versioned legal content maintained in-repo. */}
          <div dangerouslySetInnerHTML={{ __html: privacyHtml }} />
        </article>

        <footer className="mt-10 border-t border-border-light pt-6 text-center text-sm text-text-secondary">
          <p>&copy; 2026 LumiMD, Inc. All rights reserved.</p>
          <p className="mt-2">
            <Link href="/terms" className="text-brand-primary hover:underline">
              Terms of Use
            </Link>
          </p>
        </footer>
      </div>
    </div>
  );
}
