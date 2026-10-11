import { migrate } from "drizzle-orm/postgres-js/migrator";
import { closeDb, getDb } from "./client";

await migrate(getDb(), { migrationsFolder: "db/migrations" });
await closeDb();
console.log("Migrations applied.");
