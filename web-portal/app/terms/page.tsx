import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Terms of Service - LumiMD',
    description: 'LumiMD Terms of Service - Terms and conditions for using LumiMD',
};

export default function TermsOfServicePage() {
    return (
        <div className="min-h-screen bg-background">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                {/* Header */}
                <header className="text-center pb-10 mb-12">
                    <div className="inline-flex items-center gap-2 rounded-full bg-brand-primary-pale px-4 py-2 text-sm font-semibold text-brand-primary-dark">
                        Legal
                    </div>
                    <h1 className="mt-4 text-4xl font-bold text-text-primary tracking-tight">
                        Terms of Service
                    </h1>
                    <p className="mt-3 text-text-secondary">
                        Effective Date: December 17, 2024 | Last Updated: December 17, 2024
                    </p>
                </header>

                <div className="bg-surface rounded-2xl shadow-elevated p-8 sm:p-10 space-y-10 border border-border-light">
                    {/* Introduction */}
                    <section>
                        <h2 className="text-2xl font-semibold text-text-primary mb-4 pb-2 border-b border-border-light">
                            Agreement to Terms
                        </h2>
                        <p className="text-text-secondary mb-4">
                            These Terms of Service (&quot;Terms&quot;) govern your access to and use of LumiMD, including our mobile application and web portal (collectively, the &quot;Service&quot;). By creating an account or using LumiMD, you agree to be bound by these Terms.
                        </p>
                        <p className="text-text-secondary">
                            LumiMD is operated by LumiMD LLC (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;). If you do not agree to these Terms, you may not use the Service.
                        </p>
                    </section>

                    {/* Service Description */}
                    <section>
                        <h2 className="text-2xl font-semibold text-text-primary mb-4 pb-2 border-b border-border-light">
                            Description of Service
                        </h2>
                        <p className="text-text-secondary mb-4">
                            LumiMD is a personal health management application that allows you to:
                        </p>
                        <ul className="list-disc list-inside space-y-2 text-text-secondary ml-4">
                            <li><strong>Record Healthcare Visits:</strong> Record audio of your medical appointments for personal reference</li>
                            <li><strong>Generate Transcripts:</strong> Automatically transcribe visit recordings using AI technology</li>
                            <li><strong>Create Summaries:</strong> Generate AI-powered summaries including diagnoses, medications, and action items</li>
                            <li><strong>Track Medications:</strong> Maintain a list of your medications with safety alerts for potential interactions</li>
                            <li><strong>Share with Caregivers:</strong> Optionally share your health information with designated caregivers</li>
                            <li><strong>Manage Action Items:</strong> Track follow-up tasks and appointments from your visits</li>
                        </ul>
                    </section>

                    {/* Medical Disclaimer */}
                    <section>
                        <h2 className="text-2xl font-semibold text-text-primary mb-4 pb-2 border-b border-border-light">
                            Medical Disclaimer
                        </h2>
                        <div className="bg-error-light/60 border-l-4 border-error p-4 rounded mb-4">
                            <p className="text-text-primary font-semibold mb-2">Important: LumiMD Is Not a Medical Service</p>
                            <p className="text-text-secondary">
                                LumiMD is a personal organization tool. It is not a substitute for professional medical advice, diagnosis, or treatment.
                            </p>
                        </div>
                        <div className="space-y-4 text-text-secondary">
                            <p>
                                <strong>Not Medical Advice:</strong> The information provided by LumiMD, including AI-generated summaries, transcripts, medication information, and drug interaction alerts, is for informational and organizational purposes only. It should not be relied upon as medical advice.
                            </p>
                            <p>
                                <strong>AI Limitations:</strong> Our AI technology, while designed to be helpful, may produce errors, miss important information, or misinterpret medical terminology. Always verify any information with your healthcare provider.
                            </p>
                            <p>
                                <strong>Drug Interaction Alerts:</strong> Medication safety alerts are informational only and may not capture all potential interactions. Always consult your pharmacist or prescribing physician about medication safety.
                            </p>
                            <p>
                                <strong>Emergency Situations:</strong> LumiMD is not designed for emergency use. If you are experiencing a medical emergency, call 911 or your local emergency services immediately.
                            </p>
                            <p>
                                <strong>Healthcare Provider Relationship:</strong> Use of LumiMD does not create a healthcare provider-patient relationship. Your relationship is with your own healthcare providers.
                            </p>
                        </div>
                    </section>

                    {/* Eligibility */}
                    <section>
                        <h2 className="text-2xl font-semibold text-text-primary mb-4 pb-2 border-b border-border-light">
                            Eligibility
                        </h2>
                        <p className="text-text-secondary mb-4">
                            To use LumiMD, you must:
                        </p>
                        <ul className="list-disc list-inside space-y-2 text-text-secondary ml-4">
                            <li>Be at least 18 years of age, or the age of majority in your jurisdiction</li>
                            <li>Have the legal capacity to enter into a binding agreement</li>
                            <li>Provide accurate and complete registration information</li>
                            <li>Not be prohibited from using the Service under applicable law</li>
                        </ul>
                        <p className="text-text-secondary mt-4">
                            LumiMD is not intended for use by children under 13 years of age.
                        </p>
                    </section>

                    {/* Account Responsibilities */}
                    <section>
                        <h2 className="text-2xl font-semibold text-text-primary mb-4 pb-2 border-b border-border-light">
                            Account Responsibilities
                        </h2>
                        <div className="space-y-4 text-text-secondary">
                            <p>
                                <strong>Account Security:</strong> You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. Notify us immediately of any unauthorized access.
                            </p>
                            <p>
                                <strong>Accurate Information:</strong> You agree to provide accurate, current, and complete information during registration and to update such information as necessary.
                            </p>
                            <p>
                                <strong>One Account Per Person:</strong> Each individual may only maintain one account. Creating multiple accounts may result in termination of all accounts.
                            </p>
                            <p>
                                <strong>Account Sharing:</strong> You may not share your account credentials with others. Use the caregiver sharing feature to grant others access to your health information.
                            </p>
                        </div>
                    </section>

                    {/* Recording Consent */}
                    <section>
                        <h2 className="text-2xl font-semibold text-text-primary mb-4 pb-2 border-b border-border-light">
                            Recording Consent and Legal Compliance
                        </h2>
                        <div className="bg-warning-light/60 border-l-4 border-warning p-4 rounded mb-4">
                            <p className="text-text-primary font-semibold">Your Responsibility</p>
                            <p className="text-text-secondary">
                                You are solely responsible for ensuring that your use of the recording feature complies with all applicable laws.
                            </p>
                        </div>
                        <div className="space-y-4 text-text-secondary">
                            <p>
                                <strong>Consent Requirements:</strong> Many jurisdictions require consent from all parties before recording a conversation. You agree to obtain any necessary consent before recording your healthcare visits.
                            </p>
                            <p>
                                <strong>Healthcare Facility Policies:</strong> Some healthcare facilities have policies regarding recording. You agree to comply with any applicable facility policies.
                            </p>
                            <p>
                                <strong>Legal Compliance:</strong> You agree to use the recording feature only in compliance with all applicable federal, state, and local laws, including but not limited to wiretapping and eavesdropping laws.
                            </p>
                            <p>
                                <strong>Indemnification:</strong> You agree to indemnify and hold LumiMD harmless from any claims arising from your use of the recording feature without proper consent or in violation of applicable law.
                            </p>
                        </div>
                    </section>

                    {/* Acceptable Use */}
                    <section>
                        <h2 className="text-2xl font-semibold text-text-primary mb-4 pb-2 border-b border-border-light">
                            Acceptable Use
                        </h2>
                        <p className="text-text-secondary mb-4">
                            You agree not to use LumiMD to:
                        </p>
                        <ul className="list-disc list-inside space-y-2 text-text-secondary ml-4">
                            <li>Violate any applicable law or regulation</li>
                            <li>Record conversations without required consent</li>
                            <li>Upload content that infringes on the rights of others</li>
                            <li>Attempt to gain unauthorized access to the Service or other users&apos; accounts</li>
                            <li>Interfere with or disrupt the Service or servers</li>
                            <li>Use the Service for any commercial purpose without our prior written consent</li>
                            <li>Reverse engineer, decompile, or disassemble any aspect of the Service</li>
                            <li>Use the Service to store or transmit malicious code</li>
                            <li>Harass, abuse, or harm another person</li>
                            <li>Impersonate any person or entity</li>
                        </ul>
                    </section>

                    {/* Intellectual Property */}
                    <section>
                        <h2 className="text-2xl font-semibold text-text-primary mb-4 pb-2 border-b border-border-light">
                            Intellectual Property
                        </h2>
                        <div className="space-y-4 text-text-secondary">
                            <p>
                                <strong>Our Property:</strong> The Service, including its design, features, and content (excluding your personal data), is owned by LumiMD and protected by copyright, trademark, and other intellectual property laws.
                            </p>
                            <p>
                                <strong>Your Content:</strong> You retain ownership of your personal health information, recordings, and other content you upload to the Service. By using the Service, you grant us a limited license to process your content solely to provide the Service to you.
                            </p>
                            <p>
                                <strong>Feedback:</strong> If you provide feedback or suggestions about the Service, you grant us the right to use such feedback without restriction or compensation.
                            </p>
                        </div>
                    </section>

                    {/* Third-Party Services */}
                    <section>
                        <h2 className="text-2xl font-semibold text-text-primary mb-4 pb-2 border-b border-border-light">
                            Third-Party Services
                        </h2>
                        <p className="text-text-secondary mb-4">
                            LumiMD uses third-party services to provide certain functionality:
                        </p>
                        <ul className="list-disc list-inside space-y-2 text-text-secondary ml-4">
                            <li><strong>AssemblyAI:</strong> For audio transcription services</li>
                            <li><strong>OpenAI:</strong> For AI-powered summarization and analysis</li>
                            <li><strong>Google Firebase:</strong> For authentication, data storage, and cloud infrastructure</li>
                        </ul>
                        <p className="text-text-secondary mt-4">
                            Your use of these services is subject to their respective terms of service. We are not responsible for the actions of these third-party providers, except as described in our Privacy Policy.
                        </p>
                    </section>

                    {/* Subscription and Payment */}
                    <section>
                        <h2 className="text-2xl font-semibold text-text-primary mb-4 pb-2 border-b border-border-light">
                            Subscription and Payment
                        </h2>
                        <div className="space-y-4 text-text-secondary">
                            <p>
                                <strong>Free and Paid Features:</strong> LumiMD may offer both free and paid subscription tiers. Certain features may require a paid subscription.
                            </p>
                            <p>
                                <strong>Subscription Terms:</strong> Paid subscriptions automatically renew unless cancelled before the renewal date. You may cancel at any time through your account settings.
                            </p>
                            <p>
                                <strong>Refunds:</strong> Refunds are provided in accordance with the policies of the platform through which you subscribed (Apple App Store, Google Play Store, or direct subscription).
                            </p>
                            <p>
                                <strong>Price Changes:</strong> We may change subscription prices with reasonable notice. Price changes will not affect your current billing period.
                            </p>
                        </div>
                    </section>

                    {/* Termination */}
                    <section>
                        <h2 className="text-2xl font-semibold text-text-primary mb-4 pb-2 border-b border-border-light">
                            Termination
                        </h2>
                        <div className="space-y-4 text-text-secondary">
                            <p>
                                <strong>By You:</strong> You may terminate your account at any time by deleting your account through the app settings. Upon deletion, your data will be permanently removed as described in our Privacy Policy.
                            </p>
                            <p>
                                <strong>By Us:</strong> We may suspend or terminate your access to the Service if you violate these Terms, engage in conduct harmful to other users or the Service, or for any other reason with reasonable notice.
                            </p>
                            <p>
                                <strong>Effect of Termination:</strong> Upon termination, your right to use the Service ceases immediately. Provisions that by their nature should survive termination will survive, including intellectual property provisions, disclaimers, and limitations of liability.
                            </p>
                        </div>
                    </section>

                    {/* Disclaimers */}
                    <section>
                        <h2 className="text-2xl font-semibold text-text-primary mb-4 pb-2 border-b border-border-light">
                            Disclaimers
                        </h2>
                        <div className="bg-background-subtle p-4 rounded border border-border-light text-text-secondary space-y-4">
                            <p>
                                THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
                            </p>
                            <p>
                                WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE. WE DO NOT WARRANT THE ACCURACY, COMPLETENESS, OR RELIABILITY OF ANY CONTENT, INCLUDING AI-GENERATED CONTENT.
                            </p>
                            <p>
                                THE AI FEATURES, INCLUDING TRANSCRIPTION AND SUMMARIZATION, MAY CONTAIN ERRORS. YOU ACKNOWLEDGE THAT YOU SHOULD NOT RELY SOLELY ON AI-GENERATED CONTENT FOR MEDICAL DECISIONS.
                            </p>
                        </div>
                    </section>

                    {/* Limitation of Liability */}
                    <section>
                        <h2 className="text-2xl font-semibold text-text-primary mb-4 pb-2 border-b border-border-light">
                            Limitation of Liability
                        </h2>
                        <div className="bg-background-subtle p-4 rounded border border-border-light text-text-secondary space-y-4">
                            <p>
                                TO THE MAXIMUM EXTENT PERMITTED BY LAW, LUMIMD AND ITS AFFILIATES, OFFICERS, EMPLOYEES, AND AGENTS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, DATA, OR USE, ARISING OUT OF OR RELATED TO YOUR USE OF THE SERVICE.
                            </p>
                            <p>
                                IN NO EVENT SHALL OUR TOTAL LIABILITY TO YOU EXCEED THE GREATER OF (A) THE AMOUNT YOU PAID US IN THE TWELVE MONTHS PRECEDING THE CLAIM, OR (B) ONE HUNDRED DOLLARS ($100).
                            </p>
                            <p>
                                SOME JURISDICTIONS DO NOT ALLOW THE EXCLUSION OF CERTAIN WARRANTIES OR LIMITATION OF LIABILITY, SO SOME OF THE ABOVE LIMITATIONS MAY NOT APPLY TO YOU.
                            </p>
                        </div>
                    </section>

                    {/* Indemnification */}
                    <section>
                        <h2 className="text-2xl font-semibold text-text-primary mb-4 pb-2 border-b border-border-light">
                            Indemnification
                        </h2>
                        <p className="text-text-secondary">
                            You agree to indemnify, defend, and hold harmless LumiMD, its affiliates, and their respective officers, directors, employees, and agents from and against any claims, liabilities, damages, losses, and expenses (including reasonable attorneys&apos; fees) arising out of or in any way connected with your use of the Service, your violation of these Terms, or your violation of any rights of another person or entity.
                        </p>
                    </section>

                    {/* Dispute Resolution */}
                    <section>
                        <h2 className="text-2xl font-semibold text-text-primary mb-4 pb-2 border-b border-border-light">
                            Dispute Resolution
                        </h2>
                        <div className="space-y-4 text-text-secondary">
                            <p>
                                <strong>Informal Resolution:</strong> Before filing a formal dispute, you agree to contact us at legal@lumimd.app to attempt to resolve the dispute informally.
                            </p>
                            <p>
                                <strong>Arbitration:</strong> Any dispute not resolved informally shall be resolved through binding arbitration in accordance with the rules of the American Arbitration Association. The arbitration shall take place in the State of Texas, and judgment on the arbitration award may be entered in any court having jurisdiction.
                            </p>
                            <p>
                                <strong>Class Action Waiver:</strong> You agree to resolve disputes with us on an individual basis and waive your right to participate in a class action lawsuit or class-wide arbitration.
                            </p>
                            <p>
                                <strong>Exceptions:</strong> Either party may bring claims in small claims court if eligible, or seek injunctive relief for intellectual property infringement.
                            </p>
                        </div>
                    </section>

                    {/* Governing Law */}
                    <section>
                        <h2 className="text-2xl font-semibold text-text-primary mb-4 pb-2 border-b border-border-light">
                            Governing Law
                        </h2>
                        <p className="text-text-secondary">
                            These Terms and your use of the Service shall be governed by and construed in accordance with the laws of the State of Texas, without regard to its conflict of law principles.
                        </p>
                    </section>

                    {/* Changes to Terms */}
                    <section>
                        <h2 className="text-2xl font-semibold text-text-primary mb-4 pb-2 border-b border-border-light">
                            Changes to These Terms
                        </h2>
                        <p className="text-text-secondary mb-4">
                            We may update these Terms from time to time. If we make material changes, we will notify you through:
                        </p>
                        <ul className="list-disc list-inside space-y-1 text-text-secondary ml-4">
                            <li>Email to your registered email address</li>
                            <li>In-app notification</li>
                            <li>A notice on our website</li>
                        </ul>
                        <p className="text-text-secondary mt-4">
                            Your continued use of LumiMD after changes become effective constitutes your acceptance of the revised Terms.
                        </p>
                    </section>

                    {/* Miscellaneous */}
                    <section>
                        <h2 className="text-2xl font-semibold text-text-primary mb-4 pb-2 border-b border-border-light">
                            General Provisions
                        </h2>
                        <div className="space-y-4 text-text-secondary">
                            <p>
                                <strong>Entire Agreement:</strong> These Terms, together with our Privacy Policy, constitute the entire agreement between you and LumiMD regarding the Service.
                            </p>
                            <p>
                                <strong>Severability:</strong> If any provision of these Terms is found to be unenforceable, the remaining provisions will continue in effect.
                            </p>
                            <p>
                                <strong>Waiver:</strong> Our failure to enforce any provision of these Terms shall not be deemed a waiver of such provision or our right to enforce it.
                            </p>
                            <p>
                                <strong>Assignment:</strong> You may not assign your rights under these Terms without our prior written consent. We may assign our rights without restriction.
                            </p>
                            <p>
                                <strong>No Agency:</strong> Nothing in these Terms creates any agency, partnership, or joint venture relationship between you and LumiMD.
                            </p>
                        </div>
                    </section>

                    {/* Contact */}
                    <section className="bg-background-subtle p-6 rounded-lg border border-border-light">
                        <h2 className="text-2xl font-semibold text-text-primary mb-4">Contact Us</h2>
                        <div className="space-y-2 text-text-secondary">
                            <p>
                                <strong>Legal Questions:</strong>{' '}
                                <a href="mailto:legal@lumimd.app" className="text-brand-primary hover:underline">
                                    legal@lumimd.app
                                </a>
                            </p>
                            <p>
                                <strong>General Support:</strong>{' '}
                                <a href="mailto:support@lumimd.app" className="text-brand-primary hover:underline">
                                    support@lumimd.app
                                </a>
                            </p>
                            <p>
                                <strong>Privacy Questions:</strong>{' '}
                                <a href="mailto:privacy@lumimd.app" className="text-brand-primary hover:underline">
                                    privacy@lumimd.app
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
                </div>

                {/* Footer */}
                <footer className="text-center mt-12 pt-8 border-t border-border-light text-text-secondary">
                    <p>
                        Terms Version: 1.0 | Last Reviewed: December 17, 2024
                    </p>
                    <p className="mt-2">
                        &copy; 2024 LumiMD. All rights reserved.
                    </p>
                    <p className="mt-4">
                        <a href="/privacy" className="text-brand-primary hover:underline">
                            Privacy Policy
                        </a>
                    </p>
                </footer>
            </div>
        </div>
    );
}
