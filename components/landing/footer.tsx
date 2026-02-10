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


            </div>
        </footer>
    );
}
