import Link from "next/link";
import Image from "next/image";

export function Footer() {
    return (
        <footer className="border-t border-border/40 bg-background py-12 md:py-16">
            <div className="mx-auto max-w-7xl px-6 flex flex-col md:flex-row justify-between gap-8 md:gap-12">
                {/* Brand & Copyright */}
                <div className="space-y-4 md:max-w-xs">
                    <Link href="/" className="flex items-center gap-2 text-foreground hover:opacity-80 transition-opacity">
                        <div className="relative h-6 w-6">
                            <Image
                                src="/images/logo-icon.png"
                                alt="Assemblr Logo"
                                fill
                                className="object-contain"
                            />
                        </div>
                        <span className="font-semibold tracking-tight">Assemblr</span>
                    </Link>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        Orchestrating AI agents to build governed internal tools and workflows in seconds.
                    </p>
                    <p className="text-sm text-muted-foreground/60">
                        © {new Date().getFullYear()} Assemblr Inc. All rights reserved.
                    </p>
                </div>

                {/* Links Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-8 md:gap-16">
                    <div className="space-y-3">
                        <h4 className="text-sm font-semibold text-foreground">Product</h4>
                        <ul className="space-y-2 text-sm text-muted-foreground">
                            <li><Link href="/" className="hover:text-foreground transition-colors">Home</Link></li>
                            <li><Link href="/use-cases" className="hover:text-foreground transition-colors">Use Cases</Link></li>
                            <li><Link href="/login" className="hover:text-foreground transition-colors">Login</Link></li>
                        </ul>
                    </div>

                    <div className="space-y-3">
                        <h4 className="text-sm font-semibold text-foreground">Legal</h4>
                        <ul className="space-y-2 text-sm text-muted-foreground">
                            <li><Link href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link></li>
                            <li><Link href="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link></li>
                            <li><Link href="mailto:legal@assemblr.ai" className="hover:text-foreground transition-colors">Contact</Link></li>
                        </ul>
                    </div>

                    <div className="space-y-3">
                        <h4 className="text-sm font-semibold text-foreground">Social</h4>
                        <ul className="space-y-2 text-sm text-muted-foreground">
                            <li><Link href="https://twitter.com/assemblr_ai" className="hover:text-foreground transition-colors">Twitter / X</Link></li>
                            <li><Link href="https://github.com/assemblr-ai" className="hover:text-foreground transition-colors">GitHub</Link></li>
                            <li><Link href="https://linkedin.com/company/assemblr-ai" className="hover:text-foreground transition-colors">LinkedIn</Link></li>
                        </ul>
                    </div>
                </div>
            </div>
        </footer>
    );
}
