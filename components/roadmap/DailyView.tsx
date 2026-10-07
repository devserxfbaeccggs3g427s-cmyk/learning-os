import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import type { StudyBlockType } from "@/config/domain";
import { listScheduledBlocks } from "@/lib/db/queries/tasks";
import { groupDailyRoadmap } from "@/lib/roadmap/daily";
import { BlockDetailDialog } from "./BlockDetailDialog";
import { BlockTypeFilter } from "./BlockTypeFilter";

export async function DailyView({
  userId,
  from,
  to,
  types,
}: {
  userId: string;
  from: string;
  to: string;
  types: StudyBlockType[];
}) {
  const days = groupDailyRoadmap(await listScheduledBlocks({ userId, from, to }), types);

  return (
    <section className="space-y-4" aria-label="Roadmap theo ngày">
      <BlockTypeFilter selected={types} />
      <p className="text-sm text-muted-foreground">
        {from} – {to} ·{" "}
        {types.length === 0
          ? "Chưa chọn loại block nào."
          : `Chỉ hiện block ${types.join(", ")} có liên kết task.`}
      </p>
      {types.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Chưa chọn loại block nào. Chọn ít nhất một loại để xem.
          </CardContent>
        </Card>
      ) : days.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Không có task với block thuộc loại đã chọn trong khoảng ngày này.
          </CardContent>
        </Card>
      ) : (
        days.map((day) => (
          <section key={day.date} aria-labelledby={`day-${day.date}`} className="space-y-3">
            <h2 id={`day-${day.date}`} className="text-lg font-semibold">
              <time dateTime={day.date}>
                {new Intl.DateTimeFormat("vi-VN", { weekday: "long", day: "numeric", month: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${day.date}T00:00:00Z`))}
              </time>
            </h2>
            {day.tasks.map((task) => (
              <Card key={task.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    <Link href={`/tasks/${task.id}`} className="hover:underline">
                      {task.code && <span className="mr-2 font-mono text-xs text-muted-foreground">{task.code}</span>}
                      {task.title}
                    </Link>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="divide-y divide-border">
                    {task.blocks.map((block) => (
                      <li key={block.id}>
                        <BlockDetailDialog userId={userId} block={block} />
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </section>
        ))
      )}
    </section>
  );
}
