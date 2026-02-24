"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import {
  LazyMotion,
  m,
  domAnimation,
  useScroll,
  useTransform,
  useMotionValueEvent,
} from "framer-motion";
import { useRouter } from "next/navigation";
import { createSupabaseClient } from "@/lib/supabase/client";

import { Button } from "@/components/ui/button";
import { useCases } from "@/lib/use-cases/registry";
import { UseCaseCard } from "@/components/use-cases/use-case-card";
import { ProductSimulation } from "@/components/landing/product-simulation";
import { Footer } from "@/components/landing/footer";
import { ArrowRight } from "lucide-react";
import { fadeUp, staggerContainer, staggerItem } from "@/lib/ui/motion";

// --- Components ---

function EnterSystemButton({ children, className, size = "lg" }: { children: React.ReactNode; className?: string, size?: "default" | "sm" | "lg" | "icon" }) {
  const router = useRouter();
  const handleEnter = React.useCallback(async () => {
    const supabase = createSupabaseClient();
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      router.push("/app/chat");
    } else {
      router.push("/login");
    }
  }, [router]);

  return (
    <Button onClick={handleEnter} size={size} className={`rounded-full shadow-lg hover:shadow-primary/25 transition-all group gap-2 ${className ?? ""}`}>
      {children}
      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
    </Button>
  );
}

export default function Home() {
  const featuredUseCases = useCases.slice(0, 6);
  const [scrolled, setScrolled] = React.useState(false);

  // Parallax for background orbs
  const { scrollY } = useScroll();
  const orbY1 = useTransform(scrollY, [0, 1000], [0, 300]);
  const orbY2 = useTransform(scrollY, [0, 1000], [0, 200]);

  // Nav border reveal on scroll
  useMotionValueEvent(scrollY, "change", (latest) => {
    setScrolled(latest > 50);
  });

  return (
    <LazyMotion features={domAnimation}>
      <div className="dark min-h-dvh bg-background text-foreground overflow-x-hidden selection:bg-primary/20 selection:text-primary">

        {/* Navigation Header — border reveals on scroll */}
        <header
          className={`fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60 transition-all duration-300 ${
            scrolled
              ? "border-b border-border/40 shadow-sm"
              : "border-b border-transparent"
          }`}
        >
          <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
            <Link href="/" className="flex items-center gap-2 group">
              <div className="relative h-8 w-8 transition-transform group-hover:scale-105">
                <Image
                  src="/images/logo-icon.png"
                  alt="Assemblr Logo"
                  fill
                  className="object-contain"
                />
              </div>
              <span className="text-lg font-semibold tracking-tight">Assemblr</span>
            </Link>
            <div className="flex items-center gap-6">
              <Link
                href="/use-cases"
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground hover:underline decoration-border/0 hover:decoration-border underline-offset-4"
              >
                Use Cases
              </Link>
            </div>
          </nav>
        </header>

        <main className="relative pt-24 sm:pt-32">
          {/* Background Elements — parallax orbs */}
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(30,41,59,0.3),_transparent_70%)]" />
          <m.div
            style={{ y: orbY1 }}
            className="absolute top-0 right-[-20%] h-[500px] w-[500px] rounded-full bg-blue-500/10 blur-[100px] pointer-events-none"
          />
          <m.div
            style={{ y: orbY2 }}
            className="absolute top-[20%] left-[-20%] h-[500px] w-[500px] rounded-full bg-indigo-500/10 blur-[100px] pointer-events-none"
          />

          {/* Hero Section */}
          <section className="mx-auto flex max-w-5xl flex-col items-center gap-8 px-6 pb-20 pt-10 text-center sm:pb-32">
            <m.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              custom={0}
              variants={fadeUp}
              className="flex items-center gap-2 rounded-full border border-border/60 bg-muted/30 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur-md"
            >
              <span className="flex h-1.5 w-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgb(59,130,246)]"></span>
              AI Agent Infrastructure
            </m.div>

            <m.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              custom={0.1}
              variants={fadeUp}
            >
              <h1 className="text-5xl font-semibold tracking-tight sm:text-7xl leading-[1.1]">
                Words to tools in{" "}
                <span className="animated-gradient-text bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-500 bg-clip-text text-transparent">
                  seconds
                </span>
              </h1>
            </m.div>

            <m.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              custom={0.2}
              variants={fadeUp}
              className="max-w-2xl text-lg text-muted-foreground sm:text-xl"
            >
              Assemblr orchestrates your existing stack into intelligent, governed workflows.
              Build real internal tools, dashboards, and systems from natural language.
            </m.div>

            <m.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              custom={0.3}
              variants={fadeUp}
              className="pt-4"
            >
              <EnterSystemButton className="h-12 px-8 text-lg">
                Get Started
              </EnterSystemButton>
            </m.div>

            <div className="absolute top-[60%] left-1/2 -translate-x-1/2 w-[90%] max-w-4xl h-32 bg-gradient-to-t from-blue-500/10 to-transparent blur-3xl opacity-50 pointer-events-none" />
          </section>

          {/* Product Simulation Demo */}
          <ProductSimulation />

          {/* Use Cases Section */}
          <section className="relative mx-auto max-w-7xl px-6 py-20 sm:py-24 border-t border-border/40 bg-gradient-to-b from-background/50 to-background">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(30,41,59,0.2),_transparent_70%)] pointer-events-none opacity-50" />

            <div className="mb-12 flex flex-col items-center text-center space-y-4">
              <m.h2
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-50px" }}
                custom={0}
                variants={fadeUp}
                className="text-3xl font-semibold tracking-tight sm:text-4xl"
              >
                Built for real work
              </m.h2>
              <m.p
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-50px" }}
                custom={0.1}
                variants={fadeUp}
                className="max-w-2xl text-muted-foreground"
              >
                Choose a workflow to start. Assemblr configures the logic, permissions, and UI instantly.
              </m.p>
            </div>

            <m.div
              variants={staggerContainer}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-100px" }}
              className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            >
              {featuredUseCases.map((useCase) => (
                <m.div
                  key={useCase.id}
                  variants={staggerItem}
                  whileHover={{ y: -4, transition: { duration: 0.2 } }}
                >
                  <UseCaseCard
                    id={useCase.id}
                    name={useCase.name}
                    description={useCase.description}
                    integrations={useCase.integrations}
                    prompt={useCase.prompt}
                    category={useCase.category}
                  />
                </m.div>
              ))}
            </m.div>

            <m.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              custom={0.4}
              variants={fadeUp}
              className="mt-12 flex justify-center"
            >
              <Link href="/use-cases">
                <Button variant="outline" className="rounded-full border-border/60 hover:bg-muted/50 px-6 h-10 gap-2 shadow-sm">
                  Explore all use cases
                  <span className="text-muted-foreground">→</span>
                </Button>
              </Link>
            </m.div>
          </section>

          {/* Value Props / Closing CTA */}
          <section className="relative overflow-hidden border-t border-border/40 py-24 sm:py-32">
            <div className="absolute inset-0 bg-muted/5 -z-10" />
            <div className="mx-auto max-w-4xl px-6 text-center">
              <m.div
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-50px" }}
                custom={0}
                variants={fadeUp}
                className="space-y-6"
              >
                <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  This is not just a chat bot. <br className="hidden sm:block" />It is a system.
                </h2>
                <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
                  Assemblr sits on top of your API layer, orchestrating data, identity, and permissions to build governed applications in realtime.
                </p>
                <div className="pt-6 flex justify-center">
                  <EnterSystemButton className="h-12 px-8 text-lg">
                    Get Started
                  </EnterSystemButton>
                </div>
              </m.div>
            </div>
          </section>

          <Footer />
        </main>
      </div>
    </LazyMotion>
  );
}
