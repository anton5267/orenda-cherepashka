import { hashSync } from "bcryptjs";
import process from "node:process";

const password = process.argv.slice(2).join(" ").trim();

if (!password) {
  console.error("Usage: npm run admin:hash -- <password>");
  process.exit(1);
}

console.log(hashSync(password, 10));
