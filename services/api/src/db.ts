import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  BatchWriteCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import type { HouseholdPreferences, Recipe, Week, Rating } from "@cooking/core";

const TABLE_NAME = process.env["TABLE_NAME"] ?? "";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

// ── Preferences ──────────────────────────────────────────────────────────────

export async function getPreferences(): Promise<HouseholdPreferences | null> {
  const result = await ddb.send(
    new GetCommand({ TableName: TABLE_NAME, Key: { PK: "HOUSEHOLD", SK: "PREFS" } })
  );
  if (!result.Item) return null;
  const { PK: _pk, SK: _sk, ...rest } = result.Item as Record<string, unknown>;
  return rest as unknown as HouseholdPreferences;
}

export async function savePreferences(prefs: HouseholdPreferences): Promise<void> {
  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: { PK: "HOUSEHOLD", SK: "PREFS", ...prefs },
    })
  );
}

// ── Current-week pointer ──────────────────────────────────────────────────────

export async function getCurrentWeekStart(): Promise<string | null> {
  const result = await ddb.send(
    new GetCommand({ TableName: TABLE_NAME, Key: { PK: "HOUSEHOLD", SK: "CURRENT_WEEK" } })
  );
  if (!result.Item) return null;
  return (result.Item as Record<string, unknown>)["weekStart"] as string;
}

export async function setCurrentWeekStart(weekStart: string): Promise<void> {
  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: { PK: "HOUSEHOLD", SK: "CURRENT_WEEK", weekStart },
    })
  );
}

// ── Weeks ─────────────────────────────────────────────────────────────────────

export async function getWeek(weekStart: string): Promise<Week | null> {
  const result = await ddb.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `WEEK#${weekStart}`, SK: "META" },
    })
  );
  if (!result.Item) return null;
  const { PK: _pk, SK: _sk, ...rest } = result.Item as Record<string, unknown>;
  return rest as unknown as Week;
}

export async function saveWeek(week: Week): Promise<void> {
  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: { PK: `WEEK#${week.weekStart}`, SK: "META", ...week },
    })
  );
}

// ── Recipes ───────────────────────────────────────────────────────────────────

export async function getRecipe(id: string): Promise<Recipe | null> {
  const result = await ddb.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `RECIPE#${id}`, SK: "META" },
    })
  );
  if (!result.Item) return null;
  const { PK: _pk, SK: _sk, ...rest } = result.Item as Record<string, unknown>;
  return rest as unknown as Recipe;
}

export async function saveRecipes(recipes: Recipe[]): Promise<void> {
  for (const batch of chunks(recipes, 25)) {
    await ddb.send(
      new BatchWriteCommand({
        RequestItems: {
          [TABLE_NAME]: batch.map((r) => ({
            PutRequest: { Item: { PK: `RECIPE#${r.id}`, SK: "META", ...r } },
          })),
        },
      })
    );
  }
}

export async function getCandidateRecipes(ids: string[]): Promise<Recipe[]> {
  const results = await Promise.all(ids.map((id) => getRecipe(id)));
  return results.filter((r): r is Recipe => r !== null);
}

/** Returns all AI-generated recipes created within the last `weekCount` weeks. */
export async function getRecentRecipes(weekCount = 4): Promise<Recipe[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - weekCount * 7);

  const result = await ddb.send(
    new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: "#SK = :sk AND #aiGenerated = :yes",
      ExpressionAttributeNames: { "#SK": "SK", "#aiGenerated": "aiGenerated" },
      ExpressionAttributeValues: { ":sk": "META", ":yes": true },
    })
  );

  return ((result.Items ?? []) as Record<string, unknown>[])
    .map(({ PK: _pk, SK: _sk, ...rest }) => rest as unknown as Recipe)
    .filter((r) => r.aiGenerated && new Date(r.createdAt) >= cutoff);
}

/** Returns recipes that have at least one rating at or above minStars. */
export async function getHighlyRatedRecipeIds(minStars = 4): Promise<string[]> {
  const result = await ddb.send(
    new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: "begins_with(#SK, :ratingPrefix) AND #stars >= :min",
      ExpressionAttributeNames: { "#SK": "SK", "#stars": "stars" },
      ExpressionAttributeValues: { ":ratingPrefix": "RATING#", ":min": minStars },
    })
  );
  return [
    ...new Set(
      ((result.Items ?? []) as Record<string, unknown>[]).map(
        (item) => ((item["PK"] as string) ?? "").replace("RECIPE#", "")
      )
    ),
  ];
}

export async function getAllWeeks(): Promise<Week[]> {
  const result = await ddb.send(
    new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: "begins_with(PK, :prefix) AND SK = :sk",
      ExpressionAttributeValues: { ":prefix": "WEEK#", ":sk": "META" },
    })
  );
  const weeks = ((result.Items ?? []) as Record<string, unknown>[]).map(
    ({ PK: _pk, SK: _sk, ...rest }) => rest as unknown as Week
  );
  return weeks.sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

// ── Ratings ───────────────────────────────────────────────────────────────────

export async function saveRating(rating: Rating): Promise<void> {
  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `RECIPE#${rating.recipeId}`,
        SK: `RATING#${rating.weekId}`,
        ...rating,
      },
    })
  );
}

export async function getAllRatings(): Promise<Rating[]> {
  const result = await ddb.send(
    new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: "begins_with(#SK, :prefix)",
      ExpressionAttributeNames: { "#SK": "SK" },
      ExpressionAttributeValues: { ":prefix": "RATING#" },
    })
  );
  return ((result.Items ?? []) as Record<string, unknown>[]).map(
    ({ PK: _pk, SK: _sk, ...rest }) => rest as unknown as Rating
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function chunks<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
  return result;
}
