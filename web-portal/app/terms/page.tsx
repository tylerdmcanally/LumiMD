import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Use - LumiMD',
  description: 'LumiMD website terms of use and legal conditions for using lumiMD.app',
};

const termsFilePath = path.join(
  process.cwd(),
  'content/legal/terms-of-use-v1-2026-02-17.txt',
);

const termsText = readFileSync(termsFilePath, 'utf8').trim();

export default function TermsOfUsePage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
        <header className="mb-10 border-b border-border-light pb-8 text-center">
          <div className="inline-flex items-center rounded-full bg-brand-primary-pale px-4 py-2 text-sm font-semibold text-brand-primary-dark">
            Legal
          </div>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-text-primary">
            Terms of Use
          </h1>
          <p className="mt-3 text-text-secondary">Version 1.0 | Last revised: February 17, 2026</p>
        </header>

        <article className="rounded-2xl border border-border-light bg-surface p-6 shadow-elevated sm:p-10">
          <pre className="whitespace-pre-wrap font-sans text-sm leading-7 text-text-secondary">
            {termsText}
          </pre>
        </article>

        <footer className="mt-10 border-t border-border-light pt-6 text-center text-sm text-text-secondary">
          <p>&copy; 2026 LumiMD, Inc. All rights reserved.</p>
          <p className="mt-2">
            <Link href="/privacy" className="text-brand-primary hover:underline">
              Privacy Policy
            </Link>
          </p>
        </footer>
      </div>
    </div>
  );
}
