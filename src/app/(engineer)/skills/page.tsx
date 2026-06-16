import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { questSkills, quests, skills } from "@/db/schema";
import { requireUser } from "@/lib/guards";
import { getSkillTree } from "@/lib/domain";
import { PageHeader } from "@/components/ui";
import Link from "next/link";

type Node = Awaited<ReturnType<typeof getSkillTree>>["nodes"][number];

/** 前提チェーンの深さを計算してレイヤー（列）に割り当てる */
function computeLayers(nodes: Node[]): Node[][] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const depthCache = new Map<number, number>();

  function depth(id: number, seen = new Set<number>()): number {
    if (depthCache.has(id)) return depthCache.get(id)!;
    if (seen.has(id)) return 0;
    seen.add(id);
    const n = byId.get(id);
    if (!n || n.prerequisiteIds.length === 0) {
      depthCache.set(id, 0);
      return 0;
    }
    const d = 1 + Math.max(...n.prerequisiteIds.map((p) => depth(p, seen)));
    depthCache.set(id, d);
    return d;
  }

  const layers: Node[][] = [];
  for (const n of nodes) {
    const d = depth(n.id);
    (layers[d] ??= []).push(n);
  }
  return layers.filter(Boolean);
}

function nodeStyle(n: Node): string {
  if (n.acquired) return "border-zen-accent bg-zen-accentSoft text-zen-accent";
  if (n.unlockable) return "border-zen-gold bg-zen-gold/10 text-zen-gold";
  return "border-zen-line bg-white text-zen-sub";
}

export default async function SkillTreePage() {
  const user = await requireUser();
  const { nodes } = await getSkillTree(user.id);
  const layers = computeLayers(nodes);
  const byId = new Map(nodes.map((n) => [n.id, n]));

  // 各スキルを習得できるクエスト（公開のみ）
  const qsRows = await db
    .select({
      skillId: questSkills.skillId,
      questId: quests.id,
      title: quests.title,
      published: quests.isPublished,
    })
    .from(questSkills)
    .innerJoin(quests, eq(questSkills.questId, quests.id));
  const questBySkill = new Map<number, { id: number; title: string }>();
  for (const r of qsRows) {
    if (r.published && !questBySkill.has(r.skillId)) {
      questBySkill.set(r.skillId, { id: r.questId, title: r.title });
    }
  }

  const acquiredCount = nodes.filter((n) => n.acquired).length;

  return (
    <div>
      <PageHeader
        title="スキルツリー"
        subtitle={`習得 ${acquiredCount} / ${nodes.length} スキル`}
      />

      {/* 凡例 */}
      <div className="mb-5 flex flex-wrap gap-3 text-xs text-zen-sub">
        <Legend className="border-zen-accent bg-zen-accentSoft" label="習得済み" />
        <Legend className="border-zen-gold bg-zen-gold/10" label="次に開放可能" />
        <Legend className="border-zen-line bg-white" label="未開放" />
      </div>

      {/* レイヤー（左→右に前提が解決されていく） */}
      <div className="space-y-4 overflow-x-auto">
        {layers.map((layer, i) => (
          <div key={i}>
            <p className="mb-2 text-[11px] font-medium text-zen-sub">
              レイヤー {i + 1}
            </p>
            <div className="flex flex-wrap gap-3">
              {layer.map((n) => {
                const quest = !n.acquired ? questBySkill.get(n.id) : undefined;
                const prereqNames = n.prerequisiteIds
                  .map((p) => byId.get(p)?.name)
                  .filter(Boolean);
                return (
                  <div
                    key={n.id}
                    className={`w-52 rounded-2xl border p-3 ${nodeStyle(n)}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] opacity-70">
                        {n.category}
                      </span>
                      {n.acquired && <span className="text-xs">✓</span>}
                    </div>
                    <p className="mt-1 font-medium text-zen-ink">{n.name}</p>
                    {prereqNames.length > 0 && (
                      <p className="mt-1 text-[10px] text-zen-sub">
                        前提: {prereqNames.join(" / ")}
                      </p>
                    )}
                    {n.unlockable && quest && (
                      <Link
                        href={`/quests/${quest.id}`}
                        className="mt-2 block truncate rounded-lg bg-white/70 px-2 py-1 text-[11px] text-zen-accent hover:bg-white"
                      >
                        → {quest.title}
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-3 w-3 rounded border ${className}`} />
      {label}
    </span>
  );
}
