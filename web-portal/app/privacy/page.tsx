import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy - LumiMD',
  description: 'LumiMD Privacy Policy - How we collect, use, and protect your health information',
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <header className="text-center pb-8 border-b-2 border-emerald-500 mb-12">
          <h1 className="text-4xl font-bold text-emerald-600 mb-3">
            LumiMD Privacy Policy
          </h1>
          <p className="text-gray-600">
            Effective Date: December 3, 2025 | Last Updated: December 3, 2025
          </p>
        </header>

        <div className="bg-white rounded-lg shadow-sm p-8 space-y-10">
          {/* Commitment Section */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">
              Our Commitment to Your Privacy
            </h2>
            <p className="text-gray-700 mb-4">
              At LumiMD, we believe your health information is deeply personal and should remain private.
              This policy explains what information we collect, how we use it, and your rights to control your data.
            </p>
            <div className="bg-emerald-50 border-l-4 border-emerald-500 p-4 rounded">
              <p className="text-gray-800">
                <strong>Bottom Line:</strong> We never sell your data. We only use it to provide and improve our service.
              </p>
            </div>
          </section>

          {/* What We Collect */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">
              What Information We Collect
            </h2>

            <div className="space-y-4">
              <div>
                <h3 className="text-xl font-medium text-gray-800 mb-2">
                  Information You Provide
                </h3>
                <ul className="list-disc list-inside space-y-1 text-gray-700 ml-4">
                  <li><strong>Account Information:</strong> Name, email address, date of birth</li>
                  <li><strong>Health Information:</strong> Medical history, allergies, current medications</li>
                  <li><strong>Visit Recordings:</strong> Audio recordings of your doctor visits</li>
                  <li><strong>Notes:</strong> Any notes you add to your visits or medications</li>
                </ul>
              </div>

              <div>
                <h3 className="text-xl font-medium text-gray-800 mb-2">
                  Information We Generate
                </h3>
                <ul className="list-disc list-inside space-y-1 text-gray-700 ml-4">
                  <li><strong>Transcripts:</strong> Text transcriptions of your visit recordings (created by AI)</li>
                  <li><strong>Summaries:</strong> Visit summaries, medications, and action items (created by AI)</li>
                  <li><strong>Usage Data:</strong> How you use the app (pages visited, features used)</li>
                </ul>
              </div>

              <div>
                <h3 className="text-xl font-medium text-gray-800 mb-2">
                  Technical Information
                </h3>
                <ul className="list-disc list-inside space-y-1 text-gray-700 ml-4">
                  <li><strong>Device Information:</strong> Device type, operating system, app version</li>
                  <li><strong>Log Data:</strong> IP address, access times, error logs</li>
                </ul>
              </div>
            </div>
          </section>

          {/* How We Use */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">
              How We Use Your Information
            </h2>

            <div className="space-y-4">
              <div>
                <h3 className="text-xl font-medium text-gray-800 mb-2">Primary Uses</h3>
                <ol className="list-decimal list-inside space-y-1 text-gray-700 ml-4">
                  <li><strong>Transcribe Your Visits:</strong> Convert audio recordings to text</li>
                  <li><strong>Generate Summaries:</strong> Extract key information (diagnoses, medications, next steps)</li>
                  <li><strong>Organize Your Data:</strong> Store and display your health information</li>
                  <li><strong>Send Notifications:</strong> Remind you about action items and updates</li>
                </ol>
              </div>

              <div>
                <h3 className="text-xl font-medium text-gray-800 mb-2">Secondary Uses</h3>
                <ul className="list-disc list-inside space-y-1 text-gray-700 ml-4">
                  <li><strong>Improve Our Service:</strong> Analyze usage patterns to improve the app</li>
                  <li><strong>Provide Support:</strong> Help troubleshoot issues you report</li>
                  <li><strong>Ensure Security:</strong> Detect and prevent fraud, abuse, and security threats</li>
                </ul>
              </div>

              <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">What We DON&apos;T Do</h3>
                <ul className="space-y-1 text-gray-800">
                  <li>❌ We never sell your data</li>
                  <li>❌ We never share your data with advertisers</li>
                  <li>❌ We never use your data for marketing third-party products</li>
                  <li>❌ We never share your data with insurance companies</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Protection */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">
              How We Protect Your Information
            </h2>

            <div className="space-y-4">
              <div>
                <h3 className="text-xl font-medium text-gray-800 mb-2">Encryption</h3>
                <ul className="list-disc list-inside space-y-1 text-gray-700 ml-4">
                  <li><strong>In Transit:</strong> All data sent between your device and our servers is encrypted with HTTPS/TLS</li>
                  <li><strong>At Rest:</strong> All stored data is encrypted using AES-256 encryption</li>
                  <li><strong>Secure Infrastructure:</strong> Hosted on Google Firebase with enterprise-grade security</li>
                </ul>
              </div>

              <div>
                <h3 className="text-xl font-medium text-gray-800 mb-2">AI Processing</h3>
                <p className="text-gray-700 mb-2">
                  We use trusted AI providers to transcribe and analyze your health information:
                </p>

                <div className="ml-4 space-y-3">
                  <div>
                    <p className="font-medium text-gray-800">AssemblyAI (Transcription)</p>
                    <ul className="list-disc list-inside space-y-1 text-gray-700 ml-4">
                      <li>Processes audio to create text transcripts</li>
                      <li>Deletes your data after transcription is complete</li>
                      <li>
                        Privacy policy:{' '}
                        <a
                          href="https://www.assemblyai.com/legal/privacy-policy"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-emerald-600 hover:underline"
                        >
                          assemblyai.com/legal/privacy-policy
                        </a>
                      </li>
                    </ul>
                  </div>

                  <div>
                    <p className="font-medium text-gray-800">OpenAI (Summarization)</p>
                    <ul className="list-disc list-inside space-y-1 text-gray-700 ml-4">
                      <li>Analyzes transcripts to extract key information</li>
                      <li><strong>Zero Data Retention:</strong> Your data is immediately deleted after processing</li>
                      <li>
                        Privacy policy:{' '}
                        <a
                          href="https://openai.com/enterprise-privacy"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-emerald-600 hover:underline"
                        >
                          openai.com/enterprise-privacy
                        </a>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-medium text-gray-800 mb-2">Access Controls</h3>
                <ul className="list-disc list-inside space-y-1 text-gray-700 ml-4">
                  <li>Only you can access your data (unless you explicitly share it)</li>
                  <li>Our employees cannot access your data without your explicit permission</li>
                  <li>Strong authentication protects your account</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Your Rights */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">
              Your Data Rights
            </h2>

            <div className="space-y-4">
              <div>
                <h3 className="text-xl font-medium text-gray-800 mb-2">Access Your Data</h3>
                <p className="text-gray-700">
                  You can view all your data anytime in the app. To download a copy of all your data,
                  contact us at{' '}
                  <a href="mailto:privacy@lumimd.app" className="text-emerald-600 hover:underline">
                    privacy@lumimd.app
                  </a>
                  .
                </p>
              </div>

              <div>
                <h3 className="text-xl font-medium text-gray-800 mb-2">Delete Your Data</h3>
                <p className="text-gray-700 mb-2">
                  You can delete your account and all associated data at any time:
                </p>
                <ol className="list-decimal list-inside space-y-1 text-gray-700 ml-4">
                  <li>Go to Settings → Account</li>
                  <li>Tap &quot;Delete Account&quot;</li>
                  <li>Confirm deletion</li>
                </ol>
                <p className="text-gray-700 mt-2 font-medium">What happens when you delete your account:</p>
                <ul className="list-disc list-inside space-y-1 text-gray-700 ml-4">
                  <li>All visits, recordings, and transcripts are permanently deleted</li>
                  <li>All personal information is permanently deleted</li>
                  <li>Your account is immediately deactivated</li>
                  <li>This action cannot be undone</li>
                </ul>
              </div>

              <div>
                <h3 className="text-xl font-medium text-gray-800 mb-2">Correct Your Data</h3>
                <p className="text-gray-700">
                  You can update your personal information anytime in Settings.
                </p>
              </div>

              <div>
                <h3 className="text-xl font-medium text-gray-800 mb-2">Export Your Data</h3>
                <p className="text-gray-700">
                  Request a copy of your data in a portable format by emailing{' '}
                  <a href="mailto:privacy@lumimd.app" className="text-emerald-600 hover:underline">
                    privacy@lumimd.app
                  </a>
                  . We&apos;ll respond within 30 days.
                </p>
              </div>
            </div>
          </section>

          {/* Data Sharing */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">
              Data Sharing
            </h2>

            <div className="space-y-4">
              <div>
                <h3 className="text-xl font-medium text-gray-800 mb-2">When We Share Your Data</h3>

                <div className="ml-4 space-y-3">
                  <div>
                    <p className="font-medium text-gray-800">With Your Permission</p>
                    <ul className="list-disc list-inside space-y-1 text-gray-700 ml-4">
                      <li>If you use our sharing feature to give caregivers access to your health information</li>
                      <li>If you explicitly authorize sharing with healthcare providers</li>
                    </ul>
                  </div>

                  <div>
                    <p className="font-medium text-gray-800">For Legal Reasons</p>
                    <ul className="list-disc list-inside space-y-1 text-gray-700 ml-4">
                      <li>To comply with valid legal processes (court orders, subpoenas)</li>
                      <li>To protect our rights or the safety of others</li>
                      <li>To detect, prevent, or address fraud or security issues</li>
                    </ul>
                  </div>

                  <div>
                    <p className="font-medium text-gray-800">With Service Providers</p>
                    <ul className="list-disc list-inside space-y-1 text-gray-700 ml-4">
                      <li>Hosting provider (Google Firebase)</li>
                      <li>AI providers (AssemblyAI, OpenAI) - only during processing, immediately deleted</li>
                      <li>Analytics services (for app improvement)</li>
                    </ul>
                    <p className="text-gray-700 mt-2">
                      All service providers are bound by strict confidentiality agreements.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">What We Never Share</h3>
                <ul className="space-y-1 text-gray-800">
                  <li>❌ Your data with advertisers or marketing companies</li>
                  <li>❌ Your data with insurance companies</li>
                  <li>❌ Your data for sale to third parties</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Data Retention */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">
              Data Retention
            </h2>

            <div className="space-y-4">
              <div>
                <h3 className="text-xl font-medium text-gray-800 mb-2">How Long We Keep Your Data</h3>
                <ul className="list-disc list-inside space-y-1 text-gray-700 ml-4">
                  <li><strong>Active Accounts:</strong> We keep your data as long as your account is active</li>
                  <li><strong>Inactive Accounts:</strong> If you don&apos;t use the app for 2 years, we&apos;ll email you before deleting your data</li>
                  <li><strong>Deleted Accounts:</strong> Immediately deleted, with a 30-day recovery period</li>
                </ul>
              </div>

              <div>
                <h3 className="text-xl font-medium text-gray-800 mb-2">Backups</h3>
                <p className="text-gray-700">
                  Your data may remain in backup systems for up to 90 days after deletion, then is permanently erased.
                </p>
              </div>
            </div>
          </section>

          {/* Children's Privacy */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">
              Children&apos;s Privacy
            </h2>
            <p className="text-gray-700">
              LumiMD is not intended for children under 13. We do not knowingly collect information from children under 13.
              If you believe we have collected information from a child under 13, please contact us immediately at{' '}
              <a href="mailto:privacy@lumimd.app" className="text-emerald-600 hover:underline">
                privacy@lumimd.app
              </a>
              .
            </p>
          </section>

          {/* CCPA */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">
              California Privacy Rights (CCPA)
            </h2>
            <p className="text-gray-700 mb-4">
              If you&apos;re a California resident, you have additional rights:
            </p>

            <div className="space-y-3 ml-4">
              <div>
                <h3 className="text-lg font-medium text-gray-800">Right to Know</h3>
                <p className="text-gray-700">
                  Request information about what personal data we collect, use, and share.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-medium text-gray-800">Right to Delete</h3>
                <p className="text-gray-700">
                  Request deletion of your personal data (subject to legal exceptions).
                </p>
              </div>

              <div>
                <h3 className="text-lg font-medium text-gray-800">Right to Opt-Out</h3>
                <p className="text-gray-700">
                  We don&apos;t sell your data, so there&apos;s nothing to opt out of.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-medium text-gray-800">No Discrimination</h3>
                <p className="text-gray-700">
                  We won&apos;t discriminate against you for exercising your privacy rights.
                </p>
              </div>
            </div>

            <p className="text-gray-700 mt-4">
              <strong>To exercise your rights:</strong> Email{' '}
              <a href="mailto:privacy@lumimd.app" className="text-emerald-600 hover:underline">
                privacy@lumimd.app
              </a>{' '}
              with your request.
            </p>
          </section>

          {/* GDPR */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">
              European Privacy Rights (GDPR)
            </h2>
            <p className="text-gray-700 mb-4">
              If you&apos;re in the EU/EEA, you have additional rights under GDPR:
            </p>

            <div className="space-y-3">
              <div>
                <h3 className="text-lg font-medium text-gray-800 mb-2">Legal Basis for Processing</h3>
                <ul className="list-disc list-inside space-y-1 text-gray-700 ml-4">
                  <li><strong>Consent:</strong> You consent by using our service</li>
                  <li><strong>Contract:</strong> Processing is necessary to provide our service</li>
                  <li><strong>Legitimate Interest:</strong> To improve our service and prevent fraud</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-medium text-gray-800 mb-2">Your GDPR Rights</h3>
                <ul className="list-disc list-inside space-y-1 text-gray-700 ml-4">
                  <li>Right to access your data</li>
                  <li>Right to correct inaccurate data</li>
                  <li>Right to delete your data</li>
                  <li>Right to restrict processing</li>
                  <li>Right to data portability</li>
                  <li>Right to object to processing</li>
                  <li>Right to withdraw consent</li>
                </ul>
              </div>
            </div>

            <p className="text-gray-700 mt-4">
              <strong>To exercise your rights:</strong> Email{' '}
              <a href="mailto:privacy@lumimd.app" className="text-emerald-600 hover:underline">
                privacy@lumimd.app
              </a>
            </p>
          </section>

          {/* Cookies */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">
              Cookies and Tracking
            </h2>

            <div className="space-y-3">
              <div>
                <h3 className="text-lg font-medium text-gray-800 mb-2">What We Use</h3>
                <ul className="list-disc list-inside space-y-1 text-gray-700 ml-4">
                  <li><strong>Essential Cookies:</strong> Required for authentication and security</li>
                  <li><strong>Analytics:</strong> To understand how you use the app (anonymized)</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-medium text-gray-800 mb-2">What We Don&apos;t Use</h3>
                <ul className="space-y-1 text-gray-700 ml-4">
                  <li>❌ Advertising cookies</li>
                  <li>❌ Third-party tracking for marketing</li>
                </ul>
              </div>
            </div>

            <p className="text-gray-700 mt-3">
              You can disable non-essential cookies in your browser settings, though this may affect functionality.
            </p>
          </section>

          {/* Policy Changes */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">
              Changes to This Policy
            </h2>
            <p className="text-gray-700 mb-3">
              We may update this policy occasionally. If we make significant changes, we&apos;ll notify you via:
            </p>
            <ul className="list-disc list-inside space-y-1 text-gray-700 ml-4">
              <li>Email to your registered address</li>
              <li>In-app notification</li>
              <li>Notice on our website</li>
            </ul>
            <p className="text-gray-700 mt-3">
              Continued use of LumiMD after changes means you accept the updated policy.
            </p>
          </section>

          {/* International Transfers */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">
              International Data Transfers
            </h2>
            <p className="text-gray-700">
              Your data is processed and stored in the United States. If you&apos;re located outside the U.S.,
              your data will be transferred to and processed in the U.S. We use appropriate safeguards to protect your data.
            </p>
          </section>

          {/* Contact */}
          <section className="bg-gray-50 p-6 rounded-lg">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">Contact Us</h2>
            <div className="space-y-2 text-gray-700">
              <p>
                <strong>Privacy Questions:</strong>{' '}
                <a href="mailto:privacy@lumimd.app" className="text-emerald-600 hover:underline">
                  privacy@lumimd.app
                </a>
              </p>
              <p>
                <strong>General Support:</strong>{' '}
                <a href="mailto:support@lumimd.app" className="text-emerald-600 hover:underline">
                  support@lumimd.app
                </a>
              </p>
              <p>
                <strong>Website:</strong>{' '}
                <a href="https://lumimd.app" className="text-emerald-600 hover:underline">
                  https://lumimd.app
                </a>
              </p>
            </div>
          </section>

          {/* Summary */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">
              Summary: Your Privacy in Plain English
            </h2>

            <div className="space-y-4">
              <div className="bg-emerald-50 border-l-4 border-emerald-500 p-4 rounded">
                <p className="font-semibold text-gray-900 mb-2">✅ What we do:</p>
                <ul className="list-disc list-inside space-y-1 text-gray-700 ml-4">
                  <li>Keep your health information secure and encrypted</li>
                  <li>Use AI to transcribe and summarize your visits</li>
                  <li>Let you control, download, and delete your data anytime</li>
                </ul>
              </div>

              <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
                <p className="font-semibold text-gray-900 mb-2">❌ What we don&apos;t do:</p>
                <ul className="list-disc list-inside space-y-1 text-gray-700 ml-4">
                  <li>Sell your data</li>
                  <li>Share with advertisers or insurance companies</li>
                  <li>Keep your data longer than necessary</li>
                </ul>
              </div>

              <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
                <p className="font-semibold text-gray-900 mb-2">🔒 Your rights:</p>
                <ul className="list-disc list-inside space-y-1 text-gray-700 ml-4">
                  <li>View, download, or delete your data anytime</li>
                  <li>Control who has access to your information</li>
                  <li>Ask questions about how we handle your data</li>
                </ul>
              </div>
            </div>

            <p className="text-gray-700 mt-4">
              <strong>Questions?</strong> We&apos;re here to help:{' '}
              <a href="mailto:privacy@lumimd.app" className="text-emerald-600 hover:underline">
                privacy@lumimd.app
              </a>
            </p>
          </section>
        </div>

        {/* Footer */}
        <footer className="text-center mt-12 pt-8 border-t border-gray-200">
          <p className="text-gray-600">
            Policy Version: 1.0 | Last Reviewed: December 3, 2025
          </p>
          <p className="text-gray-600 mt-2">
            &copy; 2025 LumiMD. All rights reserved.
          </p>
        </footer>
      </div>
    </div>
  );
}
