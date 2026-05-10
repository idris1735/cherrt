import { getSupabaseBrowserClient } from "@/lib/services/supabase";
import type { FormDefinition } from "@/lib/types";

export type FormSubmissionStatus = "received" | "reviewed" | "closed";

export type FormSubmission = {
  id: string;
  formId: string;
  submitterName: string;
  submitterContact: string;
  responses: Record<string, string>;
  status: FormSubmissionStatus;
  submittedAt: string;
};

export type FormSubmissionInput = {
  formId: string;
  submitterName: string;
  submitterContact: string;
  responses: Record<string, string>;
  status?: FormSubmissionStatus;
};

type FormSubmissionRow = {
  id: string;
  form_id: string;
  submitter_name: string;
  submitter_contact: string | null;
  responses: Record<string, string> | null;
  status: FormSubmissionStatus;
  submitted_at: string;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(value);
}

function localKey(workspaceId: string, formId: string) {
  return `chertt:form-submissions:${workspaceId}:${formId}`;
}

function readLocal(workspaceId: string, formId: string): FormSubmission[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(localKey(workspaceId, formId));
    return raw ? (JSON.parse(raw) as FormSubmission[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(workspaceId: string, formId: string, submissions: FormSubmission[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(localKey(workspaceId, formId), JSON.stringify(submissions));
}

function mapRow(row: FormSubmissionRow): FormSubmission {
  return {
    id: row.id,
    formId: row.form_id,
    submitterName: row.submitter_name,
    submitterContact: row.submitter_contact ?? "",
    responses: row.responses ?? {},
    status: row.status,
    submittedAt: row.submitted_at,
  };
}

export function parseSubmissionResponses(value: string): Record<string, string> {
  const responses: Record<string, string> = {};

  value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line, index) => {
      const splitAt = line.indexOf(":");
      if (splitAt === -1) {
        responses[`Answer ${index + 1}`] = line;
        return;
      }

      const key = line.slice(0, splitAt).trim();
      const answer = line.slice(splitAt + 1).trim();
      if (key && answer) responses[key] = answer;
    });

  return responses;
}

export function formatSubmissionResponses(responses: Record<string, string>) {
  return Object.entries(responses)
    .map(([key, answer]) => `${key}: ${answer}`)
    .join("\n");
}

export function buildDemoFormSubmissions(form: FormDefinition): FormSubmission[] {
  if (form.submissions <= 0) return [];
  const samples = [
    {
      submitterName: "Ada Okafor",
      submitterContact: "ada@demo.org",
      responses: { Department: "Operations", Request: "Projector booking", Priority: "Medium" },
    },
    {
      submitterName: "Tunde Bello",
      submitterContact: "2348012345678",
      responses: { Department: "Admin", Request: "Visitor pass", Priority: "Low" },
    },
    {
      submitterName: "Mariam Yusuf",
      submitterContact: "mariam@demo.org",
      responses: { Department: "Finance", Request: "Reimbursement note", Priority: "High" },
    },
  ];

  return samples.slice(0, Math.min(samples.length, form.submissions)).map((sample, index) => ({
    id: `demo-${form.id}-${index + 1}`,
    formId: form.id,
    status: index === 0 ? "received" : "reviewed",
    submittedAt: new Date(Date.now() - index * 86_400_000).toISOString(),
    ...sample,
  }));
}

export async function loadFormSubmissions(
  workspaceId: string,
  formId: string,
): Promise<FormSubmission[] | null> {
  if (!isUuid(workspaceId) || !isUuid(formId)) return readLocal(workspaceId, formId);

  const supabase = getSupabaseBrowserClient();
  if (!supabase) return readLocal(workspaceId, formId);

  const { data, error } = await (supabase as any)
    .from("toolkit_form_submissions")
    .select("id, form_id, submitter_name, submitter_contact, responses, status, submitted_at")
    .eq("workspace_id", workspaceId)
    .eq("form_id", formId)
    .order("submitted_at", { ascending: false });

  if (error) return null;
  return ((data ?? []) as FormSubmissionRow[]).map(mapRow);
}

export async function createFormSubmission(
  workspaceId: string,
  input: FormSubmissionInput,
): Promise<FormSubmission | null> {
  const submission: FormSubmission = {
    id: `local-${crypto.randomUUID()}`,
    formId: input.formId,
    submitterName: input.submitterName,
    submitterContact: input.submitterContact,
    responses: input.responses,
    status: input.status ?? "received",
    submittedAt: new Date().toISOString(),
  };

  if (!isUuid(workspaceId) || !isUuid(input.formId)) {
    const next = [submission, ...readLocal(workspaceId, input.formId)];
    writeLocal(workspaceId, input.formId, next);
    return submission;
  }

  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    const next = [submission, ...readLocal(workspaceId, input.formId)];
    writeLocal(workspaceId, input.formId, next);
    return submission;
  }

  const { data, error } = await (supabase as any)
    .from("toolkit_form_submissions")
    .insert({
      workspace_id: workspaceId,
      form_id: input.formId,
      submitter_name: input.submitterName,
      submitter_contact: input.submitterContact,
      responses: input.responses,
      status: input.status ?? "received",
    })
    .select("id, form_id, submitter_name, submitter_contact, responses, status, submitted_at")
    .single();

  if (error || !data) return null;

  const created = mapRow(data as FormSubmissionRow);
  const { count } = await (supabase as any)
    .from("toolkit_form_submissions")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("form_id", input.formId);

  if (typeof count === "number") {
    await (supabase as any).from("toolkit_forms").update({ submissions: count }).eq("id", input.formId);
  }

  return created;
}

export async function updateFormSubmissionStatus(
  workspaceId: string,
  formId: string,
  submissionId: string,
  status: FormSubmissionStatus,
): Promise<boolean> {
  if (!isUuid(workspaceId) || !isUuid(formId) || !isUuid(submissionId)) {
    const next = readLocal(workspaceId, formId).map((submission) =>
      submission.id === submissionId ? { ...submission, status } : submission,
    );
    writeLocal(workspaceId, formId, next);
    return true;
  }

  const supabase = getSupabaseBrowserClient();
  if (!supabase) return false;
  const { error } = await (supabase as any)
    .from("toolkit_form_submissions")
    .update({ status })
    .eq("id", submissionId)
    .eq("workspace_id", workspaceId)
    .eq("form_id", formId);

  return !error;
}
