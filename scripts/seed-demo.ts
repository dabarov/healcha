import "dotenv/config";
import { bootstrap } from "../src/lib/bootstrap";
import { seedDemoData } from "../src/lib/demo";

async function main() {
  await bootstrap();
  await seedDemoData({ force: process.argv.includes("--force"), log: console.log });
  console.log("Done. Run `npm run dev` and open http://localhost:3000");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
