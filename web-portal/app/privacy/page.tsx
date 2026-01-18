import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy - LumiMD',
  description: 'LumiMD Privacy Policy - How we collect, use, and protect your health information',
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <header className="text-center pb-10 mb-12">
          <div className="inline-flex items-center gap-2 rounded-full bg-brand-primary-pale px-4 py-2 text-sm font-semibold text-brand-primary-dark">
            Privacy &amp; Security
          </div>
          <h1 className="mt-4 text-4xl font-bold text-text-primary tracking-tight">
            LumiMD Privacy Policy
          </h1>
          <p className="mt-3 text-text-secondary">
            Effective Date: December 17, 2024 | Last Updated: January 8, 2026
          </p>
        </header>

        <div className="bg-surface rounded-2xl shadow-elevated p-8 sm:p-10 space-y-10 border border-border-light">
          {/* TODO: REMOVE THIS BETA SECTION BEFORE PUBLIC LAUNCH */}
          {/* Beta Program Notice */}
          <section className="bg-warning-light/60 border-l-4 border-warning p-6 rounded">
            <h2 className="text-xl font-semibold text-text-primary mb-3">
              Beta Program Notice
            </h2>
            <p className="text-text-secondary mb-3">
              LumiMD is currently in beta testing. By participating in our beta program:
            </p>
            <ul className="list-disc list-inside space-y-1 text-text-secondary ml-4">
              <li>You acknowledge the service is under active development and may contain bugs or unexpected behavior</li>
              <li>Features may change, be modified, or removed at any time</li>
              <li>We may contact you for feedback about your experience</li>
              <li>This privacy policy applies fully to all beta participants</li>
              <li>Your data is protected with the same security measures as our production service</li>
            </ul>
            <p className="text-text-secondary mt-3">
              We appreciate your help in making LumiMD better. Your feedback directly shapes the product.
            </p>
          </section>
          {/* END BETA SECTION */}

          {/* Commitment Section */}
          <section>
            <h2 className="text-2xl font-semibold text-text-primary mb-4 pb-2 border-b border-border-light">
              Our Commitment to Your Privacy
            </h2>
            <p className="text-text-secondary mb-4">
              At LumiMD, we understand that your health information is deeply personal. We are committed to protecting your privacy and ensuring you maintain control over your data. This policy explains what information we collect, how we use it, and your rights regarding your data.
            </p>
            <div className="bg-brand-primary-pale/80 border-l-4 border-brand-primary p-4 rounded">
              <p className="text-text-primary">
                <strong>Our Promise:</strong> We never sell your data. We only use it to provide and improve our service to you.
              </p>
            </div>
          </section>

          {/* What We Collect */}
          <section>
            <h2 className="text-2xl font-semibold text-text-primary mb-4 pb-2 border-b border-border-light">
              Information We Collect
            </h2>

            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-medium text-text-primary mb-2">
                  Information You Provide
                </h3>
                <ul className="list-disc list-inside space-y-1 text-text-secondary ml-4">
                  <li><strong>Account Information:</strong> Name, email address, date of birth</li>
                  <li><strong>Health Information:</strong> Medical history, allergies, current medications</li>
                  <li><strong>Visit Recordings:</strong> Audio recordings of your healthcare visits</li>
                  <li><strong>Notes:</strong> Any notes you add to your visits or medications</li>
                </ul>
              </div>

              <div>
                <h3 className="text-xl font-medium text-text-primary mb-2">
                  Information We Generate
                </h3>
                <ul className="list-disc list-inside space-y-1 text-text-secondary ml-4">
                  <li><strong>Transcripts:</strong> Text transcriptions of your visit recordings, created using AI</li>
                  <li><strong>Summaries:</strong> Visit summaries, medication lists, and action items, created using AI</li>
                  <li><strong>Safety Alerts:</strong> Drug interaction and allergy warnings generated from your medication list</li>
                </ul>
              </div>

              <div>
                <h3 className="text-xl font-medium text-text-primary mb-2">
                  Technical Information
                </h3>
                <ul className="list-disc list-inside space-y-1 text-text-secondary ml-4">
                  <li><strong>Device Information:</strong> Device type, operating system, app version</li>
                  <li><strong>Log Data:</strong> IP address, access times, error logs for debugging</li>
                </ul>
              </div>
            </div>
          </section>

          {/* How We Use */}
          <section>
            <h2 className="text-2xl font-semibold text-text-primary mb-4 pb-2 border-b border-border-light">
              How We Use Your Information
            </h2>

            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-medium text-text-primary mb-2">Primary Uses</h3>
                <ol className="list-decimal list-inside space-y-1 text-text-secondary ml-4">
                  <li><strong>Transcribe Your Visits:</strong> Convert audio recordings to text</li>
                  <li><strong>Generate Summaries:</strong> Extract key information including diagnoses, medications, and follow-up steps</li>
                  <li><strong>Medication Safety:</strong> Check for drug interactions and allergy alerts</li>
                  <li><strong>Organize Your Data:</strong> Store and display your health information securely</li>
                  <li><strong>Send Notifications:</strong> Remind you about action items and important updates</li>
                </ol>
              </div>

              <div>
                <h3 className="text-xl font-medium text-text-primary mb-2">Secondary Uses</h3>
                <ul className="list-disc list-inside space-y-1 text-text-secondary ml-4">
                  <li><strong>Improve Our Service:</strong> Analyze aggregated usage patterns to improve the app</li>
                  <li><strong>Provide Support:</strong> Help troubleshoot issues you report</li>
                  <li><strong>Ensure Security:</strong> Detect and prevent fraud, abuse, and security threats</li>
                </ul>
              </div>

              <div className="bg-error-light/60 border-l-4 border-error p-4 rounded">
                <h3 className="text-lg font-semibold text-text-primary mb-2">What We Do Not Do</h3>
                <ul className="space-y-1 text-text-primary ml-4">
                  <li>We do not sell your data to any third party</li>
                  <li>We do not share your data with advertisers</li>
                  <li>We do not use your data for marketing third-party products</li>
                  <li>We do not share your data with insurance companies</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Protection */}
          <section>
            <h2 className="text-2xl font-semibold text-text-primary mb-4 pb-2 border-b border-border-light">
              How We Protect Your Information
            </h2>

            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-medium text-text-primary mb-2">Encryption</h3>
                <ul className="list-disc list-inside space-y-1 text-text-secondary ml-4">
                  <li><strong>In Transit:</strong> All data sent between your device and our servers is encrypted using HTTPS/TLS</li>
                  <li><strong>At Rest:</strong> All stored data is encrypted using AES-256 encryption</li>
                  <li><strong>Infrastructure:</strong> Hosted on Google Firebase with enterprise-grade security controls</li>
                </ul>
              </div>

              <div>
                <h3 className="text-xl font-medium text-text-primary mb-2">AI Processing and Data Retention</h3>
                <p className="text-text-secondary mb-3">
                  We use trusted AI providers to transcribe and analyze your health information. We have implemented strict data retention policies to minimize how long your data exists on third-party systems:
                </p>

                <div className="ml-4 space-y-4">
                  <div className="bg-background-subtle p-4 rounded border border-border-light">
                    <p className="font-medium text-text-primary">Audio Transcription Services</p>
                    <ul className="list-disc list-inside space-y-1 text-text-secondary ml-4 mt-2">
                      <li>We use a third-party AI service to convert your audio recordings into text transcripts</li>
                      <li><strong>Immediate Deletion:</strong> Transcripts are automatically deleted from the transcription service immediately after we receive and process them</li>
                      <li>Audio is never stored permanently on third-party servers</li>
                    </ul>
                  </div>

                  <div className="bg-background-subtle p-4 rounded border border-border-light">
                    <p className="font-medium text-text-primary">AI Summarization Services</p>
                    <ul className="list-disc list-inside space-y-1 text-text-secondary ml-4 mt-2">
                      <li>We use a third-party AI service to analyze transcripts and extract key clinical information</li>
                      <li><strong>Zero Data Retention:</strong> We configure our AI provider with zero-retention settings, meaning your data is deleted immediately after processing completes</li>
                      <li>Your data is never used to train AI models</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-medium text-text-primary mb-2">Access Controls</h3>
                <ul className="list-disc list-inside space-y-1 text-text-secondary ml-4">
                  <li>Only you can access your data unless you explicitly share it with a caregiver</li>
                  <li>LumiMD employees cannot access your personal health data without your explicit permission</li>
                  <li>Strong authentication protects your account</li>
                  <li>All access to sensitive data is logged for audit purposes</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Your Rights */}
          <section>
            <h2 className="text-2xl font-semibold text-text-primary mb-4 pb-2 border-b border-border-light">
              Your Data Rights
            </h2>

            <div className="space-y-4">
              <div>
                <h3 className="text-xl font-medium text-text-primary mb-2">Access Your Data</h3>
                <p className="text-text-secondary">
                  You can view all your data at any time within the app. To download a complete copy of all your data,
                  contact us at{' '}
                  <a href="mailto:privacy@lumimd.app" className="text-brand-primary hover:underline">
                    privacy@lumimd.app
                  </a>
                  .
                </p>
              </div>

              <div>
                <h3 className="text-xl font-medium text-text-primary mb-2">Delete Your Data</h3>
                <p className="text-text-secondary mb-2">
                  You can delete your account and all associated data at any time:
                </p>
                <ol className="list-decimal list-inside space-y-1 text-text-secondary ml-4">
                  <li>Navigate to Settings, then Account</li>
                  <li>Select Delete Account</li>
                  <li>Confirm the deletion</li>
                </ol>
                <p className="text-text-secondary mt-3 font-medium">When you delete your account:</p>
                <ul className="list-disc list-inside space-y-1 text-text-secondary ml-4">
                  <li>All visits, recordings, transcripts, and summaries are permanently deleted</li>
                  <li>All personal information is permanently deleted</li>
                  <li>All medications, allergies, and health history are permanently deleted</li>
                  <li>Your account is immediately deactivated</li>
                  <li>This action cannot be undone</li>
                </ul>
              </div>

              <div>
                <h3 className="text-xl font-medium text-text-primary mb-2">Correct Your Data</h3>
                <p className="text-text-secondary">
                  You can update your personal information at any time in the Settings section of the app.
                </p>
              </div>

              <div>
                <h3 className="text-xl font-medium text-text-primary mb-2">Export Your Data</h3>
                <p className="text-text-secondary">
                  Request a copy of your data in a portable format by emailing{' '}
                  <a href="mailto:privacy@lumimd.app" className="text-brand-primary hover:underline">
                    privacy@lumimd.app
                  </a>
                  . We will respond within 30 days.
                </p>
              </div>
            </div>
          </section>

          {/* Data Sharing */}
          <section>
            <h2 className="text-2xl font-semibold text-text-primary mb-4 pb-2 border-b border-border-light">
              Data Sharing
            </h2>

            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-medium text-text-primary mb-2">When We Share Your Data</h3>

                <div className="ml-4 space-y-4">
                  <div>
                    <p className="font-medium text-text-primary">With Your Permission</p>
                    <ul className="list-disc list-inside space-y-1 text-text-secondary ml-4">
                      <li>When you use our sharing feature to give caregivers access to your health information</li>
                      <li>When you explicitly authorize sharing with healthcare providers</li>
                    </ul>
                  </div>

                  <div>
                    <p className="font-medium text-text-primary">For Legal Reasons</p>
                    <ul className="list-disc list-inside space-y-1 text-text-secondary ml-4">
                      <li>To comply with valid legal processes such as court orders or subpoenas</li>
                      <li>To protect our rights or the safety of others</li>
                      <li>To detect, prevent, or address fraud or security issues</li>
                    </ul>
                  </div>

                  <div>
                    <p className="font-medium text-text-primary">With Service Providers</p>
                    <ul className="list-disc list-inside space-y-1 text-text-secondary ml-4">
                      <li><strong>Cloud Infrastructure Provider:</strong> Secure cloud storage and authentication services</li>
                      <li><strong>AI Transcription Service:</strong> Audio-to-text processing (data deleted immediately after processing)</li>
                      <li><strong>AI Summarization Service:</strong> Medical information extraction (zero data retention)</li>
                    </ul>
                    <p className="text-text-secondary mt-2">
                      All service providers are bound by strict confidentiality agreements and data processing terms.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-error-light/60 border-l-4 border-error p-4 rounded">
                <h3 className="text-lg font-semibold text-text-primary mb-2">What We Never Share</h3>
                <ul className="space-y-1 text-text-primary ml-4">
                  <li>Your data with advertisers or marketing companies</li>
                  <li>Your data with insurance companies</li>
                  <li>Your data for sale to any third party</li>
                  <li>Your data for purposes other than providing our service to you</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Data Retention */}
          <section>
            <h2 className="text-2xl font-semibold text-text-primary mb-4 pb-2 border-b border-border-light">
              Data Retention
            </h2>

            <div className="space-y-4">
              <div>
                <h3 className="text-xl font-medium text-text-primary mb-2">How Long We Keep Your Data</h3>
                <ul className="list-disc list-inside space-y-2 text-text-secondary ml-4">
                  <li><strong>Your Account Data:</strong> We retain your data as long as your account is active</li>
                  <li><strong>AI Processing Data:</strong> Deleted immediately after processing (see AI Processing section above)</li>
                  <li><strong>Audio Recordings:</strong> Stored securely until you delete them or delete your account</li>
                  <li><strong>Inactive Accounts:</strong> If you do not use the app for 2 years, we will email you before deleting your data</li>
                  <li><strong>Deleted Accounts:</strong> Data is immediately deleted with a 30-day recovery period</li>
                </ul>
              </div>

              <div>
                <h3 className="text-xl font-medium text-text-primary mb-2">Automated Privacy Measures</h3>
                <p className="text-text-secondary">
                  We run automated daily processes to ensure no sensitive data is retained longer than necessary. This includes sweeping for any orphaned transcription data or audio files that should have been deleted.
                </p>
              </div>

              <div>
                <h3 className="text-xl font-medium text-text-primary mb-2">Backups</h3>
                <p className="text-text-secondary">
                  Your data may remain in encrypted backup systems for up to 90 days after deletion, after which it is permanently erased.
                </p>
              </div>
            </div>
          </section>

          {/* Children's Privacy */}
          <section>
            <h2 className="text-2xl font-semibold text-text-primary mb-4 pb-2 border-b border-border-light">
              Children&apos;s Privacy
            </h2>
            <p className="text-text-secondary">
              LumiMD is not intended for use by children under 13 years of age. We do not knowingly collect personal information from children under 13. If you believe we have collected information from a child under 13, please contact us immediately at{' '}
              <a href="mailto:privacy@lumimd.app" className="text-brand-primary hover:underline">
                privacy@lumimd.app
              </a>
              .
            </p>
          </section>

          {/* CCPA */}
          <section>
            <h2 className="text-2xl font-semibold text-text-primary mb-4 pb-2 border-b border-border-light">
              California Privacy Rights (CCPA)
            </h2>
            <p className="text-text-secondary mb-4">
              If you are a California resident, you have the following additional rights under the California Consumer Privacy Act:
            </p>

            <div className="space-y-3 ml-4">
              <div>
                <h3 className="text-lg font-medium text-text-primary">Right to Know</h3>
                <p className="text-text-secondary">
                  You may request information about what personal data we collect, use, and share.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-medium text-text-primary">Right to Delete</h3>
                <p className="text-text-secondary">
                  You may request deletion of your personal data, subject to certain legal exceptions.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-medium text-text-primary">Right to Non-Discrimination</h3>
                <p className="text-text-secondary">
                  We will not discriminate against you for exercising your privacy rights.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-medium text-text-primary">No Sale of Personal Information</h3>
                <p className="text-text-secondary">
                  We do not sell your personal information to third parties.
                </p>
              </div>
            </div>

            <p className="text-text-secondary mt-4">
              <strong>To exercise your rights:</strong> Email{' '}
              <a href="mailto:privacy@lumimd.app" className="text-brand-primary hover:underline">
                privacy@lumimd.app
              </a>{' '}
              with your request.
            </p>
          </section>

          {/* GDPR */}
          <section>
            <h2 className="text-2xl font-semibold text-text-primary mb-4 pb-2 border-b border-border-light">
              European Privacy Rights (GDPR)
            </h2>
            <p className="text-text-secondary mb-4">
              If you are located in the European Union or European Economic Area, you have additional rights under the General Data Protection Regulation:
            </p>

            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-medium text-text-primary mb-2">Legal Basis for Processing</h3>
                <ul className="list-disc list-inside space-y-1 text-text-secondary ml-4">
                  <li><strong>Consent:</strong> You consent to data processing when you create an account and use our service</li>
                  <li><strong>Contract:</strong> Processing is necessary to provide the services you have requested</li>
                  <li><strong>Legitimate Interest:</strong> To improve our service and prevent fraud</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-medium text-text-primary mb-2">Your GDPR Rights</h3>
                <ul className="list-disc list-inside space-y-1 text-text-secondary ml-4">
                  <li>Right to access your personal data</li>
                  <li>Right to rectification of inaccurate data</li>
                  <li>Right to erasure of your data</li>
                  <li>Right to restrict processing</li>
                  <li>Right to data portability</li>
                  <li>Right to object to processing</li>
                  <li>Right to withdraw consent at any time</li>
                </ul>
              </div>
            </div>

            <p className="text-text-secondary mt-4">
              <strong>To exercise your rights:</strong> Email{' '}
              <a href="mailto:privacy@lumimd.app" className="text-brand-primary hover:underline">
                privacy@lumimd.app
              </a>
            </p>
          </section>

          {/* Cookies */}
          <section>
            <h2 className="text-2xl font-semibold text-text-primary mb-4 pb-2 border-b border-border-light">
              Cookies and Tracking
            </h2>

            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-medium text-text-primary mb-2">Cookies We Use</h3>
                <ul className="list-disc list-inside space-y-1 text-text-secondary ml-4">
                  <li><strong>Essential Cookies:</strong> Required for authentication and security</li>
                  <li><strong>Analytics Cookies:</strong> To understand how you use the app (anonymized data only)</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-medium text-text-primary mb-2">What We Do Not Use</h3>
                <ul className="list-disc list-inside space-y-1 text-text-secondary ml-4">
                  <li>Advertising or marketing cookies</li>
                  <li>Third-party tracking for advertising purposes</li>
                  <li>Cross-site tracking</li>
                </ul>
              </div>
            </div>

            <p className="text-text-secondary mt-3">
              You can disable non-essential cookies in your browser settings, though this may affect some functionality.
            </p>
          </section>

          {/* Policy Changes */}
          <section>
            <h2 className="text-2xl font-semibold text-text-primary mb-4 pb-2 border-b border-border-light">
              Changes to This Policy
            </h2>
            <p className="text-text-secondary mb-3">
              We may update this policy from time to time. If we make significant changes, we will notify you through:
            </p>
            <ul className="list-disc list-inside space-y-1 text-text-secondary ml-4">
              <li>Email to your registered email address</li>
              <li>In-app notification</li>
              <li>A notice on our website</li>
            </ul>
            <p className="text-text-secondary mt-3">
              Your continued use of LumiMD after changes are posted constitutes your acceptance of the updated policy.
            </p>
          </section>

          {/* International Transfers */}
          <section>
            <h2 className="text-2xl font-semibold text-text-primary mb-4 pb-2 border-b border-border-light">
              International Data Transfers
            </h2>
            <p className="text-text-secondary">
              Your data is processed and stored in the United States. If you are located outside the United States, your data will be transferred to and processed in the U.S. We implement appropriate safeguards to protect your data during transfer and processing.
            </p>
          </section>

          {/* Contact */}
          <section className="bg-background-subtle p-6 rounded-lg border border-border-light">
            <h2 className="text-2xl font-semibold text-text-primary mb-4">Contact Us</h2>
            <div className="space-y-2 text-text-secondary">
              <p>
                <strong>Privacy Questions:</strong>{' '}
                <a href="mailto:privacy@lumimd.app" className="text-brand-primary hover:underline">
                  privacy@lumimd.app
                </a>
              </p>
              <p>
                <strong>General Support:</strong>{' '}
                <a href="mailto:support@lumimd.app" className="text-brand-primary hover:underline">
                  support@lumimd.app
                </a>
              </p>
              <p>
                <strong>Website:</strong>{' '}
                <a href="https://lumimd.app" className="text-brand-primary hover:underline">
                  lumimd.app
                </a>
              </p>
            </div>
          </section>

          {/* Summary */}
          <section>
            <h2 className="text-2xl font-semibold text-text-primary mb-4 pb-2 border-b border-border-light">
              Summary
            </h2>

            <div className="space-y-4">
              <div className="bg-brand-primary-pale/80 border-l-4 border-brand-primary p-4 rounded">
                <p className="font-semibold text-text-primary mb-2">What We Do</p>
                <ul className="list-disc list-inside space-y-1 text-text-secondary ml-4">
                  <li>Keep your health information secure with encryption at rest and in transit</li>
                  <li>Use AI to transcribe and summarize your visits with zero data retention</li>
                  <li>Delete AI processing data immediately after use</li>
                  <li>Give you complete control to view, download, and delete your data at any time</li>
                </ul>
              </div>

              <div className="bg-error-light/60 border-l-4 border-error p-4 rounded">
                <p className="font-semibold text-text-primary mb-2">What We Do Not Do</p>
                <ul className="list-disc list-inside space-y-1 text-text-secondary ml-4">
                  <li>Sell your data to any third party</li>
                  <li>Share your data with advertisers or insurance companies</li>
                  <li>Retain your data on AI systems longer than necessary for processing</li>
                  <li>Use your data for any purpose other than providing our service</li>
                </ul>
              </div>

              <div className="bg-info-light/70 border-l-4 border-info p-4 rounded">
                <p className="font-semibold text-text-primary mb-2">Your Rights</p>
                <ul className="list-disc list-inside space-y-1 text-text-secondary ml-4">
                  <li>Access, view, and download your data at any time</li>
                  <li>Delete your account and all associated data</li>
                  <li>Control who has access to your health information</li>
                  <li>Contact us with any questions about your privacy</li>
                </ul>
              </div>
            </div>

            <p className="text-text-secondary mt-4">
              <strong>Questions?</strong> We are here to help:{' '}
              <a href="mailto:privacy@lumimd.app" className="text-brand-primary hover:underline">
                privacy@lumimd.app
              </a>
            </p>
          </section>
        </div>

        {/* Footer */}
        <footer className="text-center mt-12 pt-8 border-t border-border-light text-text-secondary">
          <p>
            Policy Version: 2.1 (Beta) | Last Reviewed: January 8, 2026
          </p>
          <p className="mt-2">
            &copy; 2026 LumiMD. All rights reserved.
          </p>
        </footer>
      </div>
    </div>
  );
}
