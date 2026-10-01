/**
 * Backup export — returns a JSON snapshot of the user-facing tables.
 *
 * Format:
 *   {
 *     schemaVersion: 1,
 *     exportedAt: ISO,
 *     data: { roadmaps, tracks, modules, tasks, ..., study_sessions, ai_conversations, ... }
 *   }
 *
 * `schemaVersion` lets future versions run migrations on restore.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import {
  roadmaps, tracks, modules as moduleTable, tasks, taskDependencies, tags, taskTags,
  schedules, studyBlocks, taskNotes, noteRevisions,
  studySessions, taskProgress,
  aiConfigurations, aiConversations, aiMessages, aiArtifactRecords, promptTemplates,
  flashcardDecks, flashcards, reviewHistory, reviewSessions,
  quizzes, quizQuestions, quizAttempts, quizAnswers,
  masteryRecords, applicationSettings,
} from "@/lib/db/schema";
import { getDefaultUser } from "@/lib/ai/service";

const BACKUP_SCHEMA_VERSION = 1;

export async function GET() {
  const user = await getDefaultUser();
  const userId = user.id;

  const [
    rms, trs, mds, tks, deps, tgs, ttgs,
    schs, sbs, tns, nrev,
    sss, tps,
    aic, aicnv, aenac, aar, pt,
    fd, fc, rh, rs,
    qz, qq, qa, atb,
    mr, aps,
  ] = await Promise.all([
    db.select().from(roadmaps).where(eqUser(roadmaps.userId, userId)),
    db.select().from(tracks),
    db.select().from(moduleTable),
    db.select().from(tasks),
    db.select().from(taskDependencies),
    db.select().from(tags),
    db.select().from(taskTags),
    db.select().from(schedules).where(eqUser(schedules.userId, userId)),
    db.select().from(studyBlocks),
    db.select().from(taskNotes).where(eqUser(taskNotes.userId, userId)),
    db.select().from(noteRevisions),
    db.select().from(studySessions).where(eqUser(studySessions.userId, userId)),
    db.select().from(taskProgress),
    db.select().from(aiConfigurations).where(eqUser(aiConfigurations.userId, userId)),
    db.select().from(aiConversations).where(eqUser(aiConversations.userId, userId)),
    db.select().from(aiMessages),
    db.select().from(aiArtifactRecords).where(eqUser(aiArtifactRecords.userId, userId)),
    db.select().from(promptTemplates),
    db.select().from(flashcardDecks).where(eqUser(flashcardDecks.userId, userId)),
    db.select().from(flashcards),
    db.select().from(reviewHistory).where(eqUser(reviewHistory.userId, userId)),
    db.select().from(reviewSessions).where(eqUser(reviewSessions.userId, userId)),
    db.select().from(quizzes).where(eqUser(quizzes.userId, userId)),
    db.select().from(quizQuestions),
    db.select().from(quizAttempts).where(eqUser(quizAttempts.userId, userId)),
    db.select().from(quizAnswers),
    db.select().from(masteryRecords).where(eqUser(masteryRecords.userId, userId)),
    db.select().from(applicationSettings).where(eqUser(applicationSettings.userId, userId)),
  ]);

  // Filter children of selected entities
  const roadmapIds = new Set(rms.map((r) => r.id));
  const trackIds = new Set(trs.filter((t) => roadmapIds.has(t.roadmapId)).map((t) => t.id));
  const moduleIds = new Set(mds.filter((m) => trackIds.has(m.trackId)).map((m) => m.id));
  const taskIds = new Set(tks.filter((t) => moduleIds.has(t.moduleId)).map((t) => t.id));

  const filteredData = {
    roadmaps: rms,
    tracks: trs.filter((t) => roadmapIds.has(t.roadmapId)),
    modules: mds.filter((m) => trackIds.has(m.trackId)),
    tasks: tks.filter((t) => moduleIds.has(t.moduleId)),
    taskDependencies: deps.filter((d) => taskIds.has(d.taskId) && taskIds.has(d.dependsOnTaskId)),
    tags: tgs,
    taskTags: ttgs.filter((tt) => taskIds.has(tt.taskId)),
    schedules: schs,
    studyBlocks: sbs.filter((b) => schs.some((s) => s.id === b.scheduleId)),
    taskNotes: tns.filter((n) => taskIds.has(n.taskId)),
    noteRevisions: nrev.filter((x) => tns.some((n) => n.id === x.noteId)),
    studySessions: sss.filter((s) => taskIds.has(s.taskId)),
    taskProgress: tps.filter((p) => taskIds.has(p.taskId)),
    aiConfigurations: aic,
    aiConversations: aicnv,
    aiMessages: aenac.filter((m) => aicnv.some((c) => c.id === m.conversationId)),
    aiArtifactRecords: aar,
    promptTemplates: pt,
    flashcardDecks: fd.filter((d) => taskIds.has(d.taskId)),
    flashcards: fc.filter((c) => fd.some((x) => x.id === c.deckId)),
    reviewHistory: rh,
    reviewSessions: rs,
    quizzes: qz.filter((q) => taskIds.has(q.taskId)),
    quizQuestions: qq.filter((q) => qz.some((x) => x.id === q.quizId)),
    quizAttempts: qa.filter((a) => qz.some((x) => x.id === a.quizId)),
    quizAnswers: atb.filter((a) => qa.some((x) => x.id === a.attemptId)),
    masteryRecords: mr.filter((m) => taskIds.has(m.taskId)),
    applicationSettings: aps,
  };

  const payload = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data: filteredData,
  };

  const filename = `learning-os-backup-${new Date().toISOString().slice(0, 10)}.json`;
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}

import { eq } from "drizzle-orm";
function eqUser<T extends { userId: any }>(col: T["userId"], userId: string) {
  return eq(col, userId);
}