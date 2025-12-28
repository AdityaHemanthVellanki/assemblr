import { prisma } from "../lib/db/prisma";

async function main() {
  const existing = await prisma.organization.findFirst();
  if (existing) return;

  await prisma.organization.create({
    data: { name: "Default" },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
