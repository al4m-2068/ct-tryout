/**
 * Raw IndexedDB infrastructure for EduOS CBT.
 * Database: eduos-cbt-db  |  Version: 4
 *
 * Stores:
 *   - exams   : cached exam metadata + questions, keyed by exam code
 *   - answers : per-question answer records, keyed by flat id "${sessionCode}_${questionId}"
 *               includes a synced flag for server-confirmation tracking
 */

const DB_NAME = "eduos-cbt-db";
const DB_VERSION = 4;
function wrap(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function wrapVoid(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function openDB() {
  const request = indexedDB.open(DB_NAME, DB_VERSION);

  request.onupgradeneeded = (event) => {
    const db = event.target.result;
    const oldVersion = event.oldVersion;
    if (!db.objectStoreNames.contains("exams")) {
      const store = db.createObjectStore("exams", { keyPath: "code" });
      store.createIndex("cachedAt", "cachedAt", { unique: false });
    }

    if (oldVersion < 4) {
      if (db.objectStoreNames.contains("answers")) {
        db.deleteObjectStore("answers");
      }
      const answersStore = db.createObjectStore("answers", { keyPath: "id" });
      answersStore.createIndex("sessionCode", "sessionCode", { unique: false });
      answersStore.createIndex("synced", "synced", { unique: false });
    }
  };

  return wrap(request);
}

/**
 * @param {object} payload  — { exam, questions }
 */
export async function cacheExam(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("cacheExam: payload must be a non-null object");
  }

  const { exam } = payload;
  if (!exam || typeof exam.code !== "string" || exam.code.trim() === "") {
    throw new Error("cacheExam: payload.exam.code must be a non-empty string");
  }

  if (!Array.isArray(payload.questions)) {
    throw new Error("cacheExam: payload.questions must be an array");
  }

  const db = await openDB();
  const tx = db.transaction("exams", "readwrite");
  const store = tx.objectStore("exams");
  const record = {
    code: exam.code,
    title: exam.title,
    durationMinutes: exam.durationMinutes,
    totalQuestions: exam.totalQuestions,
    questions: payload.questions,
    cachedAt: Date.now(),
  };

  await wrapVoid(store.put(record));
  await wrap(tx.complete);
}

/**
 * Retrieves a cached exam from IndexedDB.
 *
 * Returns the same contract shape as `getExam()`:
 *   { exam: { code, title, durationMinutes, totalQuestions }, questions: [...] }
 *
 * Returns `null` if no record exists for the given code.
 *
 * @param {string} code  — exam code (e.g. "MTK-101")
 * @returns {Promise<{ exam: object, questions: Array } | null>}
 */
export async function getCachedExam(code) {
  if (typeof code !== "string" || code.trim() === "") {
    throw new Error("getCachedExam: code must be a non-empty string");
  }

  const db = await openDB();
  const tx = db.transaction("exams", "readonly");
  const store = tx.objectStore("exams");
  const record = await wrap(store.get(code.trim()));
  await tx.complete;

  if (!record) {
    return null;
  }

  return {
    exam: {
      code: record.code,
      title: record.title,
      durationMinutes: record.durationMinutes,
      totalQuestions: record.totalQuestions,
    },
    questions: record.questions,
  };
}

/**
 * @param {string} sessionCode   - the exam/session identifier (e.g. "MTK-101")
 * @param {number} questionId    - the question id
 * @param {string} selectedOption - the chosen option key (e.g. "A", "B", "C", "D")
 * @param {boolean} synced       - whether this record has been confirmed by the server
 */
export async function saveAnswerToDb(sessionCode, questionId, selectedOption, synced = false) {
  if (typeof sessionCode !== "string" || sessionCode.trim() === "") {
    throw new Error("saveAnswerToDb: sessionCode must be a non-empty string");
  }

  const id = Number(questionId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("saveAnswerToDb: questionId must be a positive integer");
  }
  if (typeof selectedOption !== "string" || selectedOption.trim() === "") {
    throw new Error("saveAnswerToDb: selectedOption must be a non-empty string");
  }

  const db = await openDB();
  const tx = db.transaction("answers", "readwrite");
  const store = tx.objectStore("answers");
  const recordId = `${sessionCode}_${id}`;

  await wrapVoid(store.put({
    id: recordId,
    sessionCode,
    questionId: id,
    selectedOption: selectedOption.trim(),
    timestamp: Date.now(),
    synced: Boolean(synced),
  }));
  await wrap(tx.complete);
}

/**
 * Retrieves all answer records for a given session/exam.
 *
 * Returns an array of answer objects:
 *   [{ sessionCode, questionId, selectedOption, timestamp, synced }, ...]
 *
 * @param {string} sessionCode - the exam/session identifier (e.g. "MTK-101")
 * @returns {Promise<Array>}
 */
export async function getAnswersForSession(sessionCode) {
  if (typeof sessionCode !== "string" || sessionCode.trim() === "") {
    throw new Error("getAnswersForSession: sessionCode must be a non-empty string");
  }

  const db = await openDB();
  const tx = db.transaction("answers", "readonly");
  const store = tx.objectStore("answers");
  const index = store.index("sessionCode");
  const target = sessionCode.trim();

  const records = await wrap(index.getAll(target));
  await tx.complete;

  return records.filter((r) => r.sessionCode === target);
}

/**
 * Returns all answer records for a session that have NOT yet been synced to the server.
 *
 * @param {string} sessionCode - the exam/session identifier (e.g. "MTK-101")
 * @returns {Promise<Array>}  — unsynced answer records
 */
export async function getUnsyncedAnswers(sessionCode) {
  if (typeof sessionCode !== "string" || sessionCode.trim() === "") {
    throw new Error("getUnsyncedAnswers: sessionCode must be a non-empty string");
  }

  const db = await openDB();
  const tx = db.transaction("answers", "readonly");
  const store = tx.objectStore("answers");
  const index = store.index("sessionCode");
  const target = sessionCode.trim();

  const records = await wrap(index.getAll(target));
  await tx.complete;

  return records.filter((r) => r.sessionCode === target && r.synced === false);
}

/**
 * Marks a single answer record as synced: true after confirmed server persistence.
 * Does NOT delete the record — IndexedDB retains the answer for offline recovery.
 *
 * @param {string} sessionCode
 * @param {number} questionId  — will be coerced to integer
 */
export async function markAnswerSynced(sessionCode, questionId) {
  if (typeof sessionCode !== "string" || sessionCode.trim() === "") {
    throw new Error("markAnswerSynced: sessionCode must be a non-empty string");
  }
  const id = Number(questionId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("markAnswerSynced: questionId must be a positive integer");
  }

  const db = await openDB();
  const tx = db.transaction("answers", "readwrite");
  const store = tx.objectStore("answers");
  const recordId = `${sessionCode}_${id}`;

  const record = await wrap(store.get(recordId));
  if (!record) {
    await tx.complete;
    return;
  }

  record.synced = true;
  await wrapVoid(store.put(record));
  await wrap(tx.complete);
}


/**
 * Persists a submit-pending flag alongside the session metadata in localStorage.
 * This is a thin wrapper over the existing localStorage session model — it reads
 * the current session object, sets submitPending, and writes it back.
 *
 * @param {string} code        — exam code (e.g. "MTK-101")
 * @param {boolean} value     — true = submit intent is pending, false = clear
 */
export function setSubmitPending(code, value) {
  try {
    const raw = localStorage.getItem(`eduos.cbt.exam.${code}.session`);
    if (raw === null) return;
    const session = JSON.parse(raw);
    if (!session || typeof session !== "object") return;
    session.submitPending = value === true;
    localStorage.setItem(`eduos.cbt.exam.${code}.session`, JSON.stringify(session));
  } catch {}
}

/**
 * Reads the submit-pending flag from the localStorage session object.
 *
 * @param {string} code — exam code (e.g. "MTK-101")
 * @returns {boolean}
 */
export function getSubmitPending(code) {
  try {
    const raw = localStorage.getItem(`eduos.cbt.exam.${code}.session`);
    if (raw === null) return false;
    const session = JSON.parse(raw);
    if (!session || typeof session !== "object") return false;
    return session.submitPending === true;
  } catch {
    return false;
  }
}
