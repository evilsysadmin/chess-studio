import { useState } from 'react';
import {
  deleteAdminFeedback,
  replyAdminFeedback,
  submitFeedback,
  updateAdminFeedbackStatus,
} from '../feedback.js';

export default function useAdminFeedbackController({ setFeedback, setFeedbackError, invalidateAdminData }) {
  const [feedbackUpdating, setFeedbackUpdating] = useState(null);
  const [feedbackTestCreating, setFeedbackTestCreating] = useState(false);
  const [feedbackDeleteCandidate, setFeedbackDeleteCandidate] = useState(null);
  const [feedbackReplies, setFeedbackReplies] = useState({});

  async function handleFeedbackStatus(feedbackId, status) {
    invalidateAdminData();
    setFeedbackUpdating(feedbackId);
    setFeedbackError(null);
    try {
      const result = await updateAdminFeedbackStatus(feedbackId, status);
      setFeedback((current) => (current || []).map((item) => item.id === feedbackId ? result.feedback : item));
    } catch (error) {
      setFeedbackError(error?.message || 'No se pudo actualizar el feedback.');
    } finally {
      setFeedbackUpdating(null);
    }
  }

  async function handleFeedbackReply(feedbackId, resolve = false) {
    const message = String(feedbackReplies[feedbackId] || '').trim();
    if (!message || feedbackUpdating) return;
    invalidateAdminData();
    setFeedbackUpdating(feedbackId);
    setFeedbackError(null);
    try {
      const result = await replyAdminFeedback(feedbackId, message, resolve);
      setFeedback((current) => (current || []).map((item) => item.id === feedbackId ? result.feedback : item));
      setFeedbackReplies((current) => ({ ...current, [feedbackId]: '' }));
    } catch (error) {
      setFeedbackError(error?.message || 'No se pudo responder al feedback.');
    } finally {
      setFeedbackUpdating(null);
    }
  }

  async function handleCreateTestFeedback() {
    if (feedbackTestCreating) return;
    setFeedbackTestCreating(true);
    setFeedbackError(null);
    try {
      const result = await submitFeedback({
        category: 'general',
        message: 'Feedback de prueba generado desde Admin.',
        context: 'Admin · prueba',
      });
      if (result?.feedback) setFeedback((current) => [result.feedback, ...(current || [])]);
    } catch (error) {
      setFeedbackError(error?.message || 'No se pudo crear el feedback de prueba.');
    } finally {
      setFeedbackTestCreating(false);
    }
  }

  async function confirmFeedbackDelete() {
    const feedbackId = feedbackDeleteCandidate;
    if (!feedbackId || feedbackUpdating) return;
    setFeedbackDeleteCandidate(null);
    invalidateAdminData();
    setFeedbackUpdating(feedbackId);
    setFeedbackError(null);
    try {
      await deleteAdminFeedback(feedbackId);
      setFeedback((current) => (current || []).filter((item) => item.id !== feedbackId));
      setFeedbackReplies((current) => {
        const next = { ...current };
        delete next[feedbackId];
        return next;
      });
    } catch (error) {
      setFeedbackError(error?.message || 'No se pudo borrar el feedback.');
    } finally {
      setFeedbackUpdating(null);
    }
  }

  function setFeedbackReply(feedbackId, value) {
    setFeedbackReplies((current) => ({ ...current, [feedbackId]: value }));
  }

  function requestFeedbackDelete(feedbackId) {
    if (!feedbackUpdating) setFeedbackDeleteCandidate(feedbackId);
  }

  return {
    feedbackUpdating,
    feedbackTestCreating,
    feedbackDeleteCandidate,
    feedbackReplies,
    dismissFeedbackDelete: () => setFeedbackDeleteCandidate(null),
    setFeedbackReply,
    requestFeedbackDelete,
    handleFeedbackReply,
    handleFeedbackStatus,
    handleCreateTestFeedback,
    confirmFeedbackDelete,
  };
}
