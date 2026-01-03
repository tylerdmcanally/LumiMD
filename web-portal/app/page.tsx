// Root page is handled by the rewrite to /landing.html in next.config.js
// This file exists to prevent Next.js from treating / as a dynamic route

export default function RootPage() {
  // This will never render because of the rewrite
  // But Next.js needs a valid export
  return null;
}
