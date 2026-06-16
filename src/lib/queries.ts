import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { teams, userSkills, users } from "@/db/schema";

/** 個人ランキング（累積ポイント降順） */
export async function getUserRanking() {
  const db = getDb();
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      totalPoints: users.totalPoints,
      estimatedRate: users.currentEstimatedRate,
      teamName: teams.name,
    })
    .from(users)
    .leftJoin(teams, eq(users.teamId, teams.id))
    .where(eq(users.role, "engineer"))
    .orderBy(desc(users.totalPoints), users.id);

  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

/** あるユーザーの個人順位（1始まり）。エンジニアのみ対象。 */
export async function getUserRank(userId: number): Promise<number | null> {
  const ranking = await getUserRanking();
  const idx = ranking.findIndex((r) => r.id === userId);
  return idx === -1 ? null : idx + 1;
}

/** チームランキング（チーム所属エンジニアの合計ポイント降順） */
export async function getTeamRanking() {
  const db = getDb();
  const rows = await db
    .select({
      teamId: teams.id,
      teamName: teams.name,
      totalPoints: sql<number>`COALESCE(SUM(${users.totalPoints}), 0)`,
      memberCount: sql<number>`COUNT(${users.id})`,
    })
    .from(teams)
    .leftJoin(
      users,
      sql`${users.teamId} = ${teams.id} AND ${users.role} = 'engineer'`,
    )
    .groupBy(teams.id)
    .orderBy(desc(sql`COALESCE(SUM(${users.totalPoints}), 0)`), teams.id);

  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

/** ユーザーの習得スキル数 */
export async function getAcquiredSkillCount(userId: number): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ c: sql<number>`COUNT(*)` })
    .from(userSkills)
    .where(eq(userSkills.userId, userId));
  return rows[0]?.c ?? 0;
}
