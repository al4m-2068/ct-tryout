import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { examInfo, questions } from "../data/questions.js";
import {
  STATUS_ANSWERING,
  STATUS_FINALIZING,
  STATUS_DONE,
} from "./examSessionStatus.js";

const ExamSessionContext = createContext(null);
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
  const [exam] = useState(examInfo);
  const [questionsList] = useState(questions);
  const [answers, setAnswers] = useState(() =>
    loadPersistedAnswers(examInfo.code)
  );

  const [sessionMeta, setSessionMeta] = useState(() =>
    loadPersistedSession(examInfo.code)
  );

  const status = sessionMeta ? sessionMeta.status : STATUS_ANSWERING;
  const submitAnswer = useCallback(
    (questionId, optionKey) => {
      setAnswers((prev) => {
        const next = { ...prev, [questionId]: optionKey };
        persistAnswers(examInfo.code, next);
        return next;
      });
    },
    []
  );

  const startSession = useCallback(() => {
    setSessionMeta((prev) => {
      if (prev !== null && prev.status !== STATUS_DONE) {
        return prev;
      }
      const next = {
        sessionId: crypto.randomUUID(),
        startedAt: new Date().toISOString(),
        status: STATUS_ANSWERING,
      };
      persistSession(examInfo.code, next);
      return next;
    });
  }, []);

  const beginFinalizing = useCallback(() => {
    setSessionMeta((prev) => {
      if (!prev) return prev;
      const next = { ...prev, status: STATUS_FINALIZING };
      persistSession(examInfo.code, next);
      return next;
    });
  }, []);

  const markDone = useCallback(() => {
    setSessionMeta((prev) => {
      if (!prev) return prev;
      const next = { ...prev, status: STATUS_DONE };
      persistSession(examInfo.code, next);
      return next;
    });
  }, []);

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
