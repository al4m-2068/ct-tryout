import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getExam, createSession, saveAnswer, submitExam } from "../services/examService.js";
import { cacheExam, getCachedExam, saveAnswerToDb, getUnsyncedAnswers, markAnswerSynced, setSubmitPending, getAnswersForSession, getSubmitPending } from "../db/idb.js";
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
  const syncingPromiseRef = useRef(null);
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
    console.log("[CBT FORENSIC][SYNC START]", {
      code: loadedExamCodeRef.current,
      sessionUuidPresent: !!sessionIdRef.current,
      online: navigator.onLine,
    });

    if (isSyncingRef.current && syncingPromiseRef.current) {
      console.log("[CBT FORENSIC][SYNC GUARD] sync already in-flight — returning shared promise");
      return syncingPromiseRef.current;
    }
    if (isSyncingRef.current) {
      console.log("[CBT FORENSIC][SYNC GUARD] isSyncingRef was true — returning false");
      return Promise.resolve(false);
    }
    if (statusRef.current !== "answering") {
      console.log("[CBT FORENSIC][SYNC GUARD] status !== 'answering' — returning false");
      return false;
    }
    const code = loadedExamCodeRef.current;
    const sessionUuid = sessionIdRef.current;
    if (!code || !sessionUuid) {
      console.log("[CBT FORENSIC][SYNC GUARD] missing code or sessionUuid — returning false", { code, sessionUuid });
      return false;
    }

    isSyncingRef.current = true;

    const syncPromise = (async () => {
      try {

    let idbReadFailed = false;
    let idbReadError = null;
    let toSync;

    try {
      const unsynced = await getUnsyncedAnswers(code);
      toSync = unsynced;
      console.log("[CBT FORENSIC][SYNC SOURCE] IndexedDB", {
        source: "IndexedDB",
        count: unsynced.length,
        questionIds: unsynced.map((u) => u.questionId),
      });
    } catch (idbErr) {
      idbReadFailed = true;
      idbReadError = idbErr;
      const fallback = loadPending(code);
      toSync = fallback.map((p) => ({
        sessionCode: code,
        questionId: p.questionId,
        selectedOption: p.selectedOption,
      }));
      console.log("[CBT FORENSIC][SYNC SOURCE] IndexedDB read failed — using localStorage fallback", {
        source: "localStorage",
        fallbackCount: toSync.length,
        fallbackQuestionIds: toSync.map((f) => f.questionId),
        idbError: idbErr,
      });
    }

    if (toSync.length === 0) {
      console.log("[CBT FORENSIC][SYNC QUEUE EMPTY] — returning true");
      return true;
    }

    let hasErrors = false;
    let saveAnswerCount = 0;
    let markAnswerSyncedCount = 0;
    const attemptedIds = toSync.map((i) => i.questionId);

    for (const item of toSync) {
      console.log("[CBT FORENSIC][LOOP ITEM ENTER]", { questionId: item.questionId, selectedOption: item.selectedOption });

      let saveAnswerSucceeded = false;

      try {
        console.log("[CBT FORENSIC][SAVE ANSWER START]", { questionId: item.questionId });
        await saveAnswer(sessionUuid, item.questionId, item.selectedOption);
        saveAnswerSucceeded = true;
        saveAnswerCount++;

        console.log("[CBT FORENSIC][SAVE ANSWER SUCCESS]", { questionId: item.questionId });
      } catch (saveErr) {
        console.log("[CBT FORENSIC][SAVE ANSWER ERROR]", {
          questionId: item.questionId,
          error: saveErr,
          saveAnswerSucceeded: false,
        });
        hasErrors = true;

      }

      try {
        console.log("[CBT FORENSIC][MARK ANSWER SYNCED START]", { questionId: item.questionId, saveAnswerSucceeded });
        await markAnswerSynced(code, item.questionId);
        markAnswerSyncedCount++;
        console.log("[CBT FORENSIC][MARK ANSWER SYNCED SUCCESS]", { questionId: item.questionId });
      } catch (markErr) {
        console.log("[CBT FORENSIC][MARK ANSWER SYNCED ERROR]", {
          questionId: item.questionId,
          error: markErr,
          saveAnswerSucceededBeforeThisError: saveAnswerSucceeded,
        });
        hasErrors = true;
      }
    }

    console.log("[CBT FORENSIC][SYNC LOOP COMPLETE]", {
      hasErrors,
      attemptedQuestionIds: attemptedIds,
      attemptedCount: attemptedIds.length,
      saveAnswerSuccessCount: saveAnswerCount,
      markAnswerSyncedSuccessCount: markAnswerSyncedCount,
      idbReadFailed,
      idbReadError,
    });

    console.log("[CBT FORENSIC][SYNC RESULT]", { hasErrors, returning: !hasErrors });
    return !hasErrors;
      } finally {
        isSyncingRef.current = false;
      }
    });

    syncingPromiseRef.current = syncPromise;
    return syncPromise;
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
      console.log("[CBT FORENSIC][ONLINE]", {
        online: navigator.onLine,
        status: statusRef.current,
        sessionMeta: sessionMetaRef.current,
        submitPendingLock: submitPendingSyncRef.current,
      });

      if (statusRef.current === "answering") {
        doSyncRef.current?.();
      }
      resumePendingSyncRef.current?.();
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, []);

  const submitPendingSyncRef = useRef(false);
  const resumePendingSyncRef = useRef(null);

  const resumePendingSync = useCallback(() => {
    console.log("[CBT FORENSIC][RESUME ENTER]", {
      online: navigator.onLine,
      status: statusRef.current,
      sessionMeta: sessionMetaRef.current,
      submitPendingLock: submitPendingSyncRef.current,
    });

    if (submitPendingSyncRef.current) {
      console.log("[CBT FORENSIC][GUARD] submitPendingSyncRef was already true — early return");
      return;
    }
    if (statusRef.current !== "answering") {
      console.log("[CBT FORENSIC][GUARD] statusRef !== 'answering' — early return");
      return;
    }
    if (!navigator.onLine) {
      console.log("[CBT FORENSIC][GUARD] navigator.onLine === false — early return");
      return;
    }

    const code = loadedExamCodeRef.current;
    const sessionUuid = sessionIdRef.current;
    if (!code || !sessionUuid) {
      console.log("[CBT FORENSIC][GUARD] missing code or sessionUuid — early return", { code, sessionUuid });
      return;
    }

    submitPendingSyncRef.current = true;
    console.log("[CBT FORENSIC][LOCK ACQUIRED]", { submitPendingLock: submitPendingSyncRef.current });

    (async () => {
      try {
        const allSynced = await syncPendingAnswers();
        console.log("[CBT FORENSIC][SYNC RESULT]", {
          allSynced,
          online: navigator.onLine,
          status: statusRef.current,
          sessionMeta: sessionMetaRef.current,
          submitPendingLock: submitPendingSyncRef.current,
        });

        console.log("[CBT FORENSIC][META AFTER SYNC]", sessionMetaRef.current);

        if (!allSynced) {
          console.log("[CBT FORENSIC][SUBMIT DECISION]", {
            reason: "allSynced === false",
            allSynced,
            submitPending: sessionMetaRef.current?.submitPending,
            online: navigator.onLine,
            status: statusRef.current,
          });
          console.log("[CBT FORENSIC][LOCK RELEASED][!allSynced]", { submitPendingLock: submitPendingSyncRef.current });
          submitPendingSyncRef.current = false;
          return;
        }

        if (!sessionMetaRef.current?.submitPending) {
          console.log("[CBT FORENSIC][SUBMIT DECISION]", {
            reason: "no submitPending intent",
            allSynced,
            submitPending: sessionMetaRef.current?.submitPending,
            online: navigator.onLine,
            status: statusRef.current,
          });
          console.log("[CBT FORENSIC][LOCK RELEASED][no-submit-intent]", { submitPendingLock: submitPendingSyncRef.current });
          submitPendingSyncRef.current = false;
          return;
        }

        console.log("[CBT FORENSIC][SUBMIT DECISION]", {
          reason: "all conditions met — entering submit branch",
          allSynced,
          submitPending: sessionMetaRef.current?.submitPending,
          online: navigator.onLine,
          status: statusRef.current,
        });
        console.log("[CBT FORENSIC][SUBMIT BRANCH ENTERED]");
        console.log("[CBT FORENSIC][SUBMIT REQUEST START]", { sessionUuid, code });
        await submitExam(sessionUuid);
        console.log("[CBT FORENSIC][SUBMIT REQUEST SUCCESS]", { sessionUuid, code });

        setSubmitPending(code, false);
        setSessionMeta((prev) => {
          if (!prev) return prev;
          const safePrev = prev.sessionId != null ? prev : { ...prev };
          const next = { ...safePrev, submitPending: false, status: STATUS_FINALIZING };
          persistSession(code, next);
          return next;
        });
      } catch (err) {
        console.log("[CBT FORENSIC][SUBMIT REQUEST ERROR]", {
          sessionUuid,
          code,
          error: err,
        });
      } finally {
        console.log("[CBT FORENSIC][LOCK RELEASED]", { submitPendingLock: submitPendingSyncRef.current });
        submitPendingSyncRef.current = false;
      }
    })();
  }, []);

  useEffect(() => {
    resumePendingSyncRef.current = resumePendingSync;
  }, [resumePendingSync]);

  useEffect(() => {
    const handle = setTimeout(() => {
      console.log("[CBT FORENSIC][ONLINE][STARTUP]", {
        online: navigator.onLine,
        status: statusRef.current,
        sessionMeta: sessionMetaRef.current,
        submitPendingLock: submitPendingSyncRef.current,
      });

      if (statusRef.current === "answering" && sessionMetaRef.current?.submitPending) {
        resumePendingSyncRef.current?.();
      }
    }, 0);
    return () => clearTimeout(handle);
  }, []);

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
