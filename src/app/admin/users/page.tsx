import { db } from "@/db";
import { teams, users } from "@/db/schema";
import { requireAdmin } from "@/lib/guards";
import {
  createTeamAction,
  createUserAction,
  deleteTeamAction,
  deleteUserAction,
  updateUserAction,
} from "@/app/actions/admin";
import { PageHeader } from "@/components/ui";

export default async function AdminUsersPage() {
  const admin = await requireAdmin();

  const allTeams = await db.select().from(teams).orderBy(teams.id);
  const allUsers = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      teamId: users.teamId,
      totalPoints: users.totalPoints,
      rate: users.currentEstimatedRate,
    })
    .from(users)
    .orderBy(users.id);

  const teamName = new Map(allTeams.map((t) => [t.id, t.name]));

  return (
    <div className="space-y-8">
      <PageHeader
        title="ユーザー・チーム管理"
        subtitle="ユーザー登録・ロール設定・チーム編成"
      />

      {/* チーム */}
      <section>
        <h2 className="mb-3 text-base font-semibold">チーム</h2>
        <div className="card mb-3">
          <form
            action={createTeamAction}
            className="flex flex-wrap items-end gap-3"
          >
            <div className="flex-1">
              <label className="label" htmlFor="team-name">チーム名</label>
              <input id="team-name" name="name" className="input" placeholder="例: Gamma チーム" required />
            </div>
            <button className="btn-primary">追加</button>
          </form>
        </div>
        <div className="flex flex-wrap gap-2">
          {allTeams.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-2 rounded-xl border border-zen-line bg-white px-3 py-1.5 text-sm"
            >
              {t.name}
              <form action={deleteTeamAction}>
                <input type="hidden" name="id" value={t.id} />
                <button className="text-xs text-red-500 hover:underline">
                  ×
                </button>
              </form>
            </div>
          ))}
        </div>
      </section>

      {/* ユーザー作成 */}
      <section>
        <details className="card">
          <summary className="cursor-pointer text-sm font-medium text-zen-accent">
            ＋ 新しいユーザーを登録
          </summary>
          <form action={createUserAction} className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="user-name">氏名</label>
                <input id="user-name" name="name" className="input" required />
              </div>
              <div>
                <label className="label" htmlFor="user-email">メールアドレス</label>
                <input id="user-email" name="email" type="email" className="input" required />
              </div>
              <div>
                <label className="label" htmlFor="user-password">初期パスワード</label>
                <input id="user-password" name="password" type="text" className="input" required />
              </div>
              <div>
                <label className="label" htmlFor="user-role">ロール</label>
                <select id="user-role" name="role" className="input" defaultValue="engineer">
                  <option value="engineer">エンジニア</option>
                  <option value="admin">管理者</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor="user-team">チーム</label>
                <select id="user-team" name="teamId" className="input" defaultValue="">
                  <option value="">未所属</option>
                  {allTeams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button className="btn-primary">登録する</button>
          </form>
        </details>
      </section>

      {/* ユーザー一覧 */}
      <section>
        <h2 className="mb-3 text-base font-semibold">ユーザー一覧</h2>
        <div className="space-y-2">
          {allUsers.map((u) => (
            <div key={u.id} className="card">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    {u.name}
                    {u.role === "admin" && (
                      <span className="ml-2 badge bg-zen-gold/15 text-zen-gold">
                        管理者
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-zen-sub">
                    {u.email} ・ {teamName.get(u.teamId ?? -1) ?? "未所属"} ・{" "}
                    {u.totalPoints.toLocaleString()}pt ・ {u.rate}万円
                  </p>
                </div>
                <form
                  action={updateUserAction}
                  className="flex flex-wrap items-center gap-2"
                >
                  <input type="hidden" name="id" value={u.id} />
                  <select
                    name="role"
                    className="input w-auto py-1.5 text-xs"
                    defaultValue={u.role}
                  >
                    <option value="engineer">エンジニア</option>
                    <option value="admin">管理者</option>
                  </select>
                  <select
                    name="teamId"
                    className="input w-auto py-1.5 text-xs"
                    defaultValue={u.teamId ?? ""}
                  >
                    <option value="">未所属</option>
                    {allTeams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <button className="btn-ghost text-xs">保存</button>
                </form>
              </div>
              {u.id !== admin.id && (
                <form action={deleteUserAction} className="mt-2">
                  <input type="hidden" name="id" value={u.id} />
                  <button className="text-xs text-red-500 hover:underline">
                    このユーザーを削除
                  </button>
                </form>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
