import type { Handler } from "aws-lambda";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { buildShoppingList, DEFAULT_PREFERENCES } from "@cooking/core";
import * as db from "./db.js";

const ses = new SESClient({});
const APP_URL = "https://cooking.caseyhunter.net";
const FROM_EMAIL = process.env["FROM_EMAIL"] ?? "noreply@caseyhunter.net";

/**
 * EventBridge-triggered Lambda that sends reminder and shopping-list emails.
 * Schedule: Thu (pick), Fri + Sat (nudge), Sat + Sun (shopping list if selections exist).
 */
export const handler: Handler = async (_event) => {
  const prefs = await db.getPreferences();
  const email = prefs?.notificationEmail ?? DEFAULT_PREFERENCES.notificationEmail;
  if (!email) {
    console.warn("No notification email configured — skipping");
    return;
  }

  const weekStart = await db.getCurrentWeekStart();
  const week = weekStart ? await db.getWeek(weekStart) : null;
  if (!week || !weekStart) {
    console.warn("No current week — skipping reminder");
    return;
  }

  const dayOfWeek = new Date().getDay(); // 0=Sun … 6=Sat
  const resolvedPrefs = prefs ?? DEFAULT_PREFERENCES;

  // Send pick/nudge reminder if week not yet finalized
  if (week.status === "pending" || week.status === "selecting") {
    const subject = pickSubject(dayOfWeek, week.status);
    const html = pickBody(weekStart, week.status);
    await sendEmail(email, subject, html);
    console.log(JSON.stringify({ action: "reminder", to: email, weekStart, day: dayOfWeek }));
  }

  // Send shopping list on Sat or Sun once selections are in
  if ((dayOfWeek === 6 || dayOfWeek === 0) && week.selections.length > 0) {
    const recipes = (
      await Promise.all(week.selections.map((s) => db.getRecipe(s.recipeId)))
    ).filter((r): r is NonNullable<typeof r> => r !== null);

    const list = buildShoppingList(weekStart, recipes, resolvedPrefs.peopleCount);
    const rows = list.items
      .map((i) => `<li>${i.name} — ${i.totalQuantity} ${i.unit} <em>(${i.category})</em></li>`)
      .join("\n");
    const html = `<h2>Grocery list — week of ${weekStart}</h2><ul>\n${rows}\n</ul>`;

    await sendEmail(email, `Your grocery list for the week of ${weekStart}`, html);
    console.log(JSON.stringify({ action: "shopping_list", to: email, weekStart }));
  }
};

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  await ses.send(
    new SendEmailCommand({
      Source: FROM_EMAIL,
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: { Data: subject },
        Body: { Html: { Data: html } },
      },
    })
  );
}

function pickSubject(day: number, status: string): string {
  if (day === 4) return "Your meals for next week are ready to pick!";
  if (status === "selecting") return "Reminder: finalize your meals for next week";
  return "Don't forget to pick your meals for next week";
}

function pickBody(weekStart: string, status: string): string {
  if (status === "pending") {
    return `<p>Your weekly menu is being generated.</p><p><a href="${APP_URL}">Open the app</a> to pick your meals for the week of ${weekStart}.</p>`;
  }
  return `<p>You haven't finalized your meals for the week of ${weekStart} yet.</p><p><a href="${APP_URL}">Pick your meals now →</a></p>`;
}
