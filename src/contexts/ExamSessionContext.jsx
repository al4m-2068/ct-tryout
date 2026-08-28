import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getExam } from "../services/examService.js";
import {
  STATUS_IDLE,
  STATUS_ANSWERING,
  STATUS_FINALIZING,
  STATUS_DONE,
} from "./examSessionStatus.js";

const ExamSessionContext = createContext(null);

/**
 * Default exam code used to derive localStorage keys before the exam has been
 * loaded. This value must remain stable so that localStorage data created
 * under one version is readable under the next.
 *
 * When the real backend is integrated, the exam code will come from the
 * server response. This constant is the safe fallback for the mock layer.
 */
const FALLBACK_EXAM_CODE = "MTK-101";

const makeAnswersKey  = (code) => `eduos.cbt.exam.${code}.answers`;
const makeSessionKey  = (code) => `eduos.cbt.exam.${code}.session`;

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
  } catch {

  }
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
  } catch {

  }
}

function ExamSessionProvider({ children }) {
  const [exam, setExam] = useState(null);
  const [questionsList, setQuestions] = useState(null);
  const [loadedExamCode, setLoadedExamCode] = useState(FALLBACK_EXAM_CODE);

  const [answers, setAnswers] = useState(() =>
    loadPersistedAnswers(loadedExamCode)
  );

  const [sessionMeta, setSessionMeta] = useState(() =>
    loadPersistedSession(loadedExamCode)
  );

  useEffect(() => {
    let cancelled = false;

    getExam(FALLBACK_EXAM_CODE)
      .then(({ exam: loadedExam, questions: loadedQuestions }) => {
        if (cancelled) return;
        setExam(loadedExam);
        setQuestions(loadedQuestions);
        setLoadedExamCode(loadedExam.code);
      })
      .catch(() => {

      });

    return () => {
      cancelled = true;
    };
  }, []);

  const status = sessionMeta ? sessionMeta.status : STATUS_IDLE;

  const submitAnswer = useCallback(
    (questionId, optionKey) => {
      setAnswers((prev) => {
        const next = { ...prev, [questionId]: optionKey };
        persistAnswers(loadedExamCode, next);
        return next;
      });
    },
    [loadedExamCode]
  );

  const startSession = useCallback(() => {
    setSessionMeta((prev) => {
      if (prev !== null) return prev;
      const next = {
        sessionId: crypto.randomUUID(),
        startedAt: new Date().toISOString(),
        status: STATUS_ANSWERING,
      };
      persistSession(loadedExamCode, next);
      return next;
    });
  }, [loadedExamCode]);

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

  const value = useMemo(
    () => ({
      exam,
      questions: questionsList,
      answers,
      sessionId: sessionMeta ? sessionMeta.sessionId : null,
      startedAt:  sessionMeta ? sessionMeta.startedAt  : null,
      status,
      submitAnswer,
      startSession,
      beginFinalizing,
      markDone,
    }),
    [exam, questionsList, answers, sessionMeta, status, submitAnswer, startSession, beginFinalizing, markDone]
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
    throw new Error(
      "useExamSession must be used within <ExamSessionProvider>"
    );
  }
  return ctx;
}

export { ExamSessionProvider, useExamSession };
