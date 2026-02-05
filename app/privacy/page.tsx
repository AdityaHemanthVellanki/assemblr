import Link from "next/link";
import { Footer } from "@/components/landing/footer";

export default function PrivacyPage() {
    return (
        <div className="min-h-screen bg-background text-foreground flex flex-col">
            {/* Simple Header */}
            <header className="border-b border-border/40 bg-background/80 backdrop-blur-xl sticky top-0 z-50">
                <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
                    <Link href="/" className="font-semibold tracking-tight text-lg">
                        Assemblr
                    </Link>
                    <div className="flex gap-4 text-sm font-medium">
                        <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">Return Home</Link>
                    </div>
                </div>
            </header>

            <main className="flex-1 px-6 py-16 md:py-24">
                <article className="mx-auto max-w-3xl prose prose-slate dark:prose-invert prose-headings:scroll-mt-20">
                    <h1 className="text-4xl font-bold tracking-tight mb-4">Privacy Policy</h1>
                    <p className="lead text-xl text-muted-foreground mb-12">
                        Last Updated: February 5, 2026
                    </p>

                    <p>
                        Assemblr Inc. ("Assemblr", "we", "us", or "our") respects your privacy and is committed to protecting your personal data. This Privacy Policy explains how we collect, use, and share information about you when you use our website, AI-powered tools, and services (collectively, the "Service").
                    </p>

                    <h2>1. Information We Collect</h2>
                    <p>We collect information you provide directly to us, information collected automatically, and information from third-party sources.</p>

                    <h3>1.1 Information You Provide</h3>
                    <ul>
                        <li><strong>Account Information:</strong> When you register, we collect your name, email address, password/authentication credentials, and organization details.</li>
                        <li><strong>Input Data & Prompts:</strong> We collect the text prompts, file uploads, and specific instructions you provide to generate tools or workflows.</li>
                        <li><strong>Integration Credentials:</strong> To power our integrations, we securely store encrypted access tokens (OAuth) or API keys for services you choose to connect (e.g., GitHub, Slack, Linear, Google).</li>
                        <li><strong>Communications:</strong> If you contact us for support, we collect the content of your messages.</li>
                    </ul>

                    <h3>1.2 Information Collected Automatically</h3>
                    <ul>
                        <li><strong>Usage Data:</strong> We log how you interact with the Service, including tool generation frequency, error logs, and performance metrics.</li>
                        <li><strong>Device Information:</strong> We collect IP address, browser type, operating system, and device identifiers.</li>
                        <li><strong>Cookies:</strong> We use cookies to maintain your session and preferences.</li>
                    </ul>

                    <h2>2. How We Use Your Information</h2>
                    <p>We use the collected data to:</p>
                    <ul>
                        <li>Provide, maintain, and improve the Service.</li>
                        <li>Process your prompts using Large Language Models (LLMs) to generate code and workflows.</li>
                        <li>Execute integrations on your behalf (e.g., fetching Linear issues, creating GitHub repositories).</li>
                        <li>Monitor and analyze trends, usage, and activities.</li>
                        <li>Detect, investigate, and prevent fraudulent transactions and other illegal activities.</li>
                        <li>Personalize your experience and send you technical notices and support messages.</li>
                    </ul>

                    <h2>3. AI & Data Processing</h2>
                    <p>
                        Assemblr utilizes third-party AI models (e.g., Azure OpenAI) to process your prompts.
                    </p>
                    <ul>
                        <li><strong>No Training on User Data:</strong> We do <strong>not</strong> use your proprietary tool specifications, integration data, or private prompts to train our foundation models without your explicit consent.</li>
                        <li><strong>Data Retention:</strong> Direct inputs to the AI models may be temporarily retained by our providers for abuse monitoring, subject to their respective enterprise privacy policies.</li>
                    </ul>

                    <h2>4. Third-Party Integrations</h2>
                    <p>
                        Our Service allows you to connect with third-party platforms (e.g., Google Workspace, GitHub, Slack).
                    </p>
                    <ul>
                        <li><strong>Scope of Access:</strong> We only access data required to fulfill the specific workflows you define (e.g., "Read Issues", "Send Message").</li>
                        <li><strong>Credential Security:</strong> Tokens are encrypted at rest using industry-standard AES-256 encryption.</li>
                        <li><strong>Platform Policies:</strong> Your use of third-party integrations is also subject to the privacy policies of those platforms.</li>
                    </ul>
                    <p className="text-sm text-muted-foreground bg-muted/30 p-4 rounded-md border border-border/50">
                        <strong>Google User Data:</strong> Assemblr's use and transfer of information received from Google APIs to any other app will adhere to <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" className="underline">Google API Services User Data Policy</a>, including the Limited Use requirements.
                    </p>

                    <h2>5. Data Sharing & Disclosure</h2>
                    <p>We do not sell your personal data. We may share your information in the following circumstances:</p>
                    <ul>
                        <li><strong>Service Providers:</strong> With vendors who perform services for us (e.g., cloud hosting, AI inference, payment processing).</li>
                        <li><strong>Legal Requirements:</strong> If required by law, subpoena, or legal process.</li>
                        <li><strong>Business Transfers:</strong> In connection with a merger, sale of assets, or financing.</li>
                    </ul>

                    <h2>6. Data Security</h2>
                    <p>
                        We implement commercially reasonable technical and organizational measures to protect your data. However, no security system is impenetrable, and we cannot guarantee the absolute security of our systems.
                    </p>

                    <h2>7. Your Rights</h2>
                    <p>Depending on your location, you may have the right to:</p>
                    <ul>
                        <li>Access the personal data we hold about you.</li>
                        <li>Request correction or deletion of your data.</li>
                        <li>Object to or restrict our processing of your data.</li>
                    </ul>
                    <p>To exercise these rights, please contact us at <a href="mailto:privacy@assemblr.ai">privacy@assemblr.ai</a>.</p>

                    <h2>8. Retention</h2>
                    <p>
                        We retain your data for as long as your account is active or as needed to provide you the Service. We may retain certain information for legitimate business purposes or as required by law.
                    </p>

                    <h2>9. International Transfers</h2>
                    <p>
                        Your information may be transferred to and processed in countries other than your country of residence, where data protection laws may differ. We ensure appropriate safeguards are in place for such transfers.
                    </p>

                    <h2>10. Changes to this Policy</h2>
                    <p>
                        We may update this Privacy Policy from time to time. If we make material changes, we will notify you by email or through the Service.
                    </p>

                    <h2>11. Contact Us</h2>
                    <p>
                        If you have questions about this Privacy Policy, please contact us at:
                    </p>
                    <address className="not-italic">
                        <strong>Assemblr Inc.</strong><br />
                        Email: <a href="mailto:privacy@assemblr.ai">privacy@assemblr.ai</a>
                    </address>
                </article>
            </main>

            <Footer />
        </div>
    );
}
