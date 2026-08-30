import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getExam, createSession, saveAnswer, submitExam } from "../services/examService.js";
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
    return parsed;
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
  const sessionIdRef = useRef(null);
  const statusRef = useRef(STATUS_IDLE);
  const isSyncingRef = useRef(false);
  const loadedExamCodeRef = useRef(FALLBACK_EXAM_CODE);

  useEffect(() => {
    sessionIdRef.current = sessionMeta ? sessionMeta.sessionId : null;
  }, [sessionMeta]);

  useEffect(() => {
    statusRef.current = sessionMeta ? sessionMeta.status : STATUS_IDLE;
  }, [sessionMeta]);

  useEffect(() => {
    let cancelled = false;
    getExam(FALLBACK_EXAM_CODE)
      .then(({ exam: loadedExam, questions: loadedQuestions }) => {
        if (cancelled) return;
        setExam(loadedExam);
        setQuestions(loadedQuestions);
        setLoadedExamCode(loadedExam.code);
      })
      .catch(() => {});
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

  const syncPendingAnswers = useCallback(async (explicitQueue) => {
    if (isSyncingRef.current) return;
    if (statusRef.current !== "answering") return;
    if (!loadedExamCodeRef.current || !sessionIdRef.current) return;

    const sessionUuid = sessionIdRef.current;
    if (!sessionUuid) return;

    const code = loadedExamCodeRef.current;
    const current = explicitQueue !== undefined ? explicitQueue : loadPending(code);
    if (current.length === 0) return;

    isSyncingRef.current = true;
    try {
      const toRemove = [];
      for (const item of current) {
        try {
          await saveAnswer(sessionUuid, item.questionId, item.selectedOption);
          toRemove.push(item.questionId);
        } catch {

        }
      }
      if (toRemove.length > 0) {
        if (explicitQueue === undefined) {
          setPending((prev) => {
            const next = prev.filter((p) => !toRemove.includes(p.questionId));
            persistPending(code, next);
            return next;
          });
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
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
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

      const item = { questionId, selectedOption: optionKey, timestamp: Date.now() };
      const currentQueue = loadPending(code);
      const withoutCurrent = currentQueue.filter(
        (p) => p.questionId !== questionId
      );
      const nextPending = [...withoutCurrent, item];
      persistPending(code, nextPending);
      setPending(nextPending);

      if (statusRef.current === "answering") {
        syncPendingAnswers(nextPending);
      }
    },
    [syncPendingAnswers]
  );

  const applySession = useCallback((backendSession) => {
    const next = {
      sessionId: backendSession.sessionUuid,
      startedAt: backendSession.startedAt,
      status: backendSession.status,
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
      const next = { ...prev, status: STATUS_FINALIZING };
      persistSession(loadedExamCode, next);
      return next;
    });
  }, [loadedExamCode]);

  const markDone = useCallback(() => {
    setSessionMeta((prev) => {
      if (!prev) return prev;
      const next = { ...prev, status: STATUS_DONE };
      persistSession(loadedExamCode, next);
      return next;
    });
  }, [loadedExamCode]);

  /**
   * Orchestrates the full final submission flow:
   * 1. Flush any remaining pending answers to the backend.
   * 2. Call POST /api/exam-sessions/:sessionUuid/submit.
   * 3. On success: transition to finalizing state (countdown → done).
   * 4. On HTTP 409 (already submitted): re-throw so callers can show the conflict.
   * 5. On any other failure: re-throw so callers can show the error.
   *
   * Must NOT be called while isSubmitting is true (concurrent guard).
   */
  const finaliseExam = useCallback(async () => {
    if (isSubmitting) return;
    if (statusRef.current !== "answering") return;

    const sessionUuid = sessionIdRef.current;
    if (!sessionUuid) return;

    setIsSubmitting(true);
    try {
      await syncPendingAnswers();
      await submitExam(sessionUuid);
      beginFinalizing();
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
    }),
    [exam, questionsList, answers, sessionMeta, status, submitAnswer, finaliseExam, isSubmitting, startSession, beginFinalizing, markDone, pending]
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
