"use client";

import { useState } from "react";
import { Modal, Field, Select } from "@/components/ui";
import { useAppState } from "@/components/providers/app-state-provider";
import { useToast } from "@/components/providers/toast-provider";
import { useAssistantCtx } from "@/components/assistant/assistant-context";
import type { IssueReport } from "@/lib/types";

type Props = { open: boolean; onClose: () => void };

export function IssueCreateModal({ open, onClose }: Props) {
  const { snapshot, addIssue } = useAppState();
  const { notify } = useToast();
  const { openAssistant } = useAssistantCtx();
  const [title, setTitle] = useState("");
  const [area, setArea] = useState("");
  const [severity, setSeverity] = useState("medium");
  const [errors, setErrors] = useState<Record<string,string>>({});

  function validate() {
    const e: Record<string,string> = {};
    if (!title.trim()) e.title = "Required";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function submit() {
    if (!validate()) return;
    const record: IssueReport = {
      id: crypto.randomUUID(), title: title.trim(), area: area.trim() || "General",
      severity: severity as "low"|"medium"|"high", status: "pending",
      reportedBy: snapshot.membership.userName, mediaCount: 0, attachments: [],
    };
    addIssue(record);
    notify({ title: "Issue reported" });
    onClose(); setTitle(""); setArea(""); setSeverity("medium"); setErrors({});
  }

  return (
    <Modal open={open} onClose={onClose} title="Report issue" footer={
      <>
        <span style={{fontSize:"0.72rem",color:"#a3a3a3",cursor:"pointer"}} onClick={()=>{openAssistant("Report a facility issue: ");onClose();}}>Ask Chertt →</span>
        <button className="button button--primary" onClick={submit} type="button">Report issue</button>
      </>
    }>
      <div className="ui-form-grid">
        <Field label="Title" required error={errors.title}><input className="ui-input" style={{width:"100%"}} value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Generator leak" /></Field>
        <Field label="Severity"><Select value={severity} onChange={e=>setSeverity(e.target.value)} options={[{value:"low",label:"Low"},{value:"medium",label:"Medium"},{value:"high",label:"High"}]} /></Field>
        <Field label="Area"><input className="ui-input" style={{width:"100%"}} value={area} onChange={e=>setArea(e.target.value)} placeholder="e.g. Facilities" /></Field>
      </div>
    </Modal>
  );
}