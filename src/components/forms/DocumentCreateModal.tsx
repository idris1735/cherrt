"use client";

import { useState } from "react";
import { Modal, Field, Select } from "@/components/ui";
import { useAppState } from "@/components/providers/app-state-provider";
import { useToast } from "@/components/providers/toast-provider";
import { useAssistantCtx } from "@/components/assistant/assistant-context";
import type { SmartDocument } from "@/lib/types";

type Props = { open: boolean; onClose: () => void };

export function DocumentCreateModal({ open, onClose }: Props) {
  const { snapshot, upsertDocument } = useAppState();
  const { notify } = useToast();
  const { openAssistant } = useAssistantCtx();
  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState("letter");
  const [body, setBody] = useState("");
  const [amount, setAmount] = useState("");
  const [errors, setErrors] = useState<Record<string,string>>({});

  function validate() {
    const e: Record<string,string> = {};
    if (!title.trim()) e.title = "Required";
    if (!body.trim()) e.body = "Required";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function submit() {
    if (!validate()) return;
    const record: SmartDocument = {
      id: crypto.randomUUID(), title: title.trim(), type: docType as "letter"|"invoice"|"memo",
      body: body.trim(), status: "pending", preparedBy: snapshot.membership.userName,
      amount: docType === "invoice" && amount ? parseFloat(amount) : undefined,
      createdAtLabel: "Just now",
    };
    upsertDocument(record);
    notify({ title: "Document drafted" });
    onClose(); setTitle(""); setBody(""); setDocType("letter"); setAmount(""); setErrors({});
  }

  return (
    <Modal open={open} onClose={onClose} title="Draft document" footer={
      <>
        <span style={{fontSize:"0.72rem",color:"#a3a3a3",cursor:"pointer"}} onClick={()=>{openAssistant("Draft a document: ");onClose();}}>Ask Chertt →</span>
        <button className="button button--primary" onClick={submit} type="button">Save draft</button>
      </>
    }>
      <div className="ui-form-grid">
        <Field label="Title" required error={errors.title}><input className="ui-input" style={{width:"100%"}} value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Vendor letter" /></Field>
        <Field label="Type"><Select value={docType} onChange={e=>setDocType(e.target.value)} options={[{value:"letter",label:"Letter"},{value:"invoice",label:"Invoice"},{value:"memo",label:"Memo"}]} /></Field>
        {docType === "invoice" && <Field label="Amount (₦)"><input className="ui-input" style={{width:"100%"}} type="number" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0" /></Field>}
      </div>
      <Field label="Body" required error={errors.body}><textarea className="ui-textarea" style={{width:"100%",marginTop:"12px"}} rows={5} value={body} onChange={e=>setBody(e.target.value)} placeholder="Document content..." /></Field>
    </Modal>
  );
}