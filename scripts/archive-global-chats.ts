/**
 * Archive (or unarchive) every AI conversation that has no task attached
 * — i.e. the user's "global" chats.
 *
 * In the schema (`ai_conversations.archived`):
 *   archived = true   → backed up / hidden from the UI list endpoint
 *   archived = false  → visible on the UI
 *
 * The UI list endpoint (`app/api/ai/conversations/route.ts`) filters with
 * `eq(aiConversations.archived, false)`, so flipping the flag is enough —
 * no rows are deleted.
 *
 * Usage:
 *   # Preview what would change (default; safe):
 *   npm run db:archive-global-chats
 *
 * # Actually archive all global chats:
 *   npm run db:archive-global-chats -- --apply
 *
 * # Restore them (unarchive):
 *   npm run db:archive-global-chats -- --apply --unarchive
 *
 * # Limit to one user (otherwise it touches every row in the table):
 *   npm run db:archive-global-chats -- --apply --user <userId>
 */
import "dotenv/config";
import { config as loadEnv } from "dotenv";
import { and, eq, isNull, sql } from "drizzle-orm";
loadEnv({ path: ".env.local", override: false });

const { db } = await import("../lib/db/client");
const { aiConversations } = await import("../lib/db/schema");

type Args = {
  apply: boolean;
  unarchive: boolean;
  userId?: string;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false, unarchive: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") args.apply = true;
    else if (a === "--unarchive") args.unarchive = true;
    else if (a === "--user") args.userId = argv[++i];
    else if (a === "-h" || a === "--help") {
      console.log(
        "Usage: tsx scripts/archive-global-chats.ts [--apply] [--unarchive] [--user <userId>]",
      );
      process.exit(0);
    } else {
      console.warn(`[archive-global-chats] unknown arg: ${a}`);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const targetArchived = !args.unarchive; // --unarchive flips to false
  const mode = args.apply ? "APPLY" : "DRY-RUN";
  console.log(`[archive-global-chats] mode=${mode}`);
  console.log(`[archive-global-chats] target archived=${targetArchived}`);
  if (args.userId) console.log(`[archive-global-chats] userId=${args.userId}`);

  const conditions = [isNull(aiConversations.taskId)];
  if (args.userId) conditions.push(eq(aiConversations.userId, args.userId));
  const where = and(...conditions);

  // Current state — what we have today.
  const totals = await db
    .select({
      total: sql<number>`count(*)::int`,
      alreadyAtTarget: sql<number>`count(*) filter (where ${aiConversations.archived} = ${targetArchived})::int`,
    })
    .from(aiConversations)
    .where(where);

  const total = totals[0]?.total ?? 0;
  const alreadyAtTarget = totals[0]?.alreadyAtTarget ?? 0;
  const toChange = total - alreadyAtTarget;

  console.log(`[archive-global-chats] global conversations: ${total}`);
  console.log(
    `[archive-global-chats] already archived=${targetArchived}: ${alreadyAtTarget}`,
  );
  console.log(`[archive-global-chats] rows to update: ${toChange}`);

  if (!args.apply) {
    console.log(
      "[archive-global-chats] dry-run only. Re-run with --apply to commit.",
    );
    process.exit(0);
  }

  if (toChange === 0) {
    console.log("[archive-global-chats] nothing to do.");
    process.exit(0);
  }

  await db
    .update(aiConversations)
    .set({ archived: targetArchived, updatedAt: new Date() })
    .where(where);

  console.log(
    `[archive-global-chats] ✓ updated ${toChange} rows`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error("[archive-global-chats] failed:", e);
  process.exit(1);
});