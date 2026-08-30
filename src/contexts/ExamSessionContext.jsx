import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getExam, createSession, saveAnswer, submitExam } from "../services/examService.js";
import { cacheExam, getCachedExam, saveAnswerToDb, getUnsyncedAnswers, markAnswerSynced, setSubmitPending } from "../db/idb.js";
import { STATUS_IDLE, STATUS_FINALIZING, STATUS_DONE } from "./examSessionStatus.js";

const ExamSessionContext = createContext(null);

const FALLBACK_EXAM_CODE = "MTK-101";
const DEV_STUDENT_ID = 1;

const makeAnswersKey  = (code) => `eduos.cbt.exam.${code}.answers`;
const makeSessionKey = (code) => `eduos.cbt.exam.${code}.session`;
const makePendingKey = (code) => `eduos.cbt.exam.${code}.pending`;

function loadPersistedAnswers(code) {
  try {
    const raw = localStorage.getItem(makeAnswersKey(code));
    if (raw === null) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

function persistAnswers(code, answers) {
  try {
    localStorage.setItem(makeAnswersKey(code), JSON.stringify(answers));
  } catch {}
}

function loadPersistedSession(code) {
  try {
    const raw = localStorage.getItem(makeSessionKey(code));
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed) ||
      typeof parsed.sessionId !== "string" ||
      parsed.sessionId === "" ||
      typeof parsed.startedAt !== "string" ||
      typeof parsed.status !== "string"
    ) {
      return null;
    }

    return {
      sessionId: parsed.sessionId,
      startedAt: parsed.startedAt,
      status: parsed.status,
      submitPending: parsed.submitPending === true,
    };
  } catch {
    return null;
  }
}

function persistSession(code, session) {
  try {
    localStorage.setItem(makeSessionKey(code), JSON.stringify(session));
  } catch {}
}

function loadPending(code) {
  try {
    const raw = localStorage.getItem(makePendingKey(code));
    if (raw === null) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) =>
        item &&
        typeof item.questionId === "number" &&
        item.questionId > 0 &&
        typeof item.selectedOption === "string" &&
        item.selectedOption.length > 0
    );
  } catch {
    return [];
  }
}

function persistPending(code, pending) {
  try {
    localStorage.setItem(makePendingKey(code), JSON.stringify(pending));
  } catch {}
}

function ExamSessionProvider({ children }) {
  const [exam, setExam] = useState(null);
  const [questionsList, setQuestions] = useState(null);
  const [loadedExamCode, setLoadedExamCode] = useState(FALLBACK_EXAM_CODE);
  const [answers, setAnswers] = useState(() => loadPersistedAnswers(loadedExamCode));
  const [sessionMeta, setSessionMeta] = useState(() => loadPersistedSession(loadedExamCode));
  const [pending, setPending] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [examLoadError, setExamLoadError] = useState(false);
  const sessionIdRef = useRef(null);
  const statusRef = useRef(STATUS_IDLE);
  const isSyncingRef = useRef(false);
  const loadedExamCodeRef = useRef(FALLBACK_EXAM_CODE);
  const sessionMetaRef = useRef(null);

  useEffect(() => {
    sessionIdRef.current = sessionMeta ? sessionMeta.sessionId : null;
  }, [sessionMeta]);

  useEffect(() => {
    statusRef.current = sessionMeta ? sessionMeta.status : STATUS_IDLE;
  }, [sessionMeta]);

  useEffect(() => {
    sessionMetaRef.current = sessionMeta;
  }, [sessionMeta]);

  useEffect(() => {
    let cancelled = false;

    getExam(FALLBACK_EXAM_CODE)
      .then(({ exam: loadedExam, questions: loadedQuestions }) => {
        if (cancelled) return;
        setExam(loadedExam);
        setQuestions(loadedQuestions);
        setLoadedExamCode(loadedExam.code);
        setExamLoadError(false);
        cacheExam({ exam: loadedExam, questions: loadedQuestions }).catch(() => {});
      })
      .catch(async () => {
        if (cancelled) return;
        try {
          const cached = await getCachedExam(FALLBACK_EXAM_CODE);
          if (!cancelled) {
            if (cached && cached.exam && Array.isArray(cached.questions)) {
              setExam(cached.exam);
              setQuestions(cached.questions);
              setLoadedExamCode(cached.exam.code);
              setExamLoadError(false);
            } else {
              setExamLoadError(true);
            }
          }
        } catch {
          if (!cancelled) setExamLoadError(true);
        }
      });

    return () => { cancelled = true; };
  }, []);

  const status = sessionMeta ? sessionMeta.status : STATUS_IDLE;

  useEffect(() => {
    if (!loadedExamCode) return;
    const hydrated = loadPending(loadedExamCode);
    setPending(hydrated);
  }, [loadedExamCode]);

  useEffect(() => {
    loadedExamCodeRef.current = loadedExamCode;
  }, [loadedExamCode]);

  const syncPendingAnswers = useCallback(async () => {
    if (isSyncingRef.current) return;
    if (statusRef.current !== "answering") return;
    const code = loadedExamCodeRef.current;
    const sessionUuid = sessionIdRef.current;
    if (!code || !sessionUuid) return;

    isSyncingRef.current = true;
    try {
      let toSync;
      try {
        const unsynced = await getUnsyncedAnswers(code);
        toSync = unsynced;
      } catch {
        const fallback = loadPending(code);
        toSync = fallback.map((p) => ({
          sessionCode: code,
          questionId: p.questionId,
          selectedOption: p.selectedOption,
        }));
      }

      if (toSync.length === 0) return;

      for (const item of toSync) {
        try {
          await saveAnswer(sessionUuid, item.questionId, item.selectedOption);
          try {
            await markAnswerSynced(code, item.questionId);
          } catch {

          }
        } catch {

        }
      }
    } finally {
      isSyncingRef.current = false;
    }
  }, []);

  const doSyncRef = useRef(null);
  useEffect(() => {
    doSyncRef.current = syncPendingAnswers;
  }, [syncPendingAnswers]);

  useEffect(() => {
    if (status === "answering") {
      doSyncRef.current?.();
    }
  }, [status]);

  useEffect(() => {
    const handleOnline = () => {
      if (statusRef.current === "answering") {
        doSyncRef.current?.();
      }
      if (sessionMetaRef.current?.submitPending) {
        submitPendingSyncRef_external.current?.();
      }
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, []);

  const submitPendingSyncRef = useRef(false);
  const beginSubmitPendingSync = useCallback(() => {
    if (submitPendingSyncRef.current) return;
    if (statusRef.current !== "answering") return;
    if (!sessionMetaRef.current?.submitPending) return;

    const code = loadedExamCodeRef.current;
    const sessionUuid = sessionIdRef.current;
    if (!code || !sessionUuid) return;

    submitPendingSyncRef.current = true;
    (async () => {
      try {
        await syncPendingAnswers();
        const unsynced = await getUnsyncedAnswers(code);
        if (unsynced.length > 0) {
          submitPendingSyncRef.current = false;
          return;
        }

        await submitExam(sessionUuid);
        setSubmitPending(code, false);
        setSessionMeta((prev) => {
          if (!prev) return prev;
          const safePrev = prev.sessionId != null ? prev : { ...prev };
          const next = { ...safePrev, submitPending: false, status: STATUS_FINALIZING };
          persistSession(code, next);
          return next;
        });
      } catch {

      } finally {
        submitPendingSyncRef.current = false;
      }
    })();
  }, []);

  const submitPendingSyncRef_external = useRef(beginSubmitPendingSync);
  useEffect(() => {
    submitPendingSyncRef_external.current = beginSubmitPendingSync;
  }, [beginSubmitPendingSync]);

  const submitAnswer = useCallback(
    (questionId, optionKey) => {
      const code = loadedExamCodeRef.current;
      if (!code) return;

      setAnswers((prev) => {
        const next = { ...prev, [questionId]: optionKey };
        persistAnswers(code, next);
        return next;
      });

      saveAnswerToDb(code, questionId, optionKey, false).catch(() => {});

      const item = { questionId, selectedOption: optionKey, timestamp: Date.now() };
      const currentQueue = loadPending(code);
      const withoutCurrent = currentQueue.filter((p) => p.questionId !== questionId);
      const nextPending = [...withoutCurrent, item];
      persistPending(code, nextPending);
      setPending(nextPending);

      if (statusRef.current === "answering") {
        syncPendingAnswers();
      }
    },
    [syncPendingAnswers]
  );

  const applySession = useCallback((backendSession) => {
    const next = {
      sessionId:
        typeof backendSession.sessionUuid === "string" && backendSession.sessionUuid
          ? backendSession.sessionUuid
          : null,
      startedAt:
        typeof backendSession.startedAt === "string" && backendSession.startedAt
          ? backendSession.startedAt
          : new Date().toISOString(),
      status:
        typeof backendSession.status === "string" && backendSession.status
          ? backendSession.status
          : STATUS_IDLE,
      submitPending: false,
    };
    setSessionMeta(next);
    persistSession(loadedExamCode, next);
  }, [loadedExamCode]);

  const startSession = useCallback(async (sessionUuid) => {
    const backendSession = await createSession({
      studentId: DEV_STUDENT_ID,
      examCode: FALLBACK_EXAM_CODE,
      sessionUuid,
    });
    applySession(backendSession);
    return backendSession;
  }, [applySession]);

  const beginFinalizing = useCallback(() => {
    setSessionMeta((prev) => {
      if (!prev) return prev;
      const safePrev = prev.sessionId != null ? prev : { ...prev };
      const next = { ...safePrev, status: STATUS_FINALIZING };
      persistSession(loadedExamCode, next);
      return next;
    });
  }, [loadedExamCode]);

  const markDone = useCallback(() => {
    setSessionMeta((prev) => {
      if (!prev) return prev;
      const safePrev = prev.sessionId != null ? prev : { ...prev };
      const next = { ...safePrev, status: STATUS_DONE };
      persistSession(loadedExamCode, next);
      return next;
    });
  }, [loadedExamCode]);

  /**
   * Orchestrates the full final submission flow:
   *
   * Online path:
   *   1. Flush any remaining pending answers to the backend.
   *   2. Call POST /api/exam-sessions/:sessionUuid/submit.
   *   3. On success: transition to finalizing state (countdown → done).
   *   4. On HTTP 409 (already submitted): re-throw so callers can show the conflict.
   *
   * Offline path:
   *   1. Flush any remaining pending answers.
   *   2. Attempt submitExam — fails because offline.
   *   3. Persist submitPending: true in localStorage.
   *   4. Do NOT call beginFinalizing() — server has not confirmed.
   *   5. On reconnect, the online event handler picks up submitPending and retries.
   *
   * Must NOT be called while isSubmitting is true (concurrent guard).
   */
  const finaliseExam = useCallback(async () => {
    if (isSubmitting) return;
    if (statusRef.current !== "answering") return;

    const code = loadedExamCodeRef.current;
    const sessionUuid = sessionIdRef.current;
    if (!code || !sessionUuid) return;

    setIsSubmitting(true);
    try {
      await syncPendingAnswers();
      try {
        await submitExam(sessionUuid);
        beginFinalizing();
      } catch (submitErr) {
        setSubmitPending(code, true);
        setSessionMeta((prev) => {
          if (!prev) return prev;
          const safePrev = prev.sessionId != null ? prev : { ...prev };
          const next = { ...safePrev, submitPending: true };
          persistSession(code, next);
          return next;
        });
        if (submitErr.status === 409) throw submitErr;
      }
    } finally {
      setIsSubmitting(false);
    }
  }, []);
  const value = useMemo(
    () => ({
      exam,
      questions: questionsList,
      answers,
      sessionId: sessionMeta ? sessionMeta.sessionId : null,
      startedAt: sessionMeta ? sessionMeta.startedAt : null,
      status,
      submitAnswer,
      finaliseExam,
      isSubmitting,
      startSession,
      beginFinalizing,
      markDone,
      pendingCount: pending.length,
      examLoadError,
    }),
    [exam, questionsList, answers, sessionMeta, status, submitAnswer, finaliseExam, isSubmitting, startSession, beginFinalizing, markDone, pending, examLoadError]
  );

  return (
    <ExamSessionContext.Provider value={value}>
      {children}
    </ExamSessionContext.Provider>
  );
}

function useExamSession() {
  const ctx = useContext(ExamSessionContext);
  if (!ctx) {
    throw new Error("useExamSession must be used within an ExamSessionProvider>");
  }
  return ctx;
}

export { ExamSessionProvider, useExamSession };
