import "dotenv/config";
import { bootstrap } from "../src/lib/bootstrap";
import { syncHealthData } from "../src/lib/sync/syncHealthData";

/** Headless sync CLI — same pull the app runs, for scripting/debugging. */
async function main() {
  await bootstrap();
  const result = await syncHealthData({ full: process.argv.includes("--full") });
  console.log(JSON.stringify(result, null, 2));
  const errors = result.types.filter((t) => t.status === "error");
  if (errors.length === result.types.length) {
    console.error("Every data type failed to sync.");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
