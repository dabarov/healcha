import "dotenv/config";
import { bootstrap } from "../src/lib/bootstrap";
import { askHealthQuestion } from "../src/lib/ai/textToSql";

/** Test the text-to-SQL pipeline from the terminal: npm run ask -- "question" */
async function main() {
  await bootstrap();
  const question = process.argv.slice(2).join(" ").trim();
  if (!question) {
    console.log('Usage: npm run ask -- "how has my sleep been this week?"');
    process.exit(1);
  }
  const { answer, sql, rowCount } = await askHealthQuestion(question);
  if (sql) console.log(`SQL (${rowCount} rows):\n${sql}\n`);
  console.log(answer);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
